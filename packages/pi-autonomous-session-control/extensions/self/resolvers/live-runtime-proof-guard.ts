/**
 * Mirror-only live-runtime proof guard for ASC/self diagnostic closeout.
 *
 * Package checks, local install receipts, Pi reload, and post-reload self dogfood
 * are separate trust tiers. This guard makes overclaim risk visible without
 * running reloads, launching tools, or writing durable owner surfaces.
 */

import type { SelfQuery } from "../types.ts";
import {
  detectsLiveBehaviorClaim,
  resolveExpectedPackageName,
  resolveSequenceStatus,
  resolveTier,
  TIER_SPECS,
} from "./live-runtime-proof-tiers.ts";
import type { LiveRuntimeSessionEvidence, TierName } from "./live-runtime-proof-types.ts";

export function buildLiveRuntimeProofGuard(
  query: SelfQuery | undefined,
  context: Record<string, unknown>,
  sessionEvidence: LiveRuntimeSessionEvidence = {},
): Record<string, unknown> {
  const expectedPackageName = resolveExpectedPackageName(context);
  const tiers = Object.fromEntries(
    TIER_SPECS.map((spec) => [
      spec.name,
      resolveTier(context, spec, sessionEvidence, expectedPackageName),
    ]),
  ) as Record<TierName, Record<string, unknown>>;
  const liveBehaviorClaimed = detectsLiveBehaviorClaim(query, context);
  const missingTiers = TIER_SPECS.filter((spec) => tiers[spec.name].status !== "observed").map(
    (spec) => spec.name,
  );
  const failedTiers = TIER_SPECS.filter((spec) => tiers[spec.name].status === "failed").map(
    (spec) => spec.name,
  );
  const ownerBindingFailures = TIER_SPECS.filter(
    (spec) => spec.ownerBound && tiers[spec.name].ownerBindingStatus === "failed",
  ).map((spec) => spec.name);
  const sequence = resolveSequenceStatus(tiers);
  const liveBehaviorClaimAllowed =
    missingTiers.length === 0 &&
    failedTiers.length === 0 &&
    ownerBindingFailures.length === 0 &&
    sequence.status === "observed";
  const requiredBeforeCompletion = liveBehaviorClaimed && !liveBehaviorClaimAllowed;
  const nextAction = (() => {
    if (liveBehaviorClaimAllowed) {
      return "cite ordered package-check, install, reload, and post-reload self dogfood receipts before claiming active runtime behavior";
    }
    if (ownerBindingFailures.length > 0) {
      return `rerun proof for the owning package (${expectedPackageName}); wrong-owner receipts do not prove active behavior`;
    }
    if (missingTiers.length === 0 && sequence.status !== "observed") {
      return "provide ordered proof receipts showing package check before install before reload before post-reload self dogfood";
    }
    const nextMissing = missingTiers[0];
    const spec = TIER_SPECS.find((entry) => entry.name === nextMissing);
    return (
      spec?.nextAction ??
      "complete the missing live-runtime proof tier before claiming active behavior"
    );
  })();

  return {
    kind: "self.live_runtime_proof_guard.v1",
    liveBehaviorClaimed,
    liveBehaviorClaimAllowed,
    requiredBeforeCompletion,
    expectedPackageName,
    packageCheckStatus: tiers.packageCheck.status,
    installStatus: tiers.install.status,
    reloadStatus: tiers.reload.status,
    postReloadDogfoodStatus: tiers.postReloadDogfood.status,
    ownerBindingFailures,
    proofSequenceStatus: sequence.status,
    proofSequenceReason: sequence.reason,
    missingTiers,
    failedTiers,
    tiers,
    nextAction,
    boundary:
      "mirror-only live-runtime proof guard; ASC/self does not install packages, reload Pi, launch dogfood, or write durable owner surfaces",
    nonAuthorizations: [
      "no active-runtime claim from package checks, install receipts, reload prose, or caller text alone",
      "no active-runtime claim from wrong-owner or unordered proof receipts",
      "no pi install or /reload execution from diagnostic/self-evolution queries",
      "no hidden post-reload dogfood launch from this guard",
      "no AK/evidence/KES/ontology/Prompt Vault/agent_vent mutation from this guard",
    ],
  };
}
