import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage engine configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png|webp|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only images (.jpg, .jpeg, .png, .webp, .gif) are allowed!'));
  }
});

// POST route to upload image
router.post('/', authMiddleware, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  // Construct image URL
  const serverUrl = req.protocol + '://' + req.get('host');
  const imageUrl = `${serverUrl}/uploads/${req.file.filename}`;

  return res.status(201).json({
    message: 'Image uploaded successfully',
    imageUrl
  });
}, (error, req, res, next) => {
  return res.status(400).json({ message: error.message });
});

export default router;
