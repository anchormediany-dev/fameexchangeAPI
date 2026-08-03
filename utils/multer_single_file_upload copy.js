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

// Create the multer instance
const uploadSingleFile = multer({ storage: storage });

export default uploadSingleFile;
