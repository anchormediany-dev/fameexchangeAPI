import SocialConnection from "../models/socialConnection.js";
import User from "../models/user.js";

/**
 * social_worth = sum of follower counts across the user's CONNECTED accounts.
 * Recomputed whenever a connection is added, refreshed, or removed.
 * Persisted onto the User so trading / valuation can read it cheaply later.
 */
export async function recomputeSocialWorth(userId) {
  const connections = await SocialConnection.find({
    userId,
    status: "connected",
  }).lean();

  const socialWorth = connections.reduce(
    (sum, c) => sum + (Number(c.followers) || 0),
    0
  );

  await User.findByIdAndUpdate(userId, { social_worth: socialWorth });
  return socialWorth;
}
