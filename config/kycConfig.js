// Kill-switch for staged rollout — flip to false to disable the KYC gate
// instantly (without a redeploy) if it needs to be backed out post-launch.
export const KYC_GATE_ENABLED = true;

export function isKycVerified(user) {
  if (!KYC_GATE_ENABLED) return true;
  return !!user?.KYC_Verified;
}
