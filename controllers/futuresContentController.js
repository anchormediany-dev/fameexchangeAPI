// Fame Futures Phase 6 — crowdfunding/project payments already shipped in
// Phase 3 (futuresBillingController's project-support flow). What's still
// missing is real tier-gating for content: the Phase 1 generic CRUD mounts
// for ExclusiveContent/VideoLesson let any logged-in user list everything
// including content_url/video_url, regardless of subscription or
// membership tier — "exclusive" in name only. This controller adds the
// actual gated read paths; create/update/delete stay on the generic mount.
import mongoose from "mongoose";
import FuturesExclusiveContent from "../models/futuresExclusiveContentModel.js";
import FuturesFanSubscription from "../models/futuresFanSubscriptionModel.js";
import FuturesFanMembershipTier from "../models/futuresFanMembershipTierModel.js";
import FuturesVideoLesson from "../models/futuresVideoLessonModel.js";
import FuturesMembership from "../models/futuresMembershipModel.js";
import FuturesExpertInvite from "../models/futuresExpertInviteModel.js";
import Notification from "../models/notificationModel.js";

const PLATFORM_TIER_RANK = { starter: 0, pro: 1, elite: 2 };

function assert(v, msg, code = 400) {
  if (!v) {
    const err = new Error(msg);
    err.status = code;
    throw err;
  }
}

function previewOnly(doc) {
  const { content_url, ...rest } = doc; // eslint-disable-line no-unused-vars
  return { ...rest, locked: true };
}

// GET /api/futures-hub/content/exclusive/:talentId — fan-facing, tier-gated
export const getTalentExclusiveContent = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const { talentId } = req.params;
    assert(mongoose.Types.ObjectId.isValid(talentId), "Invalid talentId");

    const isOwner = String(talentId) === String(req.user._id);
    const items = await FuturesExclusiveContent.find({
      talentId,
      ...(isOwner ? {} : { status: "published" }),
    })
      .sort({ createdAt: -1 })
      .lean();

    if (isOwner) {
      return res.json({ success: true, data: items });
    }

    const subscription = await FuturesFanSubscription.findOne({
      fanId: req.user._id,
      talentId,
      status: "active",
    }).lean();

    let subscribedTierPrice = -1; // no active subscription
    if (subscription) {
      const tier = await FuturesFanMembershipTier.findById(subscription.tierId).lean();
      subscribedTierPrice = tier?.price ?? subscription.price ?? 0;
    }

    const tierIds = [...new Set(items.filter((c) => c.tierId).map((c) => String(c.tierId)))];
    const tierPrices = tierIds.length
      ? Object.fromEntries(
          (await FuturesFanMembershipTier.find({ _id: { $in: tierIds } }).lean()).map((t) => [
            String(t._id),
            t.price,
          ])
        )
      : {};

    // Higher tiers include lower-tier perks (standard membership-platform
    // convention) — unlock if the fan's subscribed tier price meets or
    // exceeds the content's required tier price. No tier requirement at
    // all (tierId null) unlocks for any active subscriber, any tier.
    const data = items.map((item) => {
      if (!item.tierId) {
        return subscribedTierPrice >= 0 ? item : previewOnly(item);
      }
      const requiredPrice = tierPrices[String(item.tierId)] ?? Infinity;
      return subscribedTierPrice >= requiredPrice ? item : previewOnly(item);
    });

    res.json({ success: true, data });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// GET /api/futures-hub/content/video-lessons — platform lessons, gated by
// the caller's own active platform Membership plan.
export const getVideoLessons = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const lessons = await FuturesVideoLesson.find({ status: "published" }).sort({ createdAt: -1 }).lean();

    const membership = await FuturesMembership.findOne({ userId: req.user._id, status: "active" }).lean();
    const myRank = membership ? PLATFORM_TIER_RANK[membership.plan] : -1;

    const data = lessons.map((lesson) => {
      const requiredRank = PLATFORM_TIER_RANK[lesson.min_tier] ?? 0;
      if (myRank >= requiredRank) return lesson;
      const { video_url, ...rest } = lesson; // eslint-disable-line no-unused-vars
      return { ...rest, locked: true };
    });

    res.json({ success: true, data });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// ── Expert invite: public, tokenized, no FameExchange account needed ────
// GET /api/futures-hub/content/expert-invite/:token
export const getExpertInviteByToken = async (req, res, next) => {
  try {
    const invite = await FuturesExpertInvite.findOne({ token: req.params.token })
      .populate("talentId", "name")
      .lean();
    assert(invite, "Invite not found", 404);
    assert(invite.status === "pending", "This invite has already been used or expired", 400);
    res.json({ success: true, data: invite });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// POST /api/futures-hub/content/expert-invite/:token/submit
// Body: { video_url, duration_minutes?, thumbnail_url?, title, description? }
export const submitExpertLesson = async (req, res, next) => {
  try {
    const invite = await FuturesExpertInvite.findOne({ token: req.params.token });
    assert(invite, "Invite not found", 404);
    assert(invite.status === "pending", "This invite has already been used or expired", 400);

    const { video_url, duration_minutes, thumbnail_url, title, description } = req.body || {};
    assert(typeof video_url === "string" && video_url.trim(), "video_url is required");
    assert(typeof title === "string" && title.trim(), "title is required");

    const lesson = await FuturesVideoLesson.create({
      title: title.trim(),
      description: description || "",
      expert_name: invite.expert_name,
      expert_title: invite.expert_title,
      video_url: video_url.trim(),
      thumbnail_url: thumbnail_url || "",
      advisor_key: invite.advisor_key,
      duration_minutes: Number(duration_minutes) || 0,
      status: "draft", // reviewed/published by an admin, not auto-live
    });

    invite.status = "accepted";
    await invite.save();

    await Notification.create({
      userId: invite.talentId,
      category: "expert_invite",
      description: `${invite.expert_name} submitted a lesson: "${lesson.title}"`,
      referenceModel: "FuturesVideoLesson",
      referenceId: lesson._id,
    }).catch(() => {});

    res.status(201).json({ success: true, data: lesson });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};
