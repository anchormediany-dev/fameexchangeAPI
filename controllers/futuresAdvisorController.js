// Fame Futures Phase 4 — Claude-backed AI advisor chat + career roadmap
// generation. See services/futuresAdvisorPersonas.js's header for why the
// persona registry is still empty (needs real data from Base44, not this
// controller's concern once populated — everything here is generic).
import anthropicClient from "../services/anthropicClient.js";
import { ADVISOR_PERSONAS, getAdvisor, canAccessAdvisor } from "../services/futuresAdvisorPersonas.js";
import FuturesAdvisorChat from "../models/futuresAdvisorChatModel.js";
import FuturesCareerRoadmap from "../models/futuresCareerRoadmapModel.js";
import FuturesTalentProfile from "../models/futuresTalentProfileModel.js";
import FuturesMembership from "../models/futuresMembershipModel.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const HISTORY_TURNS = 20; // messages (not pairs) of context sent to Claude

function assert(v, msg, code = 400) {
  if (!v) {
    const err = new Error(msg);
    err.status = code;
    throw err;
  }
}

async function requireTalentProfile(userId) {
  const profile = await FuturesTalentProfile.findOne({ userId }).lean();
  assert(profile, "Create your Fame Futures creator profile first", 403);
  return profile;
}

async function getActivePlan(userId) {
  const membership = await FuturesMembership.findOne({ userId, status: "active" }).lean();
  return membership?.plan || null;
}

// GET /api/futures-hub/advisor — the roster, gated by the caller's own plan
// (locked advisors are still listed, marked unlocked:false, so the UI can
// upsell rather than hide them).
export const listAdvisors = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const plan = await getActivePlan(req.user._id);
    const data = Object.entries(ADVISOR_PERSONAS).map(([key, a]) => ({
      key,
      name: a.name,
      title: a.title,
      minTier: a.minTier,
      free: Boolean(a.free),
      unlocked: canAccessAdvisor(a, plan),
    }));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
};

// GET /api/futures-hub/advisor/:advisorKey/history
export const getChatHistory = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const { advisorKey } = req.params;
    assert(getAdvisor(advisorKey), "Unknown advisor", 404);

    const messages = await FuturesAdvisorChat.find({ talentId: req.user._id, advisor_key: advisorKey })
      .sort({ createdAt: 1 })
      .lean();
    res.json({ success: true, data: messages });
  } catch (e) {
    next(e);
  }
};

// POST /api/futures-hub/advisor/:advisorKey/message
// Body: { content }
export const sendMessage = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const { advisorKey } = req.params;
    const { content } = req.body || {};
    assert(typeof content === "string" && content.trim().length > 0, "Message content required");

    const advisor = getAdvisor(advisorKey);
    assert(advisor, "Unknown advisor", 404);

    const talentProfile = await requireTalentProfile(req.user._id);
    const plan = await getActivePlan(req.user._id);
    assert(canAccessAdvisor(advisor, plan), "Upgrade your membership to unlock this advisor", 403);

    const userMessage = await FuturesAdvisorChat.create({
      talentId: req.user._id,
      advisor_key: advisorKey,
      role: "user",
      content: content.trim(),
    });

    const history = await FuturesAdvisorChat.find({ talentId: req.user._id, advisor_key: advisorKey })
      .sort({ createdAt: -1 })
      .limit(HISTORY_TURNS)
      .lean();
    history.reverse();

    const systemPrompt = `${advisor.systemPrompt}\n\nContext on the creator you're advising:\nStage name: ${talentProfile.stage_name}\nNiche: ${talentProfile.niche || "unspecified"}\nBio: ${talentProfile.bio || "unspecified"}`;

    const completion = await anthropicClient.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    const replyText = completion.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    const assistantMessage = await FuturesAdvisorChat.create({
      talentId: req.user._id,
      advisor_key: advisorKey,
      role: "assistant",
      content: replyText || "…",
    });

    res.json({ success: true, data: { userMessage, assistantMessage } });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};

// POST /api/futures-hub/advisor/roadmap — (re)generates the talent's career
// roadmap via Claude, grounded in their profile. Upserts FuturesCareerRoadmap.
export const generateRoadmap = async (req, res, next) => {
  try {
    assert(req.user?._id, "Unauthorized", 401);
    const talentProfile = await requireTalentProfile(req.user._id);

    const completion = await anthropicClient.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        "You are a career-development strategist for content creators on Fame Futures. " +
        "Given a creator's profile, respond with STRICT JSON only (no prose, no markdown " +
        'fences), matching this shape exactly: {"current_position": string, ' +
        '"next_milestone": string, "thirty_day_plan": string[], "ninety_day_vision": string[]}. ' +
        "Keep each array to 3-5 concrete, specific items.",
      messages: [
        {
          role: "user",
          content: `Stage name: ${talentProfile.stage_name}\nNiche: ${talentProfile.niche || "unspecified"}\nBio: ${talentProfile.bio || "unspecified"}\nTotal followers: ${talentProfile.total_followers || 0}`,
        },
      ],
    });

    const text = completion.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw Object.assign(new Error("Advisor response wasn't valid JSON"), { status: 502 });
    }

    const roadmap = await FuturesCareerRoadmap.findOneAndUpdate(
      { talentId: req.user._id },
      {
        $set: {
          current_position: String(parsed.current_position || ""),
          next_milestone: String(parsed.next_milestone || ""),
          thirty_day_plan: Array.isArray(parsed.thirty_day_plan) ? parsed.thirty_day_plan.map(String) : [],
          ninety_day_vision: Array.isArray(parsed.ninety_day_vision) ? parsed.ninety_day_vision.map(String) : [],
        },
      },
      { new: true, upsert: true }
    );

    res.json({ success: true, data: roadmap });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    next(e);
  }
};
