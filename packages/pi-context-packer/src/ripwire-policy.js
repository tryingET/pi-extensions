/**
summary: "Keep automatic code discovery evidence-gated and honor an operator kill switch."
read_when:
  - "Changing automatic provider selection or rollout authorization."
*/
import { outputLimits } from "./packet-budget-limits.js";

// Changing this is a reviewed promotion, not a model input or environment override.
// The source-selection study is retrieval evidence, not a paired agent-task pilot.
export const RIPWIRE_AUTO_APPROVAL = Object.freeze({
  schema: "pi.ripwire-auto-approval.v1",
  enabled: false,
  pairedTaskPilot: "not_run",
  evidenceSha256: null,
});

export const ripwireDisabled = (options = {}) =>
  options.disabled === true ||
  /^(1|true|yes)$/iu.test(process.env.PI_CONTEXT_PACKER_RIPWIRE_DISABLED ?? "");

/** Pure policy seam; tests may supply an approval fixture, but runtime uses the committed record. */
export function evaluateRipwirePolicy(input, approval = RIPWIRE_AUTO_APPROVAL) {
  if (input.mode === "off") return { posture: "skipped", reason: "provider disabled by caller" };
  if (input.mode === "required")
    return { posture: "selected", reason: "provider required by caller" };
  if (input.disabled) return { posture: "skipped", reason: "ripwire disabled by operator" };
  const approved =
    approval?.schema === "pi.ripwire-auto-approval.v1" &&
    approval.enabled === true &&
    approval.pairedTaskPilot === "passed" &&
    typeof approval.evidenceSha256 === "string" &&
    /^[a-f0-9]{64}$/u.test(approval.evidenceSha256);
  if (!approved)
    return {
      posture: "optional",
      reason: "automatic activation is off; paired agent-task adoption evidence is not approved",
    };
  if (!input.codeIntent)
    return { posture: "optional", reason: "code discovery is not relevant to this request" };
  if (input.contextSatisfied)
    return { posture: "optional", reason: "host confirms this request already has code context" };
  if (!input.hasHeadroom)
    return { posture: "optional", reason: "insufficient code-discovery headroom" };
  if (!input.binaryConfigured)
    return { posture: "optional", reason: "ripwire is not operator-provisioned" };
  return {
    posture: "selected",
    reason: "approved automatic code discovery for an unresolved coding request",
  };
}

export function plannedRipwirePolicy({ mode, codeIntent, budget, env }) {
  const limits = outputLimits(budget, env);
  return evaluateRipwirePolicy({
    mode,
    codeIntent,
    disabled: ripwireDisabled(env.ripwire),
    // Only an explicit host-side assertion qualifies; loaded keys alone are not proof.
    contextSatisfied: env.codeContextSatisfied === true,
    hasHeadroom:
      limits.tokens >= 1024 &&
      limits.maxBytes >= 2048 &&
      budget.perProviderMaxTokens.ripwire >= 512,
    binaryConfigured: Boolean(env.ripwire?.binaryPath ?? process.env.PI_CONTEXT_PACKER_RIPWIRE_BIN),
  });
}
