import type { SelfQuery, SelfResponse } from "../types.ts";

export function handlePrefillVisibleLoopSelfEvolution(_query: SelfQuery): SelfResponse {
  const text = "/visible-loop --count 1 --delegate-commit";

  return buildPrefillResponse(text, {
    sendUserMessage: false,
    dispatchMode: "operator_review_required",
    autonomyLevel: 4,
    ownerSurface: "pi-little-helpers / visible-loop",
    routeKind: "visible_loop_self_evolution",
    productPostureTarget:
      "docs/project/product-posture.md or routed package docs/project/product-posture.md",
    boundary:
      "ASC/self routes by editor prefill only; pi-little-helpers owns /visible-loop launch and completion, and visible-loop output is not durable authority.",
    nonAuthorizations: [
      "does not launch visible-loop from self",
      "does not claim loop output as AK/evidence/KES/ontology truth",
      "does not bypass product-posture refresh or owner validation gates",
    ],
  });
}

export function handlePrefillAutoresearchCampaign(_query: SelfQuery): SelfResponse {
  const text =
    "/autoresearch Evaluate ASC self-evolution harness: metric=operator_nudge_count lower-is-better target=0 for post-compaction continuation; guardrail_boundary_violations target=0";

  return buildPrefillResponse(text, {
    sendUserMessage: false,
    dispatchMode: "operator_review_required",
    autonomyLevel: 5,
    ownerSurface: "pi-autoresearch",
    routeKind: "measured_self_evolution_campaign",
    boundary:
      "ASC/self routes by editor prefill only; pi-autoresearch owns bounded campaign setup, measurement, receipts, and closeout packets without durable promotion authority.",
    nonAuthorizations: [
      "does not launch or run autoresearch from self",
      "does not write AK/KES/evidence/ontology/Prompt Vault from ASC",
      "does not treat local autoresearch receipts as durable authority without owner promotion",
    ],
  });
}

function buildPrefillResponse(text: string, extraData: Record<string, unknown> = {}): SelfResponse {
  return {
    understood: true,
    intent: "action",
    answer: `Editor prefill suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
    data: { text, prefill: true, ...extraData },
  };
}
