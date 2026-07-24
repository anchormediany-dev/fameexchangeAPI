import crypto from "crypto";
import User from "../models/user.js";
import Networth from "../models/networth.js";
import { sendClaimAccountEmail } from "../utils/emailFormats.js";
import { getAllPlatformsData } from "../controllers/allPlatformsController.js";
import { applyToBeTalent } from "./talentApplicationService.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function uniqueName(base) {
  let candidate = base;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await User.exists({ name: candidate })) {
    suffix += 1;
    candidate = `${base} ${suffix}`;
  }
  return candidate;
}

/**
 * Public, no-login "See If You Qualify" flow: an anonymous visitor gives just
 * a name, email, and social profile URLs, and behind the scenes we:
 *  1. Silently create a real TALENT account (random password — they never
 *     see or set one during this flow).
 *  2. Run the same scrape + Networth pipeline as the existing manual
 *     Networth Calculator.
 *  3. Run the same FameScore + Talent-creation pipeline as the existing
 *     self-serve "Apply to be a Talent" flow (applyToBeTalent).
 *  4. Email them an OTP so they can set a real password later via the
 *     existing forgot-password/reset-password screens.
 * Returns a login token so the frontend can treat them as logged in
 * immediately, without ever showing a password field.
 */
export async function quickQualify({ name, email, socials = {} }) {
  const trimmedName = String(name || "").trim();
  const trimmedEmail = String(email || "").trim().toLowerCase();

  if (!trimmedName) throw new Error("Name is required");
  if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
    throw new Error("A valid email is required");
  }

  const existing = await User.findOne({ email: trimmedEmail });
  if (existing) {
    throw new Error("An account with this email already exists — please log in instead.");
  }

  const finalName = await uniqueName(trimmedName);
  const randomPassword = crypto.randomBytes(24).toString("hex");

  const user = await User.create({
    name: finalName,
    full_name: trimmedName,
    email: trimmedEmail,
    password: randomPassword, // hashed by the User model's pre-save hook
    role: "TALENT",
    is_verified: true, // trusted server-side creation, no signup OTP needed
    social_youtube: socials.youtube || "",
    social_twitter: socials.twitter || "",
    social_insta: socials.instagram || "",
    social_facebook: socials.facebook || "",
    social_tiktok: socials.tiktok || "",
    social_snap: socials.snapchat || "",
  });

  // Best-effort scrape, same pipeline as the Networth Calculator — must never
  // block account creation if scraping fails or times out.
  let scraped = { totalFollowers: 1, netWorth: 1, platforms: [] };
  try {
    scraped = await getAllPlatformsData(socials);
  } catch (err) {
    console.error("quickQualify scrape error:", err?.message || err);
  }

  const socialMedia = {};
  (scraped.platforms || []).forEach(({ platform, url, followers, subscribers }) => {
    socialMedia[platform] = ["youtube", "snapchat"].includes(platform)
      ? { url, subscribers: subscribers || 1 }
      : { url, followers: followers || 1 };
  });

  await Networth.create({
    userId: user._id,
    fullName: trimmedName,
    socialMedia,
    totalFollowers: scraped.totalFollowers,
    netWorth: scraped.netWorth,
  });

  // Runs the exact same FameScore + Talent-creation pipeline as the existing
  // self-serve "Apply to be a Talent" flow — reads the Networth doc we just
  // saved as its social signal fallback.
  const applyResult = await applyToBeTalent(user);

  // Let them claim a real password later via the existing OTP reset flow.
  // Generous window compared to the 10-minute forgot-password OTP, since
  // this is a "come back whenever" claim rather than an urgent reset.
  const otp = Math.floor(1000 + Math.random() * 9000);
  user.OTP_code = String(otp);
  user.otp_expiry = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  await user.save();
  await sendClaimAccountEmail(user.email, { otp: String(otp) });

  const token = await user.generateToken();

  return { token, ...applyResult };
}
