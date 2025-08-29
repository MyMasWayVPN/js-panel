import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Docker from 'dockerode';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const upload = multer({ dest: '/tmp' });
// Serve frontend React build
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.json());
app.use(cors());
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false
}));

function authRequired(req,res,next){
  if(req.session && req.session.user) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// Helper function to get container data directory
async function getContainerDataDir(containerName) {
  try {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();
    const dataDir = info.Config.Labels?.['panel.data-dir'];
    
    if (dataDir && fs.existsSync(dataDir)) {
      return dataDir;
    } else {
      // Fallback to old method for existing containers
      const fallbackDir = path.join(process.env.DATA_DIR || '/opt/js-data', containerName);
      
      // Create directory if it doesn't exist (for old containers)
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
        
        // Copy helper scripts for old containers
        const root = path.resolve('./');
        ['entrypoint.sh','tunnel-on.sh','tunnel-off.sh','run.js'].forEach(f=>{
          const src = path.join(root, f);
          const dest = path.join(fallbackDir, f);
          try{ 
            if(fs.existsSync(src)) {
              // Always copy entrypoint.sh to ensure latest version
              if(f === 'entrypoint.sh' || !fs.existsSync(dest)) {
                fs.copyFileSync(src, dest);
                console.log(`Copied ${f} to container directory`);
              }
            }
          }catch(e){
            console.warn(`Failed to copy ${f}:`, e.message);
          }
        });
        
        // Make entrypoint executable
        try{ 
          fs.chmodSync(path.join(fallbackDir,'entrypoint.sh'), 0o755); 
        }catch(e){
          console.warn('Failed to make entrypoint.sh executable:', e.message);
        }
      }
      
      return fallbackDir;
    }
  } catch (e) {
    // If container doesn't exist, use fallback
    const fallbackDir = path.join(process.env.DATA_DIR || '/opt/js-data', containerName);
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return fallbackDir;
  }
}

// Auth
app.post('/api/login', (req,res)=>{
  const { username, password } = req.body;
  if(username === process.env.PANEL_USER && password === process.env.PANEL_PASS){
    req.session.user = username;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'invalid' });
});

app.post('/api/logout', authRequired, (req,res)=>{
  req.session.destroy(()=>{});
  res.json({ ok: true });
});

// List containers
app.get('/api/containers', authRequired, async (req,res)=>{
  const list = await docker.listContainers({ all: true });
  res.json(list);
});

// Create container
app.post('/api/containers', authRequired, async (req,res)=>{
  try{
    const { name, startupCmd, cfEnable, cfToken } = req.body;
    const DATA_DIR = process.env.DATA_DIR || '/opt/js-data';
    
    // Check if container with this name already exists
    try {
      const existingContainer = docker.getContainer(name);
      const info = await existingContainer.inspect();
      return res.status(400).json({ error: `Container with name '${name}' already exists` });
    } catch (e) {
      // Container doesn't exist, continue with creation
    }
    
    // Generate unique container ID
    const containerId = `container_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const containerDir = path.join(DATA_DIR, containerId);
    
    // Create container-specific directory
    console.log(`Creating container directory: ${containerDir}`);
    fs.mkdirSync(containerDir, { recursive: true });
    
    // Copy helper scripts from project root (installer places them in /opt/js-panel)
    const root = path.resolve('../'); // Go up one level from backend to project root
    console.log(`Looking for helper scripts in: ${root}`);
    
    const requiredFiles = ['entrypoint.sh', 'run.js'];
    let copiedFiles = 0;
    
    requiredFiles.forEach(f=>{
      const src = path.join(root, f);
      const dest = path.join(containerDir, f);
      
      console.log(`Checking for ${f} at: ${src}`);
      
      try{ 
        if(fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
          console.log(`✓ Copied ${f} to container directory`);
          copiedFiles++;
          
          // Make entrypoint.sh executable
          if(f === 'entrypoint.sh') {
            fs.chmodSync(dest, 0o755);
            console.log(`✓ Made ${f} executable`);
          }
        } else {
          console.warn(`✗ ${f} not found at ${src}`);
        }
      }catch(e){
        console.error(`✗ Failed to copy ${f}:`, e.message);
      }
    });
    
    // Create default application files if no run.js was copied
    if (!fs.existsSync(path.join(containerDir, 'run.js'))) {
      console.log('Creating default application files...');
      
      // Create package.json
      const packageJson = {
        "name": "default-container-app",
        "version": "1.0.0",
        "main": "run.js",
        "scripts": {
          "start": "node run.js"
        },
        "dependencies": {}
      };
      
      fs.writeFileSync(
        path.join(containerDir, 'package.json'), 
        JSON.stringify(packageJson, null, 2)
      );
      console.log('✓ Created package.json');
      
      // Create run.js - Simple console logging script
      const runJsContent = `console.log('=========================================');
console.log('SIMPLE CONTAINER APPLICATION STARTED');
console.log('=========================================');
console.log('Container ID:', process.env.CONTAINER_ID || 'unknown');
console.log('Node.js Version:', process.version);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
console.log('Working Directory:', process.cwd());
console.log('Started at:', new Date().toISOString());
console.log('=========================================');

let counter = 1;

// Simple interval to keep container running and show it's alive
const interval = setInterval(() => {
  console.log(\`[\${new Date().toISOString()}] Container is running - Message #\${counter}\`);
  console.log(\`  - Container ID: \${process.env.CONTAINER_ID || 'unknown'}\`);
  console.log(\`  - Uptime: \${counter * 10} seconds\`);
  console.log(\`  - Memory Usage: \${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB\`);
  counter++;
}, 10000); // Every 10 seconds

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('=========================================');
  console.log('[SHUTDOWN] Received SIGTERM signal');
  console.log('[SHUTDOWN] Cleaning up...');
  clearInterval(interval);
  console.log('[SHUTDOWN] Container stopped gracefully');
  console.log('=========================================');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('=========================================');
  console.log('[SHUTDOWN] Received SIGINT signal');
  console.log('[SHUTDOWN] Cleaning up...');
  clearInterval(interval);
  console.log('[SHUTDOWN] Container stopped gracefully');
  console.log('=========================================');
  process.exit(0);
});

console.log('Simple container application is now running...');
console.log('This script will print a message every 10 seconds');
console.log('Press Ctrl+C to stop');
`;
      
      fs.writeFileSync(path.join(containerDir, 'run.js'), runJsContent);
      console.log('✓ Created run.js');
      copiedFiles++;
    }
    
    console.log(`Container setup complete. Files copied: ${copiedFiles}/${requiredFiles.length + 1}`);
    console.log(`Container directory contents:`, fs.readdirSync(containerDir));
    
    const image = "ghcr.io/pelican-eggs/yolks:nodejs_20";
    
    // Check if image exists, if not pull it
    try {
      await docker.getImage(image).inspect();
    } catch (e) {
      // Image doesn't exist, pull it
      console.log(`Pulling Docker image: ${image}`);
      await new Promise((resolve, reject) => {
        docker.pull(image, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err, output) => {
            if (err) return reject(err);
            console.log(`Successfully pulled image: ${image}`);
            resolve(output);
          });
        });
      });
    }
    
    // Verify entrypoint.sh exists before creating container
    const entrypointPath = path.join(containerDir, 'entrypoint.sh');
    if (!fs.existsSync(entrypointPath)) {
      throw new Error(`entrypoint.sh not found in container directory: ${containerDir}`);
    }
    
    console.log('Creating Docker container with configuration:');
    console.log(`- Name: ${name}`);
    console.log(`- Image: ${image}`);
    console.log(`- Mount: ${containerDir}:/home/container`);
    console.log(`- Startup CMD: ${startupCmd || 'node run.js'}`);
    
    const container = await docker.createContainer({
      name,
      Image: `${image}`,
      Tty: true,
      HostConfig: {
        Binds: [`${containerDir}:/home/container`],
        RestartPolicy: { Name: 'unless-stopped' }
      },
      WorkingDir: '/home/container',
      Env: [
        `STARTUP_CMD=${startupCmd || 'node run.js'}`,
        `CF_TUNNEL_ENABLE=${cfEnable ? '1':'0'}`,
        `CF_TOKEN=${cfToken || ''}`,
        `CONTAINER_ID=${containerId}`
      ],
      Cmd: ['bash', '/home/container/entrypoint.sh'],
      Labels: { 
        'panel.kind': 'js-panel',
        'panel.container-id': containerId,
        'panel.data-dir': containerDir
      }
    });
    
    await container.start();
    
    res.json({ 
      ok: true, 
      containerId: containerId,
      dataDir: containerDir 
    });
  }catch(e){
    res.status(500).json({ error: e.message });
  }
});

// Start/Stop/Restart/Delete
app.post('/api/containers/:id/:action', authRequired, async (req,res)=>{
  try{
    const c = docker.getContainer(req.params.id);
    const a = req.params.action;
    if(a==='start') await c.start();
    else if(a==='stop') await c.stop();
    else if(a==='restart') await c.restart();
    else if(a==='delete'){ await c.remove({ force:true }); }
    else return res.status(400).json({ error:'unknown' });
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Inspect container (get env)
app.get('/api/containers/:id/inspect', authRequired, async (req,res)=>{
  try{
    const info = await docker.getContainer(req.params.id).inspect();
    res.json(info);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Get container env simplified
app.get('/api/containers/:id/env', authRequired, async (req,res)=>{
  try{
    const info = await docker.getContainer(req.params.id).inspect();
    const env = {};
    (info.Config.Env||[]).forEach(e=>{ const i = e.indexOf('='); env[e.slice(0,i)] = e.slice(i+1); });
    res.json(env);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Update settings (recreate container with new env)
app.post('/api/containers/:id/settings', authRequired, async (req,res)=>{
  try{
    const { STARTUP_CMD, CF_TUNNEL_ENABLE, CF_TOKEN } = req.body;
    const old = docker.getContainer(req.params.id);
    const info = await old.inspect();
    const name = info.Name.replace(/^\//,'');
    const mounts = (info.HostConfig?.Binds||[]);
    const image = info.Config.Image;
    
    // Check if image exists, if not pull it
    try {
      await docker.getImage(image).inspect();
    } catch (e) {
      // Image doesn't exist, pull it
      console.log(`Pulling Docker image: ${image}`);
      await new Promise((resolve, reject) => {
        docker.pull(image, (err, stream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err, output) => {
            if (err) return reject(err);
            console.log(`Successfully pulled image: ${image}`);
            resolve(output);
          });
        });
      });
    }
    
    // Ensure data directory exists before recreating container
    await getContainerDataDir(name);
    
    // stop and remove old
    try{ await old.stop(); }catch(e){}
    await old.remove({ force:true });
    
    // Prepare labels - migrate old containers to new system if needed
    let labels = info.Config.Labels || { 'panel.kind':'js-panel' };
    if (!labels['panel.data-dir']) {
      const dataDir = path.join(process.env.DATA_DIR || '/opt/js-data', name);
      labels['panel.data-dir'] = dataDir;
      labels['panel.container-id'] = name; // Use name as ID for old containers
    }
    
    // create new with same mounts
    const container = await docker.createContainer({
      name,
      Image: image,
      Tty: true,
      HostConfig: { 
        Binds: mounts,
        RestartPolicy: { Name: 'unless-stopped' }
      },
      WorkingDir: info.Config.WorkingDir || '/home/container',
      Env: [
        `STARTUP_CMD=${STARTUP_CMD || 'node run.js'}`,
        `CF_TUNNEL_ENABLE=${CF_TUNNEL_ENABLE ? '1':'0'}`,
        `CF_TOKEN=${CF_TOKEN || ''}`,
        `CONTAINER_ID=${labels['panel.container-id']}`
      ],
      Cmd: ['bash','/entrypoint.sh'],
      Labels: labels
    });
    await container.start();
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Migrate old container to new system
app.post('/api/containers/:id/migrate', authRequired, async (req,res)=>{
  try{
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    const name = info.Name.replace(/^\//,'');
    
    // Check if already migrated
    if (info.Config.Labels?.['panel.data-dir']) {
      return res.json({ ok: true, message: 'Container already migrated' });
    }
    
    // Ensure data directory exists
    const dataDir = await getContainerDataDir(name);
    
    // Stop container
    try{ await container.stop(); }catch(e){}
    await container.remove({ force:true });
    
    // Recreate with new labels
    const newContainer = await docker.createContainer({
      name,
      Image: info.Config.Image,
      Tty: true,
      HostConfig: { 
        Binds: [`${dataDir}:/home/container`],
        RestartPolicy: { Name: 'unless-stopped' }
      },
      WorkingDir: '/home/container',
      Env: info.Config.Env || [],
      Cmd: info.Config.Cmd || ['bash','/entrypoint.sh'],
      Labels: { 
        'panel.kind': 'js-panel',
        'panel.container-id': name,
        'panel.data-dir': dataDir
      }
    });
    
    await newContainer.start();
    res.json({ ok: true, message: 'Container migrated successfully' });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// File manager: list/upload/download/delete/write
app.get('/api/containers/:name/files', authRequired, async (req,res)=>{
  try{
    const dir = await getContainerDataDir(req.params.name);
    if(!fs.existsSync(dir)) return res.json([]);
    const items = fs.readdirSync(dir).map(n=>{ const p=path.join(dir,n); const s=fs.lstatSync(p); return { name:n, isDir:s.isDirectory(), size:s.size }; });
    res.json(items);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.get('/api/containers/:name/files/download', authRequired, async (req,res)=>{
  try{
    const dir = await getContainerDataDir(req.params.name);
    const p = path.join(dir, req.query.path || '');
    res.download(p);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.post('/api/containers/:name/files/upload', authRequired, upload.single('file'), async (req,res)=>{
  try{
    const dir = await getContainerDataDir(req.params.name);
    const dest = path.join(dir, req.body.dest || req.file.originalname);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(req.file.path, dest);
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.post('/api/containers/:name/files/write', authRequired, async (req,res)=>{
  try{
    const dir = await getContainerDataDir(req.params.name);
    const p = path.join(dir, req.body.path);
    fs.writeFileSync(p, req.body.content||'', 'utf8');
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.delete('/api/containers/:name/files', authRequired, async (req,res)=>{
  try{
    const dir = await getContainerDataDir(req.params.name);
    const filePath = req.query.path;
    
    // Prevent deleting if no path specified or trying to delete root
    if (!filePath || filePath === '.' || filePath === '/' || filePath === '') {
      return res.status(400).json({ error: 'Cannot delete root directory or empty path' });
    }
    
    const fullPath = path.join(dir, filePath);
    
    // Ensure the path is within the container directory (security check)
    if (!fullPath.startsWith(dir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    // Check if file/directory exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File or directory not found' });
    }
    
    console.log(`Deleting file/directory: ${fullPath}`);
    fs.rmSync(fullPath, { recursive: true, force: true });
    res.json({ ok: true });
  }catch(e){ 
    console.error('Delete file error:', e.message);
    res.status(500).json({ error: e.message }); 
  }
});

// Extract archive file
app.post('/api/containers/:name/files/extract', authRequired, async (req,res)=>{
  try{
    const { filePath, extractTo } = req.body;
    const containerDir = await getContainerDataDir(req.params.name);
    const fullFilePath = path.join(containerDir, filePath);
    const fullExtractPath = path.join(containerDir, extractTo || '.');
    
    // Ensure extract directory exists
    fs.mkdirSync(fullExtractPath, { recursive: true });
    
    // Determine extraction command based on file extension
    const ext = filePath.toLowerCase();
    let extractCmd;
    
    if (ext.endsWith('.zip')) {
      extractCmd = `cd "${fullExtractPath}" && unzip -o "${fullFilePath}"`;
    } else if (ext.endsWith('.tar.gz') || ext.endsWith('.tgz')) {
      extractCmd = `cd "${fullExtractPath}" && tar -xzf "${fullFilePath}"`;
    } else if (ext.endsWith('.tar')) {
      extractCmd = `cd "${fullExtractPath}" && tar -xf "${fullFilePath}"`;
    } else if (ext.endsWith('.gz')) {
      extractCmd = `cd "${fullExtractPath}" && gunzip -c "${fullFilePath}" > "${path.basename(filePath, '.gz')}"`;
    } else if (ext.endsWith('.rar')) {
      extractCmd = `cd "${fullExtractPath}" && unrar x "${fullFilePath}"`;
    } else {
      return res.status(400).json({ error: 'Unsupported archive format' });
    }
    
    // Execute extraction command
    const { exec } = await import('child_process');
    exec(extractCmd, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.json({ success: true, output: stdout || stderr });
    });
    
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Compress files/folders
app.post('/api/containers/:name/files/compress', authRequired, async (req,res)=>{
  try{
    const { items, archiveName, archiveType = 'zip' } = req.body;
    const containerDir = await getContainerDataDir(req.params.name);
    
    // Build compression command
    let compressCmd;
    const itemsList = items.map(item => `"${item}"`).join(' ');
    const outputFile = `${archiveName}.${archiveType}`;
    
    switch (archiveType) {
      case 'zip':
        compressCmd = `cd "${containerDir}" && zip -r "${outputFile}" ${itemsList}`;
        break;
      case 'tar':
        compressCmd = `cd "${containerDir}" && tar -cf "${outputFile}" ${itemsList}`;
        break;
      case 'tar.gz':
        compressCmd = `cd "${containerDir}" && tar -czf "${outputFile}" ${itemsList}`;
        break;
      default:
        return res.status(400).json({ error: 'Unsupported archive type' });
    }
    
    // Execute compression command
    const { exec } = await import('child_process');
    exec(compressCmd, (error, stdout, stderr) => {
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.json({ success: true, output: stdout || stderr, archiveName: outputFile });
    });
    
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Create file
app.post('/api/containers/:name/files/create-file', authRequired, async (req,res)=>{
  try{
    const { path: filePath } = req.body;
    const containerDir = await getContainerDataDir(req.params.name);
    const fullPath = path.join(containerDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, '', 'utf8');
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Create folder
app.post('/api/containers/:name/files/create-folder', authRequired, async (req,res)=>{
  try{
    const { path: folderPath } = req.body;
    const containerDir = await getContainerDataDir(req.params.name);
    const fullPath = path.join(containerDir, folderPath);
    fs.mkdirSync(fullPath, { recursive: true });
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Serve frontend static build (if exists)
app.use(express.static(path.join(__dirname, "../frontend/dist")));
app.get("/", (_, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
});

const port = process.env.PORT || 8080;
const server = app.listen(port, "0.0.0.0", ()=> console.log('Backend listening on', port));
const wss = new WebSocketServer({ server, path: '/ws/logs' });

wss.on('connection', async (ws, req) => {
  try{
    const url = new URL(req.url, 'http://x');
    const id = url.searchParams.get('id');
    if(!id){ ws.close(); return; }
    
    const container = docker.getContainer(id);
    const stream = await container.logs({ follow:true, stdout:true, stderr:true, tail:150 });
    
    let logBuffer = [];
    const maxLines = 150;
    
    stream.on('data', chunk => { 
      try{ 
        const logData = chunk.toString();
        const lines = logData.split('\n').filter(line => line.trim());
        
        // Add new lines to buffer
        logBuffer.push(...lines);
        
        // Keep only last 150 lines
        if (logBuffer.length > maxLines) {
          logBuffer = logBuffer.slice(-maxLines);
        }
        
        // Send the new log data
        ws.send(logData);
      }catch(e){
        console.error('WebSocket send error:', e.message);
      } 
    });
    
    ws.on('close', ()=> {
      try {
        stream.destroy();
      } catch(e) {
        console.error('Stream destroy error:', e.message);
      }
    });
    
  }catch(e){ 
    console.error('WebSocket connection error:', e.message);
    ws.close(); 
  }
});
