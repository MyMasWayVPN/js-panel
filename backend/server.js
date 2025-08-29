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

dotenv.config();
const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const upload = multer({ dest: '/tmp' });

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
    const dir = path.join(DATA_DIR, name);
    fs.mkdirSync(dir, { recursive: true });
    // copy helper scripts from repo root if present in backend root (installer will place them)
    const root = path.resolve('./');
    ['entrypoint.sh','tunnel-on.sh','tunnel-off.sh','run.js'].forEach(f=>{
      const src = path.join(root, f);
      const dest = path.join(dir,f);
      try{ if(fs.existsSync(src) && !fs.existsSync(dest)) fs.copyFileSync(src,dest); }catch(e){}
    });
    try{ fs.chmodSync(path.join(dir,'entrypoint.sh'), 0o755); }catch(e){}
    const container = await docker.createContainer({
      name,
      Image: process.env.DEFAULT_IMAGE || 'node:20',
      Tty: true,
      HostConfig: {
        Binds: [`${dir}:/home/container`]
      },
      WorkingDir: '/home/container',
      Env: [
        `STARTUP_CMD=${startupCmd || 'node run.js'}`,
        `CF_TUNNEL_ENABLE=${cfEnable ? '1':'0'}`,
        `CF_TOKEN=${cfToken || ''}`
      ],
      Cmd: ['bash','/entrypoint.sh'],
      Labels: { 'panel.kind': 'js-panel' }
    });
    await container.start();
    res.json({ ok: true });
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
    // stop and remove old
    try{ await old.stop(); }catch(e){}
    await old.remove({ force:true });
    // create new with same mounts
    const container = await docker.createContainer({
      name,
      Image: info.Config.Image,
      Tty: true,
      HostConfig: { Binds: mounts },
      WorkingDir: info.Config.WorkingDir || '/home/container',
      Env: [
        `STARTUP_CMD=${STARTUP_CMD || 'node run.js'}`,
        `CF_TUNNEL_ENABLE=${CF_TUNNEL_ENABLE ? '1':'0'}`,
        `CF_TOKEN=${CF_TOKEN || ''}`
      ],
      Cmd: ['bash','/entrypoint.sh'],
      Labels: info.Config.Labels || { 'panel.kind':'js-panel' }
    });
    await container.start();
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// File manager: list/upload/download/delete/write
app.get('/api/containers/:name/files', authRequired, (req,res)=>{
  try{
    const dir = path.join(process.env.DATA_DIR || '/opt/js-data', req.params.name);
    if(!fs.existsSync(dir)) return res.json([]);
    const items = fs.readdirSync(dir).map(n=>{ const p=path.join(dir,n); const s=fs.lstatSync(p); return { name:n, isDir:s.isDirectory(), size:s.size }; });
    res.json(items);
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.get('/api/containers/:name/files/download', authRequired, (req,res)=>{
  const p = path.join(process.env.DATA_DIR || '/opt/js-data', req.params.name, req.query.path || '');
  res.download(p);
});

app.post('/api/containers/:name/files/upload', authRequired, upload.single('file'), (req,res)=>{
  try{
    const dir = path.join(process.env.DATA_DIR || '/opt/js-data', req.params.name);
    const dest = path.join(dir, req.body.dest || req.file.originalname);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(req.file.path, dest);
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.post('/api/containers/:name/files/write', authRequired, (req,res)=>{
  try{
    const p = path.join(process.env.DATA_DIR || '/opt/js-data', req.params.name, req.body.path);
    fs.writeFileSync(p, req.body.content||'', 'utf8');
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

app.delete('/api/containers/:name/files', authRequired, (req,res)=>{
  try{
    const p = path.join(process.env.DATA_DIR || '/opt/js-data', req.params.name, req.query.path || '');
    fs.rmSync(p, { recursive:true, force:true });
    res.json({ ok: true });
  }catch(e){ res.status(500).json({ error: e.message }); }
});

// Serve frontend static build (if exists)
app.use('/', express.static(path.join(process.cwd(),'frontend','dist')));

const server = app.listen(process.env.PORT || 8080, ()=> console.log('Backend listening on', process.env.PORT||8080));
const wss = new WebSocketServer({ server, path: '/ws/logs' });

wss.on('connection', async (ws, req) => {
  try{
    const url = new URL(req.url, 'http://x');
    const id = url.searchParams.get('id');
    if(!id){ ws.close(); return; }
    const container = docker.getContainer(id);
    const stream = await container.logs({ follow:true, stdout:true, stderr:true, tail:200 });
    stream.on('data', chunk => { try{ ws.send(chunk.toString()); }catch(e){} });
    ws.on('close', ()=> stream.destroy());
  }catch(e){ ws.close(); }
});
