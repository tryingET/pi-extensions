// ---
// summary: "Materializes one checkpoint-backed terminal KES bundle per loop execution."
// read_when:
//   - "Changing terminal loop capture, failure tombstones, package-root verification, or attributable learning claims."
// ---

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createKesArtifactPlan,
  KES_PACKAGE_MANIFEST_NAME,
  type KesArtifactPlan,
  KesMaterializationError,
  materializeKesArtifactPlan,
} from "../kes/index.ts";
import type { ExecutionStatus } from "../runtime/execution-status.ts";

const DEFAULT_LOOP_KES_PACKAGE_ROOT = path.resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);

export interface LoopKesArtifact {
  type: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface LoopKesTerminalPhase {
  phase: string;
  agent: string;
  primaryTool: string;
  status: ExecutionStatus;
  effectDisposition: "settled" | "confirmed_no_effects" | "effect_indeterminate";
  exitCode: number;
  elapsed: number;
  failureKind?: string;
  attemptId: string;
  outputBytes: number;
  outputSha256: string;
  outputTruncated: boolean;
  claimLineCount: number;
  learningClaimSha256?: string;
}

export interface LoopKesTerminalEntry {
  plugin: string;
  sessionId: string;
  objective: string;
  success: boolean;
  elapsed: number;
  phases: LoopKesTerminalPhase[];
  resumed: boolean;
  timestamp?: Date;
}

export interface PreparedLoopKesTerminal {
  plan: KesArtifactPlan;
  preparedId: string;
  artifacts: LoopKesArtifact[];
  hashes: Record<string, string>;
}

export function resolveLoopKesPackageRoot(override = process.env.PI_ORCH_KES_ROOT): string {
  return path.resolve(override || DEFAULT_LOOP_KES_PACKAGE_ROOT);
}

export interface LoopKesWriterOptions {
  allowUnverifiedPackageRoot?: boolean;
  afterMemberDurable?: (relativePath: string, memberIndex: number) => void;
}

export class LoopKesWriter {
  private packageRoot: string;
  private allowUnverifiedPackageRoot: boolean;
  private afterMemberDurable?: (relativePath: string, memberIndex: number) => void;

  constructor(packageRoot = resolveLoopKesPackageRoot(), options: LoopKesWriterOptions = {}) {
    this.packageRoot = path.resolve(packageRoot);
    this.allowUnverifiedPackageRoot = options.allowUnverifiedPackageRoot === true;
    this.afterMemberDurable = options.afterMemberDurable;
  }

  writeTerminal(entry: LoopKesTerminalEntry): LoopKesArtifact[] {
    const prepared = this.prepareTerminal(entry);
    return this.commitTerminal(prepared);
  }

  prepareTerminal(
    entry: LoopKesTerminalEntry,
    expectedPaths?: Array<{ type: string; path: string }>,
  ): PreparedLoopKesTerminal {
    const packageRoot = this.resolvePackageRootForWrite();
    const finalAttemptIds = new Set<string>();
    for (const phase of new Set(entry.phases.map((attempt) => attempt.phase))) {
      const finalAttempt = entry.phases.filter((attempt) => attempt.phase === phase).at(-1);
      if (finalAttempt) finalAttemptIds.add(finalAttempt.attemptId);
    }
    const explicitClaimLineCount = entry.phases.reduce(
      (count, attempt) => count + attempt.claimLineCount,
      0,
    );
    const soleClaimAttempt = entry.phases.find((attempt) => attempt.claimLineCount === 1);
    const claim =
      entry.success &&
      explicitClaimLineCount === 1 &&
      soleClaimAttempt?.learningClaimSha256 &&
      soleClaimAttempt.status === "done" &&
      soleClaimAttempt.effectDisposition === "settled" &&
      finalAttemptIds.has(soleClaimAttempt.attemptId)
        ? {
            claimSha256: soleClaimAttempt.learningClaimSha256,
            phase: soleClaimAttempt.phase,
            agent: soleClaimAttempt.agent,
            primaryTool: soleClaimAttempt.primaryTool,
            attemptId: soleClaimAttempt.attemptId,
          }
        : undefined;
    const failedPhase = [...entry.phases].reverse().find((phase) => phase.status !== "done");
    const objectiveHash = createHash("sha256").update(entry.objective).digest("hex");
    const phaseEvidence = entry.phases.map((phase) => ({
      phase: phase.phase,
      agent: phase.agent,
      primaryTool: phase.primaryTool,
      status: phase.status,
      exitCode: phase.exitCode,
      elapsed: phase.elapsed,
      ...(phase.failureKind ? { failureKind: phase.failureKind } : {}),
      attemptId: phase.attemptId,
      effectDisposition: phase.effectDisposition,
      outputBytes: phase.outputBytes,
      outputSha256: phase.outputSha256,
      outputTruncated: phase.outputTruncated,
      claimLineCount: phase.claimLineCount,
    }));

    const plan = createKesArtifactPlan(packageRoot, {
      diary: {
        kind: entry.success ? "complete" : "validation",
        summary: entry.success
          ? `${entry.plugin} terminal run ${entry.sessionId}`
          : `${entry.plugin} terminal failure ${entry.sessionId}`,
        source: {
          kind: "loop_summary",
          loop: entry.plugin,
          sessionId: entry.sessionId,
          objective: `sha256:${objectiveHash}`,
        },
        actions: entry.success
          ? [
              `Terminal outcome: success after ${entry.phases.length} phases in ${entry.elapsed}ms.`,
              `Checkpoint lineage: ${entry.resumed ? "resumed" : "new"} run ${entry.sessionId}.`,
            ]
          : [
              `Terminal outcome: failure after ${entry.phases.length} recorded phase attempts in ${entry.elapsed}ms.`,
              failedPhase
                ? `Failure tombstone: ${failedPhase.phase} ended ${failedPhase.status}${failedPhase.failureKind ? ` (${failedPhase.failureKind})` : ""}.`
                : "Failure tombstone: execution ended before a phase result was recorded.",
            ],
        surprises: undefined,
        patterns: claim
          ? [`Explicit attributable claim from ${claim.phase}/${claim.agent}/${claim.primaryTool}.`]
          : undefined,
        candidateHints: claim
          ? ["One explicit attributable claim was staged as a candidate-only learning."]
          : undefined,
        followUps: entry.success
          ? claim
            ? ["Review the linked candidate before any cross-owner promotion."]
            : [
                "No learning candidate was emitted because there was not exactly one explicit claim.",
              ]
          : ["Use the checkpoint lineage and owner evidence to diagnose or explicitly resume."],
        metadata: {
          event: entry.success ? "terminal_success" : "terminal_failure",
          terminal: true,
          success: entry.success,
          elapsed: entry.elapsed,
          resumed: entry.resumed,
          objectiveSha256: objectiveHash,
          phaseEvidence,
          explicitClaimLineCount,
          admittedRunWideClaim: Boolean(claim),
        },
        timestamp: entry.timestamp,
      },
      learningCandidate: claim
        ? {
            kind: "learning",
            summary: `${entry.plugin} attributable run claim ${entry.sessionId}`,
            claim: `Private attributable claim digest: ${claim.claimSha256}`,
            evidence: [
              `Source diary contains the package-owned terminal evidence bundle for run ${entry.sessionId}.`,
              `Attribution: phase=${claim.phase}; agent=${claim.agent}; cognitive_tool=${claim.primaryTool}${claim.attemptId ? `; attempt=${claim.attemptId}` : ""}.`,
            ],
            heuristics: [
              "Stage only a digest of claims explicitly marked KES_CLAIM by a successful phase; review private checkpoint evidence before promotion.",
            ],
            antiPatterns: [
              "Do not infer a learning from cognitive-tool selection, phase success, or unmarked prose.",
            ],
            followUps: [
              "Review this candidate against the linked terminal diary before promotion.",
            ],
            metadata: {
              event: "terminal_claim_candidate",
              sessionId: entry.sessionId,
              phase: claim.phase,
              agent: claim.agent,
              primaryTool: claim.primaryTool,
              attemptId: claim.attemptId || null,
              claimSha256: claim.claimSha256,
              objectiveSha256: objectiveHash,
            },
          }
        : undefined,
    });

    if (expectedPaths) applyExpectedPaths(plan, packageRoot, expectedPaths);
    const artifacts = toLoopArtifacts(plan);
    const hashes = Object.fromEntries(
      [plan.diary, plan.learningCandidate]
        .filter((draft): draft is NonNullable<typeof draft> => Boolean(draft))
        .map((draft) => [
          draft.relativePath,
          `sha256:${createHash("sha256").update(draft.content).digest("hex")}`,
        ]),
    );
    return {
      plan,
      preparedId: `sha256:${createHash("sha256")
        .update(JSON.stringify({ sessionId: entry.sessionId, hashes }))
        .digest("hex")}`,
      artifacts,
      hashes,
    };
  }

  reconcilePreparedTemps(expected: Array<{ path: string; hash: string }>): void {
    const packageRoot = this.resolvePackageRootForWrite();
    for (const artifact of expected) {
      const finalPath = path.resolve(packageRoot, artifact.path);
      if (!finalPath.startsWith(`${packageRoot}${path.sep}`)) {
        throw new Error("Prepared terminal path escaped the package root.");
      }
      const directory = path.dirname(finalPath);
      if (!fs.existsSync(directory)) continue;
      const prefix = `.${path.basename(finalPath)}.`;
      for (const name of fs.readdirSync(directory)) {
        if (!name.startsWith(prefix) || !name.endsWith(".tmp")) continue;
        const temporaryPath = path.join(directory, name);
        const stat = fs.lstatSync(temporaryPath);
        const finalStat = fs.existsSync(finalPath) ? fs.lstatSync(finalPath) : undefined;
        const linkedOnlyToFinal =
          stat.nlink === 2 &&
          finalStat?.isFile() === true &&
          !finalStat.isSymbolicLink() &&
          finalStat.dev === stat.dev &&
          finalStat.ino === stat.ino;
        const hash = stat.isFile()
          ? `sha256:${createHash("sha256").update(fs.readFileSync(temporaryPath)).digest("hex")}`
          : "invalid";
        if (
          stat.isSymbolicLink() ||
          !stat.isFile() ||
          (stat.nlink !== 1 && !linkedOnlyToFinal) ||
          (typeof process.getuid === "function" && stat.uid !== process.getuid()) ||
          hash !== artifact.hash
        ) {
          throw new Error(`Untrusted terminal staging file blocks reconciliation: ${name}`);
        }
        fs.unlinkSync(temporaryPath);
        const directoryHandle = fs.openSync(directory, "r");
        try {
          fs.fsyncSync(directoryHandle);
        } finally {
          fs.closeSync(directoryHandle);
        }
      }
    }
  }

  commitTerminal(prepared: PreparedLoopKesTerminal): LoopKesArtifact[] {
    materializeKesArtifactPlan(prepared.plan, {
      acceptIdenticalExisting: true,
      afterMemberDurable: this.afterMemberDurable,
    });
    return prepared.artifacts;
  }

  private resolvePackageRootForWrite(): string {
    if (!this.allowUnverifiedPackageRoot) {
      assertLoopKesPackageRoot(this.packageRoot);
    }
    return this.packageRoot;
  }
}

function applyExpectedPaths(
  plan: KesArtifactPlan,
  packageRoot: string,
  expected: Array<{ type: string; path: string }>,
): void {
  const drafts = [plan.diary, plan.learningCandidate].filter(
    (draft): draft is NonNullable<typeof draft> => Boolean(draft),
  );
  if (drafts.length !== expected.length) {
    throw new Error("Prepared terminal KES artifact count changed during replay.");
  }
  for (let index = 0; index < drafts.length; index += 1) {
    const draft = drafts[index];
    const descriptor = expected[index];
    const expectedType = draft.kind === "diary" ? "kes_diary" : "kes_learning_candidate";
    if (descriptor.type !== expectedType) {
      throw new Error("Prepared terminal KES artifact order changed during replay.");
    }
    const allowedPrefix = draft.kind === "diary" ? "diary/" : "docs/learnings/";
    if (!descriptor.path.startsWith(allowedPrefix) || descriptor.path.includes("..")) {
      throw new Error(`Prepared terminal KES path is invalid: ${descriptor.path}`);
    }
    const oldPath = draft.relativePath;
    draft.relativePath = descriptor.path;
    draft.absolutePath = path.resolve(packageRoot, descriptor.path);
    if (draft.kind === "diary" && plan.learningCandidate) {
      plan.learningCandidate.content = plan.learningCandidate.content.replaceAll(
        oldPath,
        descriptor.path,
      );
      plan.learningCandidate.metadata.source_diary = descriptor.path;
    }
  }
}

function assertLoopKesPackageRoot(packageRoot: string): void {
  try {
    const manifestPath = path.join(packageRoot, "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { name?: unknown };
    if (manifest.name !== KES_PACKAGE_MANIFEST_NAME) {
      throw new Error(`package.json#name must be ${KES_PACKAGE_MANIFEST_NAME}`);
    }
  } catch (cause) {
    throw new KesMaterializationError({ operation: "ensure_roots", packageRoot, cause });
  }
}

function toLoopArtifacts(plan: ReturnType<typeof createKesArtifactPlan>): LoopKesArtifact[] {
  const drafts = [plan.diary, plan.learningCandidate].filter(
    (draft): draft is NonNullable<typeof draft> => Boolean(draft),
  );
  return drafts.map((draft) => ({
    type: draft.kind === "diary" ? "kes_diary" : "kes_learning_candidate",
    content: draft.relativePath,
    metadata: {
      ...draft.metadata,
      title: draft.title,
      absolutePath: draft.absolutePath,
    },
  }));
}
