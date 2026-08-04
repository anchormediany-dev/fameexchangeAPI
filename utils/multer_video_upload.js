import multer from "multer";
import multerS3 from "multer-s3";
import path from "path";
import { s3Client, S3_MEDIA_BUCKET, S3_CONFIGURED, localDiskFallbackStorage } from "../config/s3Config.js";

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime", // .mov
  "video/webm",
]);

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_VIDEO_TYPES.has(file.mimetype)) {
    return cb(new Error("Only MP4, MOV, or WebM video files are allowed"));
  }
  cb(null, true);
};

const storage = S3_CONFIGURED
  ? multerS3({
      s3: s3Client,
      bucket: S3_MEDIA_BUCKET,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      key: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = file.originalname.replace(ext, "").replace(/\s+/g, "-");
        cb(null, `highlight-reels/${name}-${Date.now()}${ext}`);
      },
    })
  : localDiskFallbackStorage("highlight-reels");

const uploadVideo = multer({
  storage,
  fileFilter,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

export default uploadVideo;
