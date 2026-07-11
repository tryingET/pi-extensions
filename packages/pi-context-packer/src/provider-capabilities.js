/**
summary: "Classifies context providers as executable, preflight-gated, eligibility-gated, safety-blocked, or owner-routed."
read_when:
  - "Changing provider wiring posture, SCI safety gating, session eligibility, or recommended next actions."
*/
import { hasHighSessionContextPressure } from "./session-context.js";

const PROVIDER_CAPABILITIES = Object.freeze({
  agents: Object.freeze({ adapterStatus: "wired", executionStatus: "executable_now" }),
  git: Object.freeze({ adapterStatus: "wired", executionStatus: "executable_now" }),
  docs: Object.freeze({ adapterStatus: "wired", executionStatus: "executable_now" }),
  session: Object.freeze({
    adapterStatus: "guarded",
    executionStatus: "runtime_eligibility_required",
    executionCondition: "caller_required_or_high_context_pressure",
  }),
  sci: Object.freeze({ adapterStatus: "guarded", executionStatus: "runtime_preflight_required" }),
  prompt_vault: Object.freeze({
    adapterStatus: "planned_unwired",
    executionStatus: "owner_routed",
  }),
  ak: Object.freeze({ adapterStatus: "planned_unwired", executionStatus: "owner_routed" }),
  fcos: Object.freeze({ adapterStatus: "planned_unwired", executionStatus: "owner_routed" }),
});

export const contextPackProviderCapability = (provider, env = {}, planContext = {}) => {
  const capability = PROVIDER_CAPABILITIES[provider];
  if (!capability) return { adapterStatus: "unknown", executionStatus: "owner_routed" };
  if (provider === "sci" && env.sciReadOnlySafe !== true) {
    return { adapterStatus: "guarded", executionStatus: "blocked_by_safety_gate" };
  }
  if (
    provider === "session" &&
    (planContext.reason === "provider required by caller" ||
      hasHighSessionContextPressure(env.contextUsage))
  ) {
    return { adapterStatus: "guarded", executionStatus: "executable_now" };
  }
  return { ...capability };
};

export const isPlannedUnwiredContextPackProvider = (provider) =>
  contextPackProviderCapability(provider).adapterStatus === "planned_unwired";

export const buildContextPackExecutionSummary = (providerPlans) => {
  const selectedPlans = providerPlans.filter((plan) => plan.posture === "selected");
  const providersWith = (executionStatus) =>
    selectedPlans
      .filter((plan) => plan.executionStatus === executionStatus)
      .map((plan) => plan.provider);
  const executableNow = providersWith("executable_now");
  const runtimePreflightRequired = providersWith("runtime_preflight_required");
  const runtimeEligibilityRequired = providersWith("runtime_eligibility_required");
  const blockedBySafetyGate = providersWith("blocked_by_safety_gate");
  const ownerRouted = providersWith("owner_routed");

  const nextActions = [];
  if (executableNow.length > 0) {
    nextActions.push({ action: "context_pack", providers: executableNow });
  }
  if (runtimePreflightRequired.length > 0) {
    nextActions.push({
      action: "context_pack_with_runtime_preflight",
      providers: runtimePreflightRequired,
    });
  }
  if (runtimeEligibilityRequired.length > 0) {
    nextActions.push({
      action: "check_runtime_eligibility_or_skip",
      providers: runtimeEligibilityRequired,
    });
  }
  if (blockedBySafetyGate.length > 0) {
    nextActions.push({
      action: "resolve_safety_gate_or_skip",
      providers: blockedBySafetyGate,
    });
  }
  if (ownerRouted.length > 0) {
    nextActions.push({ action: "owner_surface_followup", providers: ownerRouted });
  }

  const recommendedNextStep =
    nextActions.length === 0
      ? "no_selected_provider"
      : nextActions.length > 1
        ? "multiple_actions_required"
        : nextActions[0].action === "owner_surface_followup"
          ? "owner_surface_only"
          : nextActions[0].action;

  return {
    executableNow,
    runtimePreflightRequired,
    runtimeEligibilityRequired,
    blockedBySafetyGate,
    ownerRouted,
    nextActions,
    recommendedNextStep,
    note: "execution status describes the current context_pack adapter seam; every selected capability class has a next action, runtime-eligibility providers may intentionally emit no section, and retrieval failures still fail closed as explicit omissions",
  };
};
