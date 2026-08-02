import multer from "multer";
import multerS3 from "multer-s3";
import path from "path";
import { s3Client, S3_MEDIA_BUCKET } from "../config/s3Config.js";

const storage = multerS3({
  s3: s3Client,
  bucket: S3_MEDIA_BUCKET,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = file.originalname.replace(ext, "").replace(/\s+/g, "-");
    cb(null, `profile/${name}-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });
export default upload;
