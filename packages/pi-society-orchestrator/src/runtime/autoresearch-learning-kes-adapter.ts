import fs from "node:fs";
import path from "node:path";
import {
  createKesArtifactPlan,
  type KesArtifactPlan,
  materializeKesArtifactPlan,
} from "../kes/index.ts";

export const AUTORESEARCH_LEARNING_KES_ADAPTER_KIND =
  "autoresearch.learning_kes_adapter.v1" as const;

export type AutoresearchLearningKesAdapterAction = "plan" | "materialize";

export interface AutoresearchLearningPacketV1 {
  packetKind: "autoresearch.learning.v1";
  adapterContractVersion: 1;
  targetKinds: string[];
  suggestedPath: string;
  title: string;
  markdown: string;
  closeout: {
    packetKind?: string;
    campaign?: string | null;
    empiricalDecisionClass?: string;
    empiricalPosture?: { promotionReady?: boolean; summary?: string };
    recommendedAction?: string;
    receiptPath?: string;
  };
  adapterBoundary: string;
}

export interface AutoresearchLearningKesAdapterResult {
  kind: typeof AUTORESEARCH_LEARNING_KES_ADAPTER_KIND;
  action: AutoresearchLearningKesAdapterAction;
  status: "planned" | "materialized";
  packageRoot: string;
  source: {
    packetKind: "autoresearch.learning.v1";
    title: string;
    campaign: string | null;
    suggestedPath: string;
    empiricalDecisionClass: string | null;
    promotionReady: boolean | null;
  };
  kesPlan: KesArtifactPlan;
  writtenArtifacts: string[];
  effect: {
    kesArtifactsWritten: boolean;
    piAutoresearchMutated: false;
    akCalled: false;
    externalAuthorityMutated: false;
    promotionStateChanged: false;
  };
  boundary: string;
}

export interface BuildAutoresearchLearningKesAdapterInput {
  packageRoot: string;
  packet: unknown;
  action?: AutoresearchLearningKesAdapterAction;
  sessionId?: string;
  timestamp?: Date;
}

const KES_ADAPTER_BOUNDARY =
  "pi-society-orchestrator consumes autoresearch.learning.v1 as the KES/learning owner seam; plan is non-mutating, materialize writes only package-owned KES diary and candidate-only docs/learnings artifacts, and neither action mutates pi-autoresearch, AK, Prompt Vault, ROCS, Oracle/DSPx, or promotion state.";

export function loadAutoresearchLearningPacket(packetPath: string): unknown {
  return JSON.parse(fs.readFileSync(path.resolve(packetPath), "utf8"));
}

export function buildAutoresearchLearningKesAdapterResult(
  input: BuildAutoresearchLearningKesAdapterInput,
): AutoresearchLearningKesAdapterResult {
  const packet = validateAutoresearchLearningPacket(input.packet);
  const action = validateAdapterAction(input.action ?? "plan");
  const packageRoot = path.resolve(input.packageRoot);
  const campaign = typeof packet.closeout.campaign === "string" ? packet.closeout.campaign : null;
  const empiricalDecisionClass =
    typeof packet.closeout.empiricalDecisionClass === "string"
      ? packet.closeout.empiricalDecisionClass
      : null;
  const promotionReady =
    typeof packet.closeout.empiricalPosture?.promotionReady === "boolean"
      ? packet.closeout.empiricalPosture.promotionReady
      : null;

  const kesPlan = createKesArtifactPlan(packageRoot, {
    diary: {
      kind: "validation",
      summary: `Consume autoresearch learning packet: ${packet.title}`,
      source: {
        kind: "manual",
        packageName: "pi-society-orchestrator",
        sessionId: input.sessionId,
        objective: "Owner-routed KES adapter proof for pi-autoresearch learning packets.",
      },
      actions: [
        "Validated an autoresearch.learning.v1 packet through the pi-society-orchestrator KES owner seam.",
        "Prepared package-owned diary capture plus candidate-only learning artifact without mutating pi-autoresearch, AK, Prompt Vault, ROCS, Oracle/DSPx, or external authority.",
      ],
      surprises: [
        "The adapter preserves pi-autoresearch as packet producer and pi-society-orchestrator/KES as the persistence owner.",
      ],
      patterns: [
        "External consumer proof should consume stable packets through the owning package instead of adding persistence to pi-autoresearch.",
      ],
      candidateHints: [packet.title],
      followUps: [
        "Review the candidate-only KES learning before promoting it beyond the package-owned learning surface.",
      ],
      metadata: {
        adapter_kind: AUTORESEARCH_LEARNING_KES_ADAPTER_KIND,
        adapter_action: action,
        packet_kind: packet.packetKind,
        campaign,
        suggested_path: packet.suggestedPath,
        empirical_decision_class: empiricalDecisionClass,
        promotion_ready: promotionReady,
        receipt_path: packet.closeout.receiptPath ?? null,
        packet_adapter_boundary: packet.adapterBoundary,
      },
      timestamp: input.timestamp,
    },
    learningCandidate: {
      kind: "learning",
      summary: packet.title,
      claim: packet.markdown,
      evidence: [
        `Consumed packet kind ${packet.packetKind} with adapter contract version ${packet.adapterContractVersion}.`,
        `Campaign: ${campaign ?? "unnamed"}.`,
        `Empirical decision: ${empiricalDecisionClass ?? "unknown"}.`,
        `Promotion ready: ${promotionReady === null ? "unknown" : String(promotionReady)}.`,
      ],
      heuristics: [
        "Keep autoresearch learning persistence outside pi-autoresearch; use owner-routed KES/notes surfaces for durable learning candidates.",
      ],
      antiPatterns: [
        "Do not turn autoresearch local packets into canonical learning authority by writing them directly from the experiment runtime.",
      ],
      followUps: [
        packet.closeout.recommendedAction ??
          "Review the learning candidate before any broader activation.",
      ],
      metadata: {
        adapter_kind: AUTORESEARCH_LEARNING_KES_ADAPTER_KIND,
        packet_kind: packet.packetKind,
        campaign,
        suggested_path: packet.suggestedPath,
        empirical_decision_class: empiricalDecisionClass,
        promotion_ready: promotionReady,
        receipt_path: packet.closeout.receiptPath ?? null,
      },
    },
  });

  const materializedPlan = action === "materialize" ? materializeKesArtifactPlan(kesPlan) : kesPlan;
  const writtenArtifacts =
    action === "materialize"
      ? [
          materializedPlan.diary.relativePath,
          ...(materializedPlan.learningCandidate
            ? [materializedPlan.learningCandidate.relativePath]
            : []),
        ]
      : [];

  return {
    kind: AUTORESEARCH_LEARNING_KES_ADAPTER_KIND,
    action,
    status: action === "materialize" ? "materialized" : "planned",
    packageRoot,
    source: {
      packetKind: packet.packetKind,
      title: packet.title,
      campaign,
      suggestedPath: packet.suggestedPath,
      empiricalDecisionClass,
      promotionReady,
    },
    kesPlan: materializedPlan,
    writtenArtifacts,
    effect: {
      kesArtifactsWritten: action === "materialize",
      piAutoresearchMutated: false,
      akCalled: false,
      externalAuthorityMutated: false,
      promotionStateChanged: false,
    },
    boundary: KES_ADAPTER_BOUNDARY,
  };
}

function validateAdapterAction(
  action: AutoresearchLearningKesAdapterAction,
): AutoresearchLearningKesAdapterAction {
  if (action !== "plan" && action !== "materialize") {
    throw new Error(`unsupported autoresearch learning KES adapter action: ${String(action)}`);
  }
  return action;
}

function validateAutoresearchLearningPacket(packet: unknown): AutoresearchLearningPacketV1 {
  if (!isRecord(packet)) {
    throw new Error("packet must be an object");
  }
  if (packet.packetKind !== "autoresearch.learning.v1") {
    throw new Error(`unsupported packetKind: ${String(packet.packetKind)}`);
  }
  if (packet.adapterContractVersion !== 1) {
    throw new Error(`unsupported adapterContractVersion: ${String(packet.adapterContractVersion)}`);
  }
  if (
    !Array.isArray(packet.targetKinds) ||
    packet.targetKinds.some((targetKind) => typeof targetKind !== "string") ||
    !packet.targetKinds.includes("kes")
  ) {
    throw new Error("targetKinds must be an array of strings that includes kes");
  }
  assertNonEmptyString(packet.title, "title");
  assertNonEmptyString(packet.markdown, "markdown");
  assertNonEmptyString(packet.adapterBoundary, "adapterBoundary");
  const suggestedPath = assertLearningPath(packet.suggestedPath, "suggestedPath");
  const closeout = validateLearningCloseout(packet.closeout);
  return {
    packetKind: packet.packetKind,
    adapterContractVersion: packet.adapterContractVersion,
    targetKinds: packet.targetKinds,
    suggestedPath,
    title: packet.title,
    markdown: packet.markdown,
    closeout,
    adapterBoundary: packet.adapterBoundary,
  } as AutoresearchLearningPacketV1;
}

function validateLearningCloseout(value: unknown): AutoresearchLearningPacketV1["closeout"] {
  if (!isRecord(value)) {
    throw new Error("closeout object is required");
  }
  const closeout: AutoresearchLearningPacketV1["closeout"] = {};
  closeout.packetKind = optionalNonEmptyString(value.packetKind, "closeout.packetKind");
  closeout.campaign = optionalNullableNonEmptyString(value.campaign, "closeout.campaign");
  closeout.empiricalDecisionClass = optionalNonEmptyString(
    value.empiricalDecisionClass,
    "closeout.empiricalDecisionClass",
  );
  closeout.recommendedAction = optionalNonEmptyString(
    value.recommendedAction,
    "closeout.recommendedAction",
  );
  closeout.receiptPath = optionalNonEmptyString(value.receiptPath, "closeout.receiptPath");
  if (value.empiricalPosture !== undefined) {
    if (!isRecord(value.empiricalPosture)) {
      throw new Error("closeout.empiricalPosture must be an object when present");
    }
    closeout.empiricalPosture = {
      promotionReady: optionalBoolean(
        value.empiricalPosture.promotionReady,
        "closeout.empiricalPosture.promotionReady",
      ),
      summary: optionalNonEmptyString(
        value.empiricalPosture.summary,
        "closeout.empiricalPosture.summary",
      ),
    };
  }
  return closeout;
}

function assertLearningPath(value: unknown, fieldName: string): string {
  assertNonEmptyString(value, fieldName);
  if (path.isAbsolute(value)) {
    throw new Error(`${fieldName} must be relative, not absolute`);
  }
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${fieldName} must not escape the selected KES learning root`);
  }
  if (!normalized.startsWith("docs/learnings/") || normalized.length <= "docs/learnings/".length) {
    throw new Error(`${fieldName} must stay under docs/learnings/ for the KES adapter`);
  }
  return normalized;
}

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

function optionalNonEmptyString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  assertNonEmptyString(value, fieldName);
  return value;
}

function optionalNullableNonEmptyString(
  value: unknown,
  fieldName: string,
): string | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalNonEmptyString(value, fieldName);
}

function optionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean when present`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
