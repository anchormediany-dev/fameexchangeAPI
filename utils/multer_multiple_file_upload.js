import multer from "multer";
import multerS3 from "multer-s3";
import { s3Client, S3_MEDIA_BUCKET, S3_CONFIGURED, localDiskFallbackStorage } from "../config/s3Config.js";

const storage = S3_CONFIGURED
  ? multerS3({
      s3: s3Client,
      bucket: S3_MEDIA_BUCKET,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (req, file, cb) => {
        cb(null, `uploads/${Date.now()}-${file.originalname}`);
      },
    })
  : localDiskFallbackStorage("");

const fileFilter = (req, file, cb) => {
  const blocked = /\.(exe|dll|msi|bat|cmd|sh|ps1|js|jar|com|scr)$/i;
  if (blocked.test(file.originalname)) {
    return cb(new Error("Blocked file type"), false);
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter });

export default upload;
