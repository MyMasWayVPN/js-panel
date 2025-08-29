import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

export default function FileManager({ containerId, containerStatus }) {
  const [files, setFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCompressModal, setShowCompressModal] = useState(false);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [createType, setCreateType] = useState('file'); // 'file' or 'folder'
  const [newName, setNewName] = useState('');
  const [compressForm, setCompressForm] = useState({
    archiveName: '',
    archiveType: 'zip'
  });
  const [extractForm, setExtractForm] = useState({
    filePath: '',
    extractTo: ''
  });
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (containerId) {
      loadFiles();
    }
  }, [containerId, currentPath]);

  async function loadFiles() {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`/api/containers/${containerId}/files?path=${encodeURIComponent(currentPath)}`);
      setFiles(res.data || []);
    } catch (err) {
      setError('Failed to load files: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  async function uploadFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setError('');
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dest', currentPath + file.name);

      await axios.post(`/api/containers/${containerId}/files/upload`, formData, {
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      await loadFiles();
      setUploadProgress(0);
    } catch (err) {
      setError('Failed to upload file: ' + (err.response?.data?.error || err.message));
      setUploadProgress(0);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function createItem() {
    if (!newName.trim()) {
      setError('Name is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const endpoint = createType === 'file' ? 'create-file' : 'create-folder';
      await axios.post(`/api/containers/${containerId}/files/${endpoint}`, {
        path: currentPath + newName
      });

      setShowCreateModal(false);
      setNewName('');
      await loadFiles();
    } catch (err) {
      setError(`Failed to create ${createType}: ` + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  async function deleteItem(fileName) {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axios.delete(`/api/containers/${containerId}/files`, {
        data: { path: currentPath + fileName }
      });
      await loadFiles();
    } catch (err) {
      setError('Failed to delete item: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  async function downloadFile(fileName) {
    try {
      const response = await axios.get(`/api/containers/${containerId}/files/download`, {
        params: { path: currentPath + fileName },
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to download file: ' + (err.response?.data?.error || err.message));
    }
  }

  async function extractFile() {
    if (!extractForm.filePath) {
      setError('Please select a file to extract');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axios.post(`/api/containers/${containerId}/files/extract`, {
        filePath: extractForm.filePath,
        extractTo: extractForm.extractTo || currentPath
      });

      setShowExtractModal(false);
      setExtractForm({ filePath: '', extractTo: '' });
      await loadFiles();
    } catch (err) {
      setError('Failed to extract file: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  async function compressFiles() {
    if (selectedItems.length === 0) {
      setError('Please select files/folders to compress');
      return;
    }

    if (!compressForm.archiveName.trim()) {
      setError('Please enter archive name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axios.post(`/api/containers/${containerId}/files/compress`, {
        items: selectedItems,
        archiveName: compressForm.archiveName,
        archiveType: compressForm.archiveType
      });

      setShowCompressModal(false);
      setCompressForm({ archiveName: '', archiveType: 'zip' });
      setSelectedItems([]);
      await loadFiles();
    } catch (err) {
      setError('Failed to compress files: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  function toggleItemSelection(fileName) {
    setSelectedItems(prev => {
      if (prev.includes(fileName)) {
        return prev.filter(item => item !== fileName);
      } else {
        return [...prev, fileName];
      }
    });
  }

  function isArchiveFile(fileName) {
    const ext = fileName.toLowerCase();
    return ext.endsWith('.zip') || ext.endsWith('.tar') || ext.endsWith('.tar.gz') || 
           ext.endsWith('.tgz') || ext.endsWith('.gz') || ext.endsWith('.rar');
  }

  function navigateToFolder(folderName) {
    if (folderName === '..') {
      const pathParts = currentPath.split('/').filter(p => p);
      pathParts.pop();
      setCurrentPath('/' + pathParts.join('/') + (pathParts.length > 0 ? '/' : ''));
    } else {
      setCurrentPath(currentPath + folderName + '/');
    }
  }

  function getFileIcon(file) {
    if (file.isDir) return '📁';
    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js': case 'jsx': case 'ts': case 'tsx': return '📄';
      case 'json': return '📋';
      case 'md': return '📝';
      case 'txt': return '📄';
      case 'png': case 'jpg': case 'jpeg': case 'gif': return '🖼️';
      case 'zip': case 'tar': case 'gz': return '📦';
      default: return '📄';
    }
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  return (
    <div className="file-manager">
      <div className="file-manager-header">
        <div className="path-breadcrumb">
          <h3>File Manager</h3>
          <div className="current-path">
            <span className="path-label">Path:</span>
            <span className="path-value">{currentPath}</span>
          </div>
        </div>
        
        <div className="file-actions">
          <input
            ref={fileInputRef}
            type="file"
            onChange={uploadFile}
            style={{ display: 'none' }}
            disabled={loading || containerStatus !== 'running'}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || containerStatus !== 'running'}
            className="upload-btn"
          >
            📤 Upload
          </button>
          <button 
            onClick={() => {
              setCreateType('file');
              setShowCreateModal(true);
            }}
            disabled={loading || containerStatus !== 'running'}
            className="create-btn"
          >
            📄 New File
          </button>
          <button 
            onClick={() => {
              setCreateType('folder');
              setShowCreateModal(true);
            }}
            disabled={loading || containerStatus !== 'running'}
            className="create-btn"
          >
            📁 New Folder
          </button>
          <button 
            onClick={() => {
              if (selectedItems.length === 0) {
                setError('Please select files/folders to compress');
                return;
              }
              setShowCompressModal(true);
            }}
            disabled={loading || containerStatus !== 'running' || selectedItems.length === 0}
            className="compress-btn"
          >
            📦 Compress ({selectedItems.length})
          </button>
          <button 
            onClick={() => setShowExtractModal(true)}
            disabled={loading || containerStatus !== 'running'}
            className="extract-btn"
          >
            📂 Extract
          </button>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {uploadProgress > 0 && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <span>{uploadProgress}%</span>
        </div>
      )}

      {containerStatus !== 'running' && (
        <div className="file-manager-notice">
          <p>⚠️ Container is not running. File operations are disabled.</p>
        </div>
      )}

      <div className="files-list">
        {loading ? (
          <div className="loading-files">
            <div className="spinner"></div>
            Loading files...
          </div>
        ) : (
          <>
            {currentPath !== '/' && (
              <div 
                className="file-item folder-item"
                onClick={() => navigateToFolder('..')}
              >
                <span className="file-icon">📁</span>
                <span className="file-name">..</span>
                <span className="file-type">Parent Directory</span>
              </div>
            )}
            
            {files.map(file => (
              <div key={file.name} className={`file-item ${selectedItems.includes(file.name) ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selectedItems.includes(file.name)}
                  onChange={() => toggleItemSelection(file.name)}
                  className="file-checkbox"
                />
                <span className="file-icon">{getFileIcon(file)}</span>
                <span 
                  className="file-name"
                  onClick={() => file.isDir ? navigateToFolder(file.name) : setSelectedFile(file)}
                >
                  {file.name}
                </span>
                <span className="file-size">
                  {file.isDir ? 'Directory' : formatFileSize(file.size || 0)}
                </span>
                <div className="file-actions-menu">
                  {!file.isDir && (
                    <button 
                      onClick={() => downloadFile(file.name)}
                      className="action-btn download-btn"
                      title="Download"
                    >
                      ⬇️
                    </button>
                  )}
                  {!file.isDir && isArchiveFile(file.name) && (
                    <button 
                      onClick={() => {
                        setExtractForm({ filePath: file.name, extractTo: currentPath });
                        setShowExtractModal(true);
                      }}
                      className="action-btn extract-btn"
                      title="Extract"
                    >
                      📂
                    </button>
                  )}
                  <button 
                    onClick={() => deleteItem(file.name)}
                    className="action-btn delete-btn"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
            
            {files.length === 0 && (
              <div className="empty-folder">
                <p>This folder is empty</p>
              </div>
            )}
          </>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Create New {createType === 'file' ? 'File' : 'Folder'}</h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`Enter ${createType} name`}
              onKeyPress={(e) => e.key === 'Enter' && createItem()}
            />
            <div className="modal-actions">
              <button onClick={createItem} disabled={loading}>
                Create
              </button>
              <button 
                onClick={() => {
                  setShowCreateModal(false);
                  setNewName('');
                  setError('');
                }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompressModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Compress Files</h3>
            <p>Selected items: {selectedItems.join(', ')}</p>
            
            <label>Archive Name:</label>
            <input
              type="text"
              value={compressForm.archiveName}
              onChange={(e) => setCompressForm({...compressForm, archiveName: e.target.value})}
              placeholder="Enter archive name"
            />
            
            <label>Archive Type:</label>
            <select
              value={compressForm.archiveType}
              onChange={(e) => setCompressForm({...compressForm, archiveType: e.target.value})}
            >
              <option value="zip">ZIP (.zip)</option>
              <option value="tar">TAR (.tar)</option>
              <option value="tar.gz">TAR.GZ (.tar.gz)</option>
            </select>
            
            <div className="modal-actions">
              <button onClick={compressFiles} disabled={loading}>
                {loading ? 'Compressing...' : 'Compress'}
              </button>
              <button 
                onClick={() => {
                  setShowCompressModal(false);
                  setCompressForm({ archiveName: '', archiveType: 'zip' });
                  setError('');
                }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showExtractModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Extract Archive</h3>
            
            <label>Archive File:</label>
            <select
              value={extractForm.filePath}
              onChange={(e) => setExtractForm({...extractForm, filePath: e.target.value})}
            >
              <option value="">Select archive file...</option>
              {files.filter(f => !f.isDir && isArchiveFile(f.name)).map(file => (
                <option key={file.name} value={file.name}>{file.name}</option>
              ))}
            </select>
            
            <label>Extract To (optional):</label>
            <input
              type="text"
              value={extractForm.extractTo}
              onChange={(e) => setExtractForm({...extractForm, extractTo: e.target.value})}
              placeholder={`Current directory: ${currentPath}`}
            />
            
            <div className="modal-actions">
              <button onClick={extractFile} disabled={loading || !extractForm.filePath}>
                {loading ? 'Extracting...' : 'Extract'}
              </button>
              <button 
                onClick={() => {
                  setShowExtractModal(false);
                  setExtractForm({ filePath: '', extractTo: '' });
                  setError('');
                }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
