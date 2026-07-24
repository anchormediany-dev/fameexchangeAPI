// Email-sending (sendEmail) used to live here — moved to utils/emailFormats.js
// (sendOtpEmail/sendResetLinkEmail/sendClaimAccountEmail) as part of
// consolidating three separate ad-hoc mailer implementations into one.

export function parseCount(text) {
  if (!text) return 0;

  // Handle cases like "1.23M subscribers"
  const cleanText = text.replace(/[^0-9.KMB]/g, "").trim();

  const num = parseFloat(cleanText.replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return 0;

  if (cleanText.includes("K")) return Math.round(num * 1000);
  if (cleanText.includes("M")) return Math.round(num * 1000000);
  if (cleanText.includes("B")) return Math.round(num * 1000000000);

  return num;
}

export function extractUsername(url) {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    return pathParts[pathParts.length - 1].replace("@", "");
  } catch {
    return url.split("/").filter(Boolean).pop().replace("@", "");
  }
}
