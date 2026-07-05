import type { SelfQuery, SelfResponse } from "../types.ts";

export function handlePrefillVisibleLoopSelfEvolution(query: SelfQuery): SelfResponse {
  const nestedGuard = buildNestedVisibleLoopGuardResponse(query);
  if (nestedGuard) return nestedGuard;

  const text = "/visible-loop --count 1 --delegate-commit";

  return buildPrefillResponse(text, {
    sendUserMessage: false,
    dispatchMode: "operator_submit_required",
    autonomyLevel: 4,
    ownerSurface: "pi-little-helpers / visible-loop",
    routeKind: "visible_loop_self_evolution",
    launchMechanism: "operator_reviews_prefilled_editor_then_presses_enter",
    productPostureTarget:
      "docs/project/product-posture.md or routed package docs/project/product-posture.md",
    boundary:
      "ASC/self routes by editor prefill only; extension-originated pi.sendUserMessage does not invoke Pi slash-command expansion, so the operator must press Enter to launch /visible-loop through Pi's slash-command parser. pi-little-helpers owns /visible-loop launch and completion, and visible-loop output is not durable authority.",
    nonAuthorizations: [
      "does not launch visible-loop from self",
      "does not claim loop output as AK/evidence/KES/ontology truth",
      "does not bypass product-posture refresh or owner validation gates",
    ],
  });
}

export function handleLaunchVisibleLoopSelfEvolution(query: SelfQuery): SelfResponse {
  const nestedGuard = buildNestedVisibleLoopGuardResponse(query);
  if (nestedGuard) return nestedGuard;

  const text = "/visible-loop --count 1 --delegate-commit";

  return buildOwnerBridgeResponse(text, {
    ownerBridge: "pi-little-helpers extension-originated /visible-loop bridge",
    dispatchMode: "owner_bridge_send_user_message",
    autonomyLevel: 4,
    ownerSurface: "pi-little-helpers / visible-loop",
    routeKind: "visible_loop_self_evolution",
    launchMechanism: "send_user_message_to_owner_bridge",
    productPostureTarget:
      "docs/project/product-posture.md or routed package docs/project/product-posture.md",
    boundary:
      "ASC/self sends the explicit slash text only to the pi-little-helpers-owned extension bridge; pi-little-helpers owns /visible-loop launch and completion, and visible-loop output is not durable authority.",
    nonAuthorizations: [
      "does not implement visible-loop execution in ASC",
      "does not claim loop output as AK/evidence/KES/ontology truth",
      "does not bypass product-posture refresh or owner validation gates",
    ],
  });
}

export function handlePrefillAutoresearchCampaign(_query: SelfQuery): SelfResponse {
  const text = buildAutoresearchCampaignCommand();

  return buildPrefillResponse(text, {
    sendUserMessage: false,
    dispatchMode: "operator_submit_required",
    autonomyLevel: 5,
    ownerSurface: "pi-autoresearch",
    routeKind: "measured_self_evolution_campaign",
    launchMechanism: "operator_reviews_prefilled_editor_then_presses_enter",
    boundary:
      "ASC/self routes by editor prefill only; extension-originated pi.sendUserMessage does not invoke Pi slash-command expansion, so the operator must press Enter to launch /autoresearch through Pi's slash-command parser. pi-autoresearch owns bounded campaign setup, measurement, receipts, and closeout packets without durable promotion authority.",
    nonAuthorizations: [
      "does not launch or run autoresearch from self",
      "does not write AK/KES/evidence/ontology/Prompt Vault from ASC",
      "does not treat local autoresearch receipts as durable authority without owner promotion",
    ],
  });
}

export function handleLaunchAutoresearchCampaign(_query: SelfQuery): SelfResponse {
  const text = buildAutoresearchCampaignCommand();

  return buildPrefillResponse(text, {
    sendUserMessage: false,
    dispatchMode: "operator_submit_required",
    autonomyLevel: 5,
    ownerSurface: "pi-autoresearch",
    routeKind: "measured_self_evolution_campaign",
    launchMechanism: "operator_reviews_prefilled_editor_then_presses_enter",
    boundary:
      "ASC/self prefills the explicit /autoresearch slash command so the operator can submit it through Pi's slash-command parser; pi-autoresearch owns campaign setup, measurement, receipts, and closeout packets without durable promotion authority.",
    nonAuthorizations: [
      "does not implement or run autoresearch in ASC",
      "does not write AK/KES/evidence/ontology/Prompt Vault from ASC",
      "does not treat local autoresearch receipts as durable authority without owner promotion",
    ],
  });
}

function buildAutoresearchCampaignCommand(): string {
  return "/autoresearch Evaluate ASC self-evolution harness: metric=operator_nudge_count lower-is-better target=0 for post-compaction continuation; guardrail_boundary_violations target=0";
}

function buildNestedVisibleLoopGuardResponse(query: SelfQuery): SelfResponse | null {
  if (!isVisibleLoopSession(query.context)) return null;

  return {
    understood: true,
    intent: "action",
    answer:
      "Visible-loop launch deferred: this session already appears to be a visible-loop child. Continue the current visible-loop, or have the controller launch one `/visible-loop --count N --delegate-commit` run instead of spawning a nested parallel loop.",
    data: {
      prefill: false,
      sendUserMessage: false,
      dispatchMode: "nested_visible_loop_deferred_to_controller",
      autonomyLevel: 4,
      ownerSurface: "pi-little-helpers / visible-loop",
      routeKind: "visible_loop_self_evolution",
      launchMechanism: "deferred_inside_visible_loop_child",
      boundary:
        "ASC/self must not start a new visible-loop from inside a visible-loop child; use the existing loop iteration or ask the controller to relaunch with a higher --count when more serial iterations are desired.",
      nonAuthorizations: [
        "does not launch nested visible-loop sessions",
        "does not increase loop count after launch from inside the child",
        "does not claim visible-loop output as AK/evidence/KES/ontology truth",
      ],
    },
  };
}

function isVisibleLoopSession(context: Record<string, unknown> | undefined): boolean {
  const sessionName = typeof context?.sessionName === "string" ? context.sessionName : "";
  const sessionId = typeof context?.sessionId === "string" ? context.sessionId : "";
  return /\bvisible[- ]loop\b/iu.test(sessionName) || /^session-visible-loop-/u.test(sessionId);
}

function buildPrefillResponse(text: string, extraData: Record<string, unknown> = {}): SelfResponse {
  return {
    understood: true,
    intent: "action",
    answer: `Editor prefill suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}". Operator submission required: review the editor text, then press Enter to launch it through Pi's slash-command parser.`,
    data: { text, prefill: true, ...extraData },
  };
}

function buildOwnerBridgeResponse(
  text: string,
  extraData: Record<string, unknown> = {},
): SelfResponse {
  return {
    understood: true,
    intent: "action",
    answer: `Owner-bridge launch suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}". ASC will send this as a follow-up user message for the owning extension bridge to handle.`,
    data: { text, prefill: false, sendUserMessage: true, ...extraData },
  };
}
