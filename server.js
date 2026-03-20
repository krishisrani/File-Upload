require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Allowed file types mapping
const ALLOWED_TYPES = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg',
  'application/pdf': '.pdf', 'text/plain': '.txt', 'text/csv': '.csv', 'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/zip': '.zip', 'application/x-rar-compressed': '.rar', 'video/mp4': '.mp4', 'audio/mpeg': '.mp3',
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Extractor helper
function getMimeTypeFromExt(ext) {
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
  const mimeType = Object.keys(ALLOWED_TYPES).find(key => ALLOWED_TYPES[key] === normalizedExt.toLowerCase());
  return mimeType || 'application/octet-stream';
}

const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}`), false);
  }
};

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let resourceType = 'auto';
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('text/') || file.mimetype.includes('zip') || file.mimetype.includes('document') || file.mimetype.includes('spreadsheet')) {
      resourceType = 'raw';
    } else if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
      resourceType = 'video';
    } else {
      resourceType = 'image';
    }
    
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    
    return {
      folder: 'file_upload_app',
      resource_type: resourceType,
      public_id: `${uuidv4()}___${safeName}`,
    };
  },
});

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

// In-memory cache for fast UI, synced from Cloudinary on boot
let fileMetadata = [];

async function loadExistingFiles() {
  console.log('🔄 Fetching files from Cloudinary... this ensures state persists across Render restarts!');
  try {
    const types = ['image', 'video', 'raw'];
    for (const type of types) {
      // Cloudinary search/resources API
      const result = await cloudinary.api.resources({ 
        type: 'upload', 
        prefix: 'file_upload_app/', 
        resource_type: type, 
        max_results: 100 
      });
      
      const mapped = result.resources.map(file => {
        let originalName = file.public_id.split('___').pop();
        if(type !== 'raw' && !originalName.includes('.') && file.format) {
            originalName += '.' + file.format;
        }
        
        const ext = '.' + originalName.split('.').pop().toLowerCase();
        return {
          id: file.public_id,
          originalName: originalName,
          mimeType: getMimeTypeFromExt(ext),
          size: file.bytes,
          uploadDate: file.created_at,
          url: file.secure_url,
          resource_type: type
        };
      });
      fileMetadata = [...fileMetadata, ...mapped];
    }
    console.log(`✅ Loaded ${fileMetadata.length} files from Cloudinary.`);
  } catch (error) {
    console.error('❌ Error fetching from Cloudinary. Make sure your credentials are correct.', error);
  }
}
loadExistingFiles();

// Upload Single
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return handleUploadError(err, res);
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided.' });

    const resourceType = req.file.mimetype.startsWith('video/') || req.file.mimetype.startsWith('audio/') ? 'video' : 
                         (req.file.mimetype.startsWith('image/') ? 'image' : 'raw');

    const fileMeta = {
      id: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadDate: new Date().toISOString(),
      url: req.file.path,
      resource_type: resourceType
    };
    fileMetadata.push(fileMeta);

    res.status(201).json({ success: true, message: 'File uploaded seamlessly to Cloudinary!', file: fileMeta });
  });
});

// Upload Multiple
app.post('/api/upload/multiple', (req, res) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) return handleUploadError(err, res);
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, error: 'No files provided.' });

    const uploadedFiles = req.files.map(file => {
      const resourceType = file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/') ? 'video' : 
                           (file.mimetype.startsWith('image/') ? 'image' : 'raw');
      const fileMeta = {
        id: file.filename, 
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadDate: new Date().toISOString(),
        url: file.path, 
        resource_type: resourceType
      };
      fileMetadata.push(fileMeta);
      return fileMeta;
    });

    res.status(201).json({ success: true, message: 'Files uploaded to Cloudinary!', files: uploadedFiles });
  });
});

function handleUploadError(err, res) {
  console.error("Upload Error:", err);
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: 'File too large.' });
  }
  return res.status(400).json({ success: false, error: err.message });
}

// Get files
app.get('/api/files', (req, res) => {
  const sortedFiles = [...fileMetadata].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
  res.json({ success: true, files: sortedFiles, total: sortedFiles.length });
});

app.get('/api/files/:id', (req, res) => {
  const fileId = decodeURIComponent(req.params.id);
  const file = fileMetadata.find(f => f.id === fileId);
  if (!file) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, file });
});

app.delete('/api/files/:id', async (req, res) => {
  const fileId = req.params.id;
  const fileIndex = fileMetadata.findIndex(f => f.id === fileId);
  
  if (fileIndex === -1) return res.status(404).json({ success: false, error: 'File not found.' });

  const file = fileMetadata[fileIndex];
  try {
    const result = await cloudinary.uploader.destroy(file.id, { invalidate: true, resource_type: file.resource_type });
    if(result.result !== 'ok' && result.result !== 'not found') {
        console.warn('Cloudinary delete warning:', result.result);
    }
    fileMetadata.splice(fileIndex, 1);
    res.json({ success: true, message: 'Deleted from Cloudinary.' });
  } catch (error) {
    console.error('Delete error', error);
    res.status(500).json({ success: false, error: 'Failed to delete file from cloud.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 File Upload Server (Cloudinary Edition) running on port ${PORT}`);
});
