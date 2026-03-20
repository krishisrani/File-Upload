// ===== File Upload System =====

const API_BASE = '';
let currentView = 'grid';
let allFiles = [];

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileGrid = document.getElementById('file-grid');
const emptyState = document.getElementById('empty-state');
const uploadProgress = document.getElementById('upload-progress');
const progressBar = document.getElementById('progress-bar');
const progressPercent = document.getElementById('progress-percent');
const fileCountEl = document.getElementById('file-count');
const totalSizeEl = document.getElementById('total-size');
const previewModal = document.getElementById('preview-modal');
const modalFilename = document.getElementById('modal-filename');
const modalPreview = document.getElementById('modal-preview');
const modalType = document.getElementById('modal-type');
const modalSize = document.getElementById('modal-size');
const modalDate = document.getElementById('modal-date');
const modalDownload = document.getElementById('modal-download');
const modalDelete = document.getElementById('modal-delete');
const modalClose = document.getElementById('modal-close');
const gridViewBtn = document.getElementById('grid-view-btn');
const listViewBtn = document.getElementById('list-view-btn');
const toastContainer = document.getElementById('toast-container');

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  loadFiles();
  setupEventListeners();
});

function setupEventListeners() {
  // Drop zone events
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragenter', handleDragEnter);
  dropZone.addEventListener('dragover', handleDragOver);
  dropZone.addEventListener('dragleave', handleDragLeave);
  dropZone.addEventListener('drop', handleDrop);
  fileInput.addEventListener('change', handleFileSelect);

  // Modal events
  modalClose.addEventListener('click', closeModal);
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // View toggle
  gridViewBtn.addEventListener('click', () => setView('grid'));
  listViewBtn.addEventListener('click', () => setView('list'));
}

// ===== DRAG & DROP =====
function handleDragEnter(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drag-over');
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  // Only remove class if leaving the drop zone entirely
  const rect = dropZone.getBoundingClientRect();
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
    dropZone.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag-over');
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    uploadFiles(files);
  }
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length > 0) {
    uploadFiles(files);
  }
  fileInput.value = '';
}

// ===== FILE UPLOAD =====
async function uploadFiles(files) {
  const fileArray = Array.from(files);
  
  // Validate file types client-side
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf', '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.rar', '.mp4', '.mp3'];
  
  for (const file of fileArray) {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      showToast(`❌ Invalid file type: "${file.name}". Allowed: ${allowedExtensions.join(', ')}`, 'error', 5000);
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      showToast(`❌ File "${file.name}" exceeds 100MB limit.`, 'error', 4000);
      return;
    }
  }

  showProgress();

  try {
    if (fileArray.length === 1) {
      await uploadSingle(fileArray[0]);
    } else {
      await uploadMultiple(fileArray);
    }
  } catch (error) {
    showToast(`❌ Upload failed: ${error.message}`, 'error');
  } finally {
    hideProgress();
  }
}

async function uploadSingle(file) {
  const formData = new FormData();
  formData.append('file', file);

  const xhr = new XMLHttpRequest();
  
  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        updateProgress(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = JSON.parse(xhr.responseText);
        if (response.success) {
          showToast('✅ File uploaded successfully!', 'success');
          loadFiles();
          resolve(response);
        } else {
          showToast(`❌ ${response.error}`, 'error');
          reject(new Error(response.error));
        }
      } else {
        const response = JSON.parse(xhr.responseText);
        showToast(`❌ ${response.error || 'Upload failed'}`, 'error');
        reject(new Error(response.error || 'Upload failed'));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error'));
    });

    xhr.open('POST', `${API_BASE}/api/upload`);
    xhr.send(formData);
  });
}

async function uploadMultiple(files) {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  const xhr = new XMLHttpRequest();

  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        updateProgress(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const response = JSON.parse(xhr.responseText);
        if (response.success) {
          showToast(`✅ ${response.files.length} files uploaded!`, 'success');
          loadFiles();
          resolve(response);
        } else {
          showToast(`❌ ${response.error}`, 'error');
          reject(new Error(response.error));
        }
      } else {
        const response = JSON.parse(xhr.responseText);
        showToast(`❌ ${response.error || 'Upload failed'}`, 'error');
        reject(new Error(response.error || 'Upload failed'));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error'));
    });

    xhr.open('POST', `${API_BASE}/api/upload/multiple`);
    xhr.send(formData);
  });
}

// ===== LOAD FILES =====
async function loadFiles() {
  try {
    const response = await fetch(`${API_BASE}/api/files`);
    const data = await response.json();
    
    if (data.success) {
      allFiles = data.files;
      renderFiles();
      updateStats();
    }
  } catch (error) {
    console.error('Failed to load files:', error);
  }
}

// ===== RENDER FILES =====
function renderFiles() {
  if (allFiles.length === 0) {
    emptyState.classList.remove('hidden');
    fileGrid.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  fileGrid.classList.remove('hidden');

  fileGrid.innerHTML = allFiles.map((file, index) => `
    <div class="file-card" onclick="openPreview('${file.id}')" style="animation-delay: ${index * 0.05}s">
      <button class="file-card-delete" onclick="event.stopPropagation(); deleteFile('${file.id}')" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
      <div class="file-card-preview">
        ${getFilePreview(file)}
      </div>
      <div class="file-card-info">
        <div class="file-card-name" title="${escapeHtml(file.originalName)}">${escapeHtml(file.originalName)}</div>
        <div class="file-card-meta">
          <span class="file-card-size">${formatSize(file.size)}</span>
          <span class="file-card-date">${formatDate(file.uploadDate)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function getFilePreview(file) {
  if (file.mimeType.startsWith('image/')) {
    return `<img src="${file.url}" alt="${escapeHtml(file.originalName)}" loading="lazy">`;
  }

  const ext = file.originalName.split('.').pop().toUpperCase();
  const iconColor = getFileColor(file.mimeType);
  
  return `
    <div class="file-type-icon">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span class="ext-label">${ext}</span>
    </div>
  `;
}

function getFileColor(mimeType) {
  if (mimeType.startsWith('image/')) return '#6366f1';
  if (mimeType === 'application/pdf') return '#ef4444';
  if (mimeType.includes('word') || mimeType.includes('document')) return '#3b82f6';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '#22c55e';
  if (mimeType.startsWith('video/')) return '#f59e0b';
  if (mimeType.startsWith('audio/')) return '#ec4899';
  if (mimeType.includes('zip') || mimeType.includes('rar')) return '#8b5cf6';
  return '#64748b';
}

// ===== DELETE FILE =====
async function deleteFile(id) {
  if (!confirm('Are you sure you want to delete this file?')) return;

  try {
    const response = await fetch(`${API_BASE}/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await response.json();

    if (data.success) {
      showToast('🗑️ File deleted', 'info');
      closeModal();
      loadFiles();
    } else {
      showToast(`❌ ${data.error}`, 'error');
    }
  } catch (error) {
    showToast('❌ Failed to delete file', 'error');
  }
}

// ===== PREVIEW MODAL =====
function openPreview(id) {
  const file = allFiles.find(f => f.id === id);
  if (!file) return;

  modalFilename.textContent = file.originalName;
  modalType.textContent = file.mimeType;
  modalSize.textContent = formatSize(file.size);
  modalDate.textContent = new Date(file.uploadDate).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  modalDownload.href = file.url;
  modalDownload.download = file.originalName;
  modalDelete.onclick = () => deleteFile(file.id);

  // Set preview content
  if (file.mimeType.startsWith('image/')) {
    modalPreview.innerHTML = `<img src="${file.url}" alt="${escapeHtml(file.originalName)}">`;
  } else if (file.mimeType.startsWith('video/')) {
    modalPreview.innerHTML = `<video controls src="${file.url}"></video>`;
  } else if (file.mimeType.startsWith('audio/')) {
    modalPreview.innerHTML = `
      <div class="file-preview-placeholder">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
        <audio controls src="${file.url}" style="margin-top:16px;width:100%"></audio>
      </div>
    `;
  } else if (file.mimeType === 'application/pdf') {
    modalPreview.innerHTML = `<iframe src="${file.url}" style="width:100%;height:400px;border:none;border-radius:10px;" title="PDF Preview"></iframe>`;
  } else if (file.mimeType === 'text/plain' || file.mimeType === 'text/csv') {
    fetch(file.url)
      .then(r => r.text())
      .then(text => {
        modalPreview.innerHTML = `<pre style="background:rgba(0,0,0,0.3);padding:20px;border-radius:10px;max-height:400px;overflow:auto;font-size:0.85rem;color:#94a3b8;width:100%;white-space:pre-wrap;word-break:break-all;">${escapeHtml(text.substring(0, 5000))}</pre>`;
      })
      .catch(() => {
        modalPreview.innerHTML = getGenericPreview(file);
      });
  } else {
    modalPreview.innerHTML = getGenericPreview(file);
  }

  previewModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function getGenericPreview(file) {
  const ext = file.originalName.split('.').pop().toUpperCase();
  const color = getFileColor(file.mimeType);
  return `
    <div class="file-preview-placeholder">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <p style="margin-top:12px;font-weight:600;font-size:1.1rem;color:${color}">.${ext} File</p>
      <p>Preview not available for this file type</p>
    </div>
  `;
}

function closeModal() {
  previewModal.classList.add('hidden');
  document.body.style.overflow = '';
}

// ===== VIEW TOGGLE =====
function setView(view) {
  currentView = view;
  
  if (view === 'grid') {
    fileGrid.classList.remove('list-view');
    gridViewBtn.classList.add('active');
    listViewBtn.classList.remove('active');
  } else {
    fileGrid.classList.add('list-view');
    listViewBtn.classList.add('active');
    gridViewBtn.classList.remove('active');
  }
}

// ===== PROGRESS =====
function showProgress() {
  uploadProgress.classList.remove('hidden');
  updateProgress(0);
}

function hideProgress() {
  setTimeout(() => {
    uploadProgress.classList.add('hidden');
    updateProgress(0);
  }, 500);
}

function updateProgress(percent) {
  progressBar.style.width = percent + '%';
  progressPercent.textContent = percent + '%';
}

// ===== STATS =====
function updateStats() {
  fileCountEl.textContent = allFiles.length;
  const totalBytes = allFiles.reduce((sum, f) => sum + f.size, 0);
  totalSizeEl.textContent = formatSize(totalBytes);
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ===== UTILITY FUNCTIONS =====
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
