import jwt from "jsonwebtoken";

/**
 * Signs a short-lived token so a Future-tier talent clicking through to
 * famefutures.com (a separate codebase/deployment, NOT this backend) can
 * land there already identified, instead of having to sign up again.
 *
 * This only creates the token — famefutures.com's own backend is
 * responsible for verifying it (same shared secret) and provisioning/
 * logging in the corresponding account on their end. See
 * FAMEFUTURES_HANDOFF.md for the integration contract that side needs to
 * implement.
 *
 * Deliberately signed with FAMEFUTURES_SSO_SECRET, NOT the internal
 * JWT_SECRET_KEY used for our own session auth — a separate system
 * verifying tokens should never share a secret with our own login tokens,
 * so a compromise of either side doesn't hand over the other.
 */
export function createFamefuturesHandoffToken(user, talent) {
  const secret = process.env.FAMEFUTURES_SSO_SECRET;
  if (!secret) return null; // not configured yet — caller falls back to a plain link

  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      name: user.name,
      talentId: String(talent._id),
      talentSlug: talent.slug,
      tier: talent.tier,
      fameScore: talent.fame_score,
      iss: "fameexchange",
      aud: "famefutures",
    },
    secret,
    { expiresIn: "15m" }
  );
}
