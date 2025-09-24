import multer from "multer";
import path from "path";
import fs from "fs";

// Create uploads directory if not exists
const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const blocked = /\.(exe|dll|msi|bat|cmd|sh|ps1|js|jar|com|scr)$/i;
  if (blocked.test(file.originalname)) {
    return cb(new Error("Blocked file type"), false);
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter });

export default upload;
