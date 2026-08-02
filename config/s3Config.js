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
