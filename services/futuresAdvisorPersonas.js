// Fame Futures AI advisor roster — Phase 4. Base44's AdvisorChat entity only
// stores an `advisor_key` string per message (e.g. "vision_coach"); the real
// persona names, expertise, and system-prompt behavior for the actual ~18
// advisors (see famefutures.com/membership: "5 free advisors" on Starter,
// "all 18 unlocked" on Pro) live in Base44's Code tab, not its data API.
// This registry is intentionally empty until that source data is pulled —
// filling it with guessed personas here would risk shipping the wrong
// voice/expertise for a paid feature and needing a rebuild later.
//
// Shape once populated:
//   key: { name, title, minTier: "starter"|"pro"|"elite", free: boolean, systemPrompt }
export const ADVISOR_PERSONAS = {};

const TIER_RANK = { starter: 0, pro: 1, elite: 2 };

export function getAdvisor(advisorKey) {
  return ADVISOR_PERSONAS[advisorKey] || null;
}

export function canAccessAdvisor(advisor, membershipPlan) {
  if (advisor.free) return true;
  if (!membershipPlan) return false;
  return TIER_RANK[membershipPlan] >= TIER_RANK[advisor.minTier];
}
