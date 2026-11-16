import multer from "multer";
import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES } from '../services/profilePhoto.service.js';

const parse = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 10, parts: 12, fieldSize: 16 * 1024 },
  fileFilter: (req, file, callback) => callback(
    PHOTO_MIME_TYPES.includes(file.mimetype) ? null : new Error('UNSUPPORTED_PHOTO'),
    PHOTO_MIME_TYPES.includes(file.mimetype),
  ),
}).single('profile_picture');

export function uploadProfilePic(req, res, next) {
  parse(req, res, error => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      .json({ ok: false, message: 'Choose a JPG, PNG or WebP image no larger than 2 MB.' });
    next();
  });
}
