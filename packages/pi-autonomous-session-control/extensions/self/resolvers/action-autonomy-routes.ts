import {
  isSafeEvolutionCandidateText,
  latestEvolutionCandidate,
} from "../evolution-candidate-ledger.ts";
import type { SelfEvolutionCandidate, SelfQuery, SelfResponse, SelfState } from "../types.ts";

export function handlePrefillVisibleLoopSelfEvolution(
  query: SelfQuery,
  state: SelfState,
): SelfResponse {
  const nestedGuard = buildNestedVisibleLoopGuardResponse(query);
  if (nestedGuard) return nestedGuard;
  const resolved = resolveRoutableCandidate(query, state);
  if (!resolved.ok) return resolved.response;

  const text = buildVisibleLoopCommand(resolved.candidate);

  return buildPrefillResponse(text, {
    candidateId: resolved.candidate.candidateId,
    evolutionCandidate: resolved.candidate,
    sendUserMessage: false,
    dispatchMode: "operator_submit_required",
    autonomyLevel: 4,
    ownerSurface: "pi-little-helpers / visible-loop",
    routeKind: "visible_loop_self_evolution",
    launchMechanism: "operator_reviews_prefilled_editor_then_presses_enter",
    productPostureTarget:
      "docs/project/product-posture.md or routed package docs/project/product-posture.md",
    boundary:
      "ASC/self routes the exact session-local candidate id by editor prefill. pi-little-helpers must resolve that id from the correlated self tool result and owns visible-loop launch/config; loop output is not durable authority.",
    nonAuthorizations: [
      "does not launch visible-loop from self",
      "does not treat an unbound or insufficient-evidence candidate as executable",
      "does not claim loop output as AK/evidence/KES/ontology truth",
      "does not bypass candidate closeout guards or owner validation gates",
    ],
  });
}

export function handleLaunchVisibleLoopSelfEvolution(
  query: SelfQuery,
  state: SelfState,
): SelfResponse {
  const nestedGuard = buildNestedVisibleLoopGuardResponse(query);
  if (nestedGuard) return nestedGuard;
  const resolved = resolveRoutableCandidate(query, state);
  if (!resolved.ok) return resolved.response;

  const text = buildVisibleLoopCommand(resolved.candidate);

  return buildOwnerBridgeResponse(text, {
    candidateId: resolved.candidate.candidateId,
    evolutionCandidate: resolved.candidate,
    ownerBridge: "pi-little-helpers extension-originated /visible-loop bridge",
    dispatchMode: "owner_bridge_send_user_message",
    autonomyLevel: 4,
    ownerSurface: "pi-little-helpers / visible-loop",
    routeKind: "visible_loop_self_evolution",
    launchMechanism: "send_user_message_to_owner_bridge",
    productPostureTarget:
      "docs/project/product-posture.md or routed package docs/project/product-posture.md",
    boundary:
      "ASC/self sends the exact candidate-bound slash text only to the pi-little-helpers-owned bridge. pi-little-helpers validates the correlated self result and owns launch/config; loop output is not durable authority.",
    nonAuthorizations: [
      "does not implement visible-loop execution in ASC",
      "does not launch an unbound or insufficient-evidence candidate",
      "does not claim loop output as AK/evidence/KES/ontology truth",
      "does not bypass candidate closeout guards or owner validation gates",
    ],
  });
}

export function handlePrefillAutoresearchCampaign(
  query: SelfQuery,
  state: SelfState,
): SelfResponse {
  const resolved = resolveRoutableCandidate(query, state);
  if (!resolved.ok) return resolved.response;
  const text = buildAutoresearchCampaignCommand(resolved.candidate);

  return buildPrefillResponse(text, {
    candidateId: resolved.candidate.candidateId,
    evolutionCandidate: resolved.candidate,
    sendUserMessage: false,
    dispatchMode: "operator_submit_required",
    autonomyLevel: 5,
    ownerSurface: "pi-autoresearch",
    routeKind: "measured_self_evolution_campaign",
    launchMechanism: "operator_reviews_prefilled_editor_then_presses_enter",
    boundary:
      "ASC/self carries only the candidate id, routed owner, and promoted owner-artifact path into an operator-reviewed /autoresearch objective. pi-autoresearch must read and verify that artifact before using its hypothesis, metric, or falsifier, and owns campaign setup, measurement, receipts, and closeout packets without durable promotion authority.",
    nonAuthorizations: [
      "does not launch or run autoresearch from self",
      "does not write AK/KES/evidence/ontology/Prompt Vault from ASC",
      "does not treat local autoresearch receipts as durable authority without owner promotion",
    ],
  });
}

export function handleLaunchAutoresearchCampaign(query: SelfQuery, state: SelfState): SelfResponse {
  return handlePrefillAutoresearchCampaign(query, state);
}

function resolveRoutableCandidate(
  query: SelfQuery,
  state: SelfState,
): { ok: true; candidate: SelfEvolutionCandidate } | { ok: false; response: SelfResponse } {
  const sessionId =
    typeof query.context?.sessionId === "string" ? query.context.sessionId : "unknown-session";
  const candidate = latestEvolutionCandidate(state, sessionId);
  if (!candidate) {
    return {
      ok: false,
      response: buildCandidateRouteBlockedResponse(
        "candidate_missing",
        'No typed self-evolution candidate exists in this session. Run self({ query: "self-evolution", context: { friction, hypothesis, metric, falsifier, owner, nextSafeTest } }) first.',
      ),
    };
  }
  if (
    !candidate.executionReady ||
    candidate.confidence === "insufficient" ||
    candidate.ownerRoutingStatus !== "allowed"
  ) {
    return {
      ok: false,
      response: buildCandidateRouteBlockedResponse(
        "candidate_insufficient_evidence",
        `Candidate ${candidate.candidateId} is not execution-ready because its evidence is insufficient. Name concrete friction or run the proposed external check before routing it.`,
        candidate,
      ),
    };
  }
  const candidateTextFields = [
    candidate.friction,
    candidate.hypothesis,
    candidate.falsifier,
    candidate.metric,
    candidate.owner,
    candidate.nextSafeTest,
    ...candidate.nonAuthorizations,
  ];
  if (!candidateTextFields.every(isSafeEvolutionCandidateText)) {
    return {
      ok: false,
      response: buildCandidateRouteBlockedResponse(
        "candidate_unsafe_text",
        `Candidate ${candidate.candidateId} contains multiline, directional-control, slash-command, role-like, or instruction-like text and cannot be routed automatically. Rephrase it as bounded declarative data.`,
        candidate,
      ),
    };
  }
  const promotionCue = candidate.insightPromotionCue;
  const promotionTarget = typeof promotionCue.target === "string" ? promotionCue.target.trim() : "";
  if (
    promotionCue.status !== "promoted" ||
    promotionCue.requiredBeforeCompletion !== false ||
    !isSafePromotionTarget(promotionTarget)
  ) {
    return {
      ok: false,
      response: buildCandidateRouteBlockedResponse(
        "owner_promotion_required",
        `Candidate ${candidate.candidateId} must be promoted to an explicit safe repo-relative owner artifact with provenance before executable routing.`,
        candidate,
      ),
    };
  }
  if (candidate.reflectionGuard.requiresExternalCheck === true) {
    return {
      ok: false,
      response: buildCandidateRouteBlockedResponse(
        "external_check_required",
        `Candidate ${candidate.candidateId} is blocked by self.reflection_guard.v1. ${String(candidate.reflectionGuard.nextAction ?? "Run the named external check before recursive continuation.")}`,
        candidate,
      ),
    };
  }
  return { ok: true, candidate };
}

function buildCandidateRouteBlockedResponse(
  reason: string,
  answer: string,
  candidate?: SelfEvolutionCandidate,
): SelfResponse {
  return {
    understood: true,
    intent: "action",
    answer,
    data: {
      prefill: false,
      sendUserMessage: false,
      dispatchMode: "candidate_route_blocked",
      reason,
      ...(candidate ? { candidateId: candidate.candidateId, evolutionCandidate: candidate } : {}),
      boundary:
        "candidate routing fails closed; no editor prefill, owner-bridge message, visible-loop launch, campaign launch, or durable authority mutation occurred",
    },
  };
}

function isSafePromotionTarget(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 300 &&
    !value.startsWith("/") &&
    !value.split("/").includes("..") &&
    /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/u.test(value)
  );
}

function buildVisibleLoopCommand(candidate: SelfEvolutionCandidate): string {
  return `/visible-loop --count 1 --delegate-commit --candidate ${candidate.candidateId}`;
}

function buildAutoresearchCampaignCommand(candidate: SelfEvolutionCandidate): string {
  const target = String(candidate.insightPromotionCue.target);
  return `/autoresearch Evaluate promoted self-evolution candidate ${candidate.candidateId} for owner ${candidate.owner}; ownerArtifact=${target}`;
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
