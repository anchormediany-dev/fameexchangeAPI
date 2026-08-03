import fs from "fs";
import path from "path";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Credentials: the SDK's default chain picks these up automatically — an
// App Runner instance role in production (no keys needed here at all), or
// AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY from the environment for local
// dev. Never hardcode credentials in this file.
export const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

export const S3_BUCKET = process.env.AWS_S3_BUCKET;
export const S3_MEDIA_BUCKET = process.env.AWS_S3_MEDIA_BUCKET || S3_BUCKET;

// No bucket configured (e.g. local dev before Phase 5's infra/ exists) —
// multer-s3 throws synchronously at import time without one, which would
// crash the whole app on boot. Callers use this to fall back to local disk
// instead of requiring every developer to have a real S3 bucket set up.
export const S3_CONFIGURED = Boolean(S3_MEDIA_BUCKET);

/**
 * Local-disk fallback storage matching multer-s3's OUTPUT SHAPE — sets
 * req.file.location the same way multer-s3 does, so every controller can
 * keep reading req.file.location unconditionally regardless of which
 * storage engine is actually active. Serves through the existing
 * express.static("/uploads") route (app.js). Dev-only; production always
 * has S3_CONFIGURED true.
 */
export function localDiskFallbackStorage(prefix) {
  const uploadDir = path.join("uploads", prefix);
  fs.mkdirSync(uploadDir, { recursive: true });

  return {
    _handleFile(req, file, cb) {
      const ext = path.extname(file.originalname);
      const name = file.originalname.replace(ext, "").replace(/\s+/g, "-");
      const filename = `${name}-${Date.now()}${ext}`;
      const destPath = path.join(uploadDir, filename);
      const outStream = fs.createWriteStream(destPath);
      file.stream.pipe(outStream);
      outStream.on("error", cb);
      outStream.on("finish", () => {
        const base = process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 5006}`;
        cb(null, {
          size: outStream.bytesWritten,
          location: `${base}/uploads/${prefix}/${filename}`.replace(/([^:])\/\/+/g, "$1/"),
        });
      });
    },
    _removeFile(req, file, cb) {
      fs.unlink(file.path || "", () => cb());
    },
  };
}

// If a CloudFront distribution fronts the bucket (AWS_S3_CDN_BASE_URL set),
// serve through that instead of the raw S3 object URL — lets the CDN get
// wired up later (infra/, Phase 5) without touching any upload code again.
const CDN_BASE = process.env.AWS_S3_CDN_BASE_URL;

export function buildPublicUrl(key) {
  if (CDN_BASE) return `${CDN_BASE.replace(/\/$/, "")}/${key}`;
  return `https://${S3_MEDIA_BUCKET}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
}

// Reverses buildPublicUrl — given a stored public URL (S3 or CDN), extract
// the object key so an old file can be deleted on replace. Returns null for
// anything that doesn't look like one of our own URLs (e.g. a legacy local
// "/uploads/..." path from before this migration) so callers can skip
// deletion instead of erroring.
export function keyFromPublicUrl(url) {
  if (!url || typeof url !== "string") return null;
  if (CDN_BASE && url.startsWith(CDN_BASE)) {
    return url.slice(CDN_BASE.replace(/\/$/, "").length + 1);
  }
  const s3HostPrefix = `https://${S3_MEDIA_BUCKET}.s3.`;
  if (url.startsWith(s3HostPrefix)) {
    const afterHost = url.slice(url.indexOf(".amazonaws.com/") + ".amazonaws.com/".length);
    return afterHost || null;
  }
  return null;
}

// Best-effort — a failed delete of the OLD image should never block saving
// the new one. Callers should fire-and-forget or await without throwing.
export async function deleteS3Object(key) {
  if (!key) return;
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: S3_MEDIA_BUCKET, Key: key }));
  } catch (err) {
    console.error(`[s3Config] failed to delete old object ${key}:`, err.message);
  }
}
