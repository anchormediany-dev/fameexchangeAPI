// One-time cutover script: uploads the existing local uploads/ directory
// (profile images, event images, product/team images) to S3, preserving
// each file's relative path as its S3 key (uploads/profile/xxx.png ->
// profile/xxx.png, uploads/events/xxx.png -> events/xxx.png, everything
// else -> uploads/xxx.png), matching the key prefixes the multer-s3
// storage configs now use (utils/profile_images.js, multer_event_images.js,
// multer_multiple_file_upload.js, "multer_single_file_upload copy.js").
//
// Does NOT rewrite any database documents — existing /uploads/... URLs
// already stored on Talent/User/Product/Event/TeamMember docs will keep
// pointing at the old local path (served by app.js's legacy static
// fallback) until those records are individually re-saved through their
// normal update flows. Run once, after the S3 bucket exists (Phase 5) and
// before the old deployment is decommissioned.
//
// Usage: node scripts/migrateUploadsToS3.js

import "dotenv/config";
import fs from "fs";
import path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_MEDIA_BUCKET } from "../config/s3Config.js";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Small fixed set — everything this app has ever accepted as an upload
// (images, plus KYC document PDFs). Not a general-purpose mime lookup.
const EXT_TO_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};
function guessContentType(relPath) {
  return EXT_TO_MIME[path.extname(relPath).toLowerCase()] || "application/octet-stream";
}

function keyFor(relPath) {
  const normalized = relPath.split(path.sep).join("/");
  if (normalized.startsWith("profile/")) return normalized;
  if (normalized.startsWith("events/")) return normalized;
  return `uploads/${normalized}`;
}

function walk(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

async function main() {
  if (!S3_MEDIA_BUCKET) {
    throw new Error("AWS_S3_BUCKET (or AWS_S3_MEDIA_BUCKET) must be set");
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    console.log("No local uploads/ directory found — nothing to migrate.");
    return;
  }

  const files = walk(UPLOADS_DIR);
  console.log(`Found ${files.length} local file(s) to migrate to s3://${S3_MEDIA_BUCKET}`);

  let uploaded = 0;
  let failed = 0;
  for (const relPath of files) {
    const key = keyFor(relPath);
    const body = fs.readFileSync(path.join(UPLOADS_DIR, relPath));
    const contentType = guessContentType(relPath);
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: S3_MEDIA_BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );
      uploaded += 1;
      console.log(`  uploaded: ${relPath} -> ${key}`);
    } catch (err) {
      failed += 1;
      console.error(`  FAILED: ${relPath} (${err.message})`);
    }
  }

  console.log(`Done. ${uploaded} uploaded, ${failed} failed, out of ${files.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
