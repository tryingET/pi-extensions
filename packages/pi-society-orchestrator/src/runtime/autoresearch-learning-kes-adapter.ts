// ---
// summary: "Validates autoresearch learning packets and plans or materializes bounded KES diary and candidate-learning artifacts with source snapshots."
// read_when:
//   - "Changing the autoresearch learning-owner seam, source evidence hashing, receipt previews, packet validation, or KES materialization."
// ---

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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

export type AutoresearchPacketHashKind = "raw_file" | "normalized_packet";

export interface AutoresearchLearningPacketSource {
  packetPath: string;
  packetRawSha256: string;
  packetDir: string;
  campaignRoot: string | null;
}

export interface AutoresearchSourceEvidencePolicy {
  allowReceiptSnapshot?: boolean;
  maxReceiptBytes?: number;
}

export interface AutoresearchSourceEvidenceSnapshot {
  packetSha256: string;
  packetHashKind: AutoresearchPacketHashKind;
  packetPath: string | null;
  receiptPath: string | null;
  receiptExists: boolean | null;
  receiptSha256: string | null;
  receiptBytes: number | null;
  receiptLineCount: number | null;
  receiptTailPreview: string[];
  warnings: string[];
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
    receiptPath: string | null;
  };
  sourceEvidenceWarnings: string[];
  sourceEvidenceSnapshot: AutoresearchSourceEvidenceSnapshot;
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
  packetSource?: AutoresearchLearningPacketSource;
  sourceEvidencePolicy?: AutoresearchSourceEvidencePolicy;
}

export interface LoadedAutoresearchLearningPacket {
  packet: unknown;
  source: AutoresearchLearningPacketSource;
}

const KES_ADAPTER_BOUNDARY =
  "pi-society-orchestrator consumes autoresearch.learning.v1 as the KES/learning owner seam; plan is non-mutating, materialize writes only package-owned KES diary and candidate-only docs/learnings artifacts, and neither action mutates pi-autoresearch, AK, Prompt Vault, ROCS, Oracle/DSPx, or promotion state.";
const DEFAULT_MAX_SOURCE_PACKET_BYTES = 1024 * 1024;
const DEFAULT_MAX_RECEIPT_SNAPSHOT_BYTES = 1024 * 1024;
const ABSOLUTE_MAX_SOURCE_EVIDENCE_BYTES = 10 * 1024 * 1024;

function sha256Hex(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeMaxBytes(
  value: number | undefined,
  defaultValue: number,
  fieldName: string,
): number {
  if (value === undefined) return defaultValue;
  if (!Number.isSafeInteger(value) || value < 1 || value > ABSOLUTE_MAX_SOURCE_EVIDENCE_BYTES) {
    throw new Error(
      `${fieldName} must be a safe integer between 1 and ${ABSOLUTE_MAX_SOURCE_EVIDENCE_BYTES}`,
    );
  }
  return value;
}

function readRegularFileBounded(filePath: string, maxBytes: number, label: string): Buffer {
  const noFollowFlag = "O_NOFOLLOW" in fs.constants ? fs.constants.O_NOFOLLOW : 0;
  const fd = fs.openSync(filePath, fs.constants.O_RDONLY | noFollowFlag);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) {
      throw new Error(`${label} is not a regular file: ${filePath}`);
    }
    if (stat.size > maxBytes) {
      throw new Error(`${label} exceeds source evidence limit (${stat.size} > ${maxBytes} bytes)`);
    }

    const chunks: Buffer[] = [];
    const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1));
    let total = 0;
    while (total <= maxBytes) {
      const bytesRead = fs.readSync(
        fd,
        buffer,
        0,
        Math.min(buffer.length, maxBytes + 1 - total),
        null,
      );
      if (bytesRead === 0) break;
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
      total += bytesRead;
    }
    if (total > maxBytes) {
      throw new Error(`${label} exceeds source evidence limit while reading (> ${maxBytes} bytes)`);
    }
    return Buffer.concat(chunks, total);
  } finally {
    fs.closeSync(fd);
  }
}

function inferCampaignRootFromPacketPath(packetPath: string): string | null {
  const packetDir = path.dirname(packetPath);
  return path.basename(packetDir) === ".autoresearch" ? path.dirname(packetDir) : null;
}

function redactReceiptPreviewLine(line: string): string {
  return line
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s"']+/giu, "$1[REDACTED]")
    .replace(
      /((?:password|passwd|secret|token|api[_-]?key)\s*["']?\s*[:=]\s*["']?)[^"'\s,}]+/giu,
      "$1[REDACTED]",
    );
}

function resolveReceiptPathForSnapshot(input: {
  receiptPath: string;
  packetSource?: AutoresearchLearningPacketSource;
}): string | null {
  if (path.isAbsolute(input.receiptPath)) return path.resolve(input.receiptPath);
  if (!input.packetSource?.campaignRoot) return null;
  return path.resolve(input.packetSource.campaignRoot, input.receiptPath);
}

function verifyPacketSource(
  source: AutoresearchLearningPacketSource,
  packet: AutoresearchLearningPacketV1,
): AutoresearchLearningPacketSource {
  const packetContent = readRegularFileBounded(
    source.packetPath,
    DEFAULT_MAX_SOURCE_PACKET_BYTES,
    "source packet",
  );
  const actualHash = sha256Hex(packetContent);
  if (actualHash !== source.packetRawSha256) {
    throw new Error("packetSource.packetRawSha256 does not match packetSource.packetPath content");
  }
  const sourcePacket = validateAutoresearchLearningPacket(
    JSON.parse(packetContent.toString("utf8")),
  );
  if (JSON.stringify(sourcePacket) !== JSON.stringify(packet)) {
    throw new Error("packetSource.packetPath content does not match the packet being adapted");
  }
  return {
    packetPath: path.resolve(source.packetPath),
    packetRawSha256: actualHash,
    packetDir: path.dirname(path.resolve(source.packetPath)),
    campaignRoot: inferCampaignRootFromPacketPath(path.resolve(source.packetPath)),
  };
}

function buildSourceEvidenceSnapshot(
  packet: AutoresearchLearningPacketV1,
  packetSource?: AutoresearchLearningPacketSource,
  policy: AutoresearchSourceEvidencePolicy = {},
): AutoresearchSourceEvidenceSnapshot {
  const warnings: string[] = [];
  const verifiedPacketSource = packetSource ? verifyPacketSource(packetSource, packet) : undefined;
  const snapshot: AutoresearchSourceEvidenceSnapshot = {
    packetSha256: verifiedPacketSource?.packetRawSha256 ?? sha256Hex(JSON.stringify(packet)),
    packetHashKind: verifiedPacketSource ? "raw_file" : "normalized_packet",
    packetPath: verifiedPacketSource?.packetPath ?? null,
    receiptPath: null,
    receiptExists: null,
    receiptSha256: null,
    receiptBytes: null,
    receiptLineCount: null,
    receiptTailPreview: [],
    warnings,
  };

  if (!verifiedPacketSource) {
    warnings.push(
      "source packet hash is semantic only; raw packet bytes were not supplied to the adapter core",
    );
  }
  if (policy.allowReceiptSnapshot === false) {
    warnings.push("receipt snapshot disabled by source evidence policy");
    return snapshot;
  }

  const receiptPath = packet.closeout.receiptPath?.trim();
  if (!receiptPath) {
    warnings.push(
      "closeout receiptPath is absent; the candidate-only learning has no direct local receipt reference to inspect before promotion",
    );
    return snapshot;
  }

  const resolvedReceiptPath = resolveReceiptPathForSnapshot({
    receiptPath,
    packetSource: verifiedPacketSource,
  });
  if (!resolvedReceiptPath) {
    warnings.push(
      `relative closeout receiptPath cannot be snapshotted without a packet-derived campaign root: ${receiptPath}`,
    );
    return snapshot;
  }
  snapshot.receiptPath = resolvedReceiptPath;

  if (!verifiedPacketSource?.campaignRoot) {
    warnings.push(
      "receipt snapshot skipped because packet path is not under a .autoresearch campaign export directory",
    );
    return snapshot;
  }

  let realCampaignRoot: string;
  let realReceiptPath: string;
  try {
    realCampaignRoot = fs.realpathSync(verifiedPacketSource.campaignRoot);
    realReceiptPath = fs.realpathSync(resolvedReceiptPath);
  } catch {
    realCampaignRoot = fs.realpathSync(verifiedPacketSource.campaignRoot);
    realReceiptPath = resolvedReceiptPath;
  }
  snapshot.receiptPath = realReceiptPath;
  if (!isPathInside(realCampaignRoot, realReceiptPath)) {
    warnings.push(
      `closeout receiptPath is outside the packet-derived campaign root and was not read: ${realReceiptPath}`,
    );
    return snapshot;
  }

  const tmpRoots = Array.from(
    new Set([os.tmpdir(), "/tmp"].map((tmpRoot) => path.resolve(tmpRoot))),
  );
  if (
    tmpRoots.some(
      (tmpRoot) =>
        realReceiptPath === tmpRoot || realReceiptPath.startsWith(`${tmpRoot}${path.sep}`),
    )
  ) {
    warnings.push(
      `closeout receiptPath is under a temp directory and may disappear before review: ${realReceiptPath}`,
    );
  }
  if (!fs.existsSync(realReceiptPath)) {
    snapshot.receiptExists = false;
    warnings.push(
      `closeout receiptPath does not exist at adapter time; preserve or regenerate source evidence before promotion: ${realReceiptPath}`,
    );
    return snapshot;
  }

  const maxReceiptBytes = normalizeMaxBytes(
    policy.maxReceiptBytes,
    DEFAULT_MAX_RECEIPT_SNAPSHOT_BYTES,
    "sourceEvidencePolicy.maxReceiptBytes",
  );

  try {
    const receiptStat = fs.statSync(realReceiptPath);
    if (!receiptStat.isFile()) {
      warnings.push(
        `closeout receiptPath is not a regular file and was not read: ${realReceiptPath}`,
      );
      return snapshot;
    }
    if (receiptStat.size > maxReceiptBytes) {
      snapshot.receiptExists = true;
      snapshot.receiptBytes = receiptStat.size;
      warnings.push(
        `closeout receiptPath exceeds source evidence snapshot limit (${receiptStat.size} > ${maxReceiptBytes} bytes) and was not read: ${realReceiptPath}`,
      );
      return snapshot;
    }

    const receiptContent = readRegularFileBounded(
      realReceiptPath,
      maxReceiptBytes,
      "closeout receiptPath",
    );
    const receiptText = receiptContent.toString("utf8");
    const receiptLines = receiptText.split(/\r?\n/u).filter((line) => line.length > 0);
    snapshot.receiptExists = true;
    snapshot.receiptSha256 = sha256Hex(receiptContent);
    snapshot.receiptBytes = receiptContent.byteLength;
    snapshot.receiptLineCount = receiptLines.length;
    snapshot.receiptTailPreview = receiptLines
      .slice(-5)
      .map(redactReceiptPreviewLine)
      .map((line) => (line.length > 500 ? `${line.slice(0, 500)}…[truncated]` : line));
  } catch (error) {
    snapshot.receiptExists = false;
    warnings.push(
      `closeout receiptPath could not be snapshotted at adapter time: ${realReceiptPath}; ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return snapshot;
}

export function loadAutoresearchLearningPacketWithSource(
  packetPath: string,
): LoadedAutoresearchLearningPacket {
  const resolvedPacketPath = path.resolve(packetPath);
  const packetContent = readRegularFileBounded(
    resolvedPacketPath,
    DEFAULT_MAX_SOURCE_PACKET_BYTES,
    "source packet",
  );
  return {
    packet: JSON.parse(packetContent.toString("utf8")),
    source: {
      packetPath: resolvedPacketPath,
      packetRawSha256: sha256Hex(packetContent),
      packetDir: path.dirname(resolvedPacketPath),
      campaignRoot: inferCampaignRootFromPacketPath(resolvedPacketPath),
    },
  };
}

export function loadAutoresearchLearningPacket(packetPath: string): unknown {
  return loadAutoresearchLearningPacketWithSource(packetPath).packet;
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
  const sourceEvidenceSnapshot = buildSourceEvidenceSnapshot(
    packet,
    input.packetSource,
    input.sourceEvidencePolicy,
  );
  const sourceEvidenceWarnings = sourceEvidenceSnapshot.warnings;

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
        `Snapshotted source packet ${sourceEvidenceSnapshot.packetHashKind} hash ${sourceEvidenceSnapshot.packetSha256}.`,
        ...(sourceEvidenceSnapshot.receiptSha256
          ? [`Snapshotted receipt hash ${sourceEvidenceSnapshot.receiptSha256}.`]
          : []),
        ...sourceEvidenceWarnings.map((warning) => `Recorded source-evidence warning: ${warning}`),
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
        ...sourceEvidenceWarnings.map(
          (warning) =>
            `Resolve or explicitly accept source-evidence warning before broader promotion: ${warning}`,
        ),
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
        source_evidence_warnings: sourceEvidenceWarnings,
        source_evidence_snapshot: sourceEvidenceSnapshot,
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
        `Source packet sha256 (${sourceEvidenceSnapshot.packetHashKind}): ${sourceEvidenceSnapshot.packetSha256}.`,
        sourceEvidenceSnapshot.receiptSha256
          ? `Source receipt sha256: ${sourceEvidenceSnapshot.receiptSha256} (${sourceEvidenceSnapshot.receiptBytes ?? "unknown"} bytes, ${sourceEvidenceSnapshot.receiptLineCount ?? "unknown"} lines).`
          : "Source receipt sha256: unavailable.",
        ...sourceEvidenceSnapshot.receiptTailPreview.map(
          (line) => `Source receipt tail preview: ${line}`,
        ),
        ...sourceEvidenceWarnings.map((warning) => `Source evidence warning: ${warning}`),
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
        ...sourceEvidenceWarnings.map(
          (warning) =>
            `Resolve or explicitly accept source-evidence warning before broader promotion: ${warning}`,
        ),
      ],
      metadata: {
        adapter_kind: AUTORESEARCH_LEARNING_KES_ADAPTER_KIND,
        packet_kind: packet.packetKind,
        campaign,
        suggested_path: packet.suggestedPath,
        empirical_decision_class: empiricalDecisionClass,
        promotion_ready: promotionReady,
        receipt_path: packet.closeout.receiptPath ?? null,
        source_evidence_warnings: sourceEvidenceWarnings,
        source_evidence_snapshot: sourceEvidenceSnapshot,
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
      receiptPath: packet.closeout.receiptPath ?? null,
    },
    sourceEvidenceWarnings,
    sourceEvidenceSnapshot,
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
