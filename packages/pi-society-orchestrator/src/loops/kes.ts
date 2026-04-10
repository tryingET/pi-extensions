import path from "node:path";
import { fileURLToPath } from "node:url";
import { createKesArtifactPlan, materializeKesArtifactPlan } from "../kes/index.ts";
import type { EvidenceWriteResult, SkippedEvidenceWriteResult } from "../runtime/evidence.ts";
import type { ExecutionStatus } from "../runtime/execution-status.ts";

const DEFAULT_LOOP_KES_PACKAGE_ROOT = path.resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);

export interface LoopKesArtifact {
  type: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface LoopKesStartEntry {
  plugin: string;
  sessionId: string;
  objective: string;
  phases: string[];
  timestamp?: Date;
}

export interface LoopKesPhaseEntry {
  plugin: string;
  phase: string;
  sessionId: string;
  objective: string;
  agent: string;
  primaryTool: string;
  output: string;
  status: ExecutionStatus;
  exitCode: number;
  elapsed: number;
  failureKind?: string;
  evidence: EvidenceWriteResult | SkippedEvidenceWriteResult;
  hookArtifacts?: LoopKesArtifact[];
  timestamp?: Date;
}

export interface LoopKesCompleteEntry {
  plugin: string;
  sessionId: string;
  objective: string;
  success: boolean;
  elapsed: number;
  phases: Array<{
    phase: string;
    status: ExecutionStatus;
    elapsed: number;
    failureKind?: string;
  }>;
  emittedArtifacts: LoopKesArtifact[];
  timestamp?: Date;
}

export function resolveLoopKesPackageRoot(override = process.env.PI_ORCH_KES_ROOT): string {
  return path.resolve(override || DEFAULT_LOOP_KES_PACKAGE_ROOT);
}

export class LoopKesWriter {
  private packageRoot: string;

  constructor(packageRoot = resolveLoopKesPackageRoot()) {
    this.packageRoot = packageRoot;
  }

  writeStart(entry: LoopKesStartEntry): LoopKesArtifact[] {
    const plan = createKesArtifactPlan(this.packageRoot, {
      diary: {
        kind: "session",
        summary: `${entry.plugin} loop start for ${entry.objective}`,
        source: {
          kind: "loop_summary",
          loop: entry.plugin,
          sessionId: entry.sessionId,
          objective: entry.objective,
        },
        actions: [
          `Initialized the ${entry.plugin} loop with ${entry.phases.length} phases.`,
          `Planned phase order: ${entry.phases.join(" -> ")}.`,
        ],
        followUps: ["Review phase-level KES captures as the loop progresses."],
        metadata: {
          event: "start",
          phases: entry.phases,
        },
        timestamp: entry.timestamp,
      },
    });

    materializeKesArtifactPlan(plan);
    return toLoopArtifacts(plan);
  }

  writePhase(entry: LoopKesPhaseEntry): LoopKesArtifact[] {
    const excerpt = summarizeOutput(entry.output);
    const plan = createKesArtifactPlan(this.packageRoot, {
      diary: {
        kind: "phase",
        summary: `${entry.plugin} ${entry.phase} phase for ${entry.objective}`,
        source: {
          kind: "loop_phase",
          loop: entry.plugin,
          phase: entry.phase,
          sessionId: entry.sessionId,
          objective: entry.objective,
        },
        actions: [
          `Ran ${entry.phase} with agent ${entry.agent} using cognitive tool ${entry.primaryTool}.`,
          `Execution status: ${entry.status} (exit ${entry.exitCode}, ${entry.elapsed}ms).`,
          `Evidence write outcome: ${formatEvidenceOutcome(entry.evidence)}.`,
          excerpt ? `Captured output excerpt: ${excerpt}` : "Captured no non-empty output excerpt.",
          ...(entry.hookArtifacts && entry.hookArtifacts.length > 0
            ? [
                `Phase hooks emitted artifacts before KES capture: ${entry.hookArtifacts.map((artifact) => artifact.type).join(", ")}.`,
              ]
            : []),
        ],
        surprises: entry.failureKind ? [`Failure kind: ${entry.failureKind}.`] : undefined,
        candidateHints: shouldEmitLearningCandidate(entry)
          ? ["Review the paired candidate-only learning artifact before any broader promotion."]
          : undefined,
        followUps:
          entry.status === "done"
            ? shouldEmitLearningCandidate(entry)
              ? ["Review the linked learning candidate under docs/learnings/."]
              : ["Inspect the raw diary capture before reusing this phase output elsewhere."]
            : ["Inspect the raw diary capture before trusting downstream loop synthesis."],
        metadata: {
          event: "phase",
          agent: entry.agent,
          primaryTool: entry.primaryTool,
          status: entry.status,
          exitCode: entry.exitCode,
          elapsed: entry.elapsed,
          failureKind: entry.failureKind || null,
          evidence: entry.evidence,
          hookArtifacts: entry.hookArtifacts?.map((artifact) => artifact.content) || [],
        },
        timestamp: entry.timestamp,
      },
      learningCandidate: shouldEmitLearningCandidate(entry)
        ? {
            kind: "learning",
            summary: `${entry.plugin} ${entry.phase} crystallization candidate for ${entry.objective}`,
            claim: `The ${entry.plugin} ${entry.phase} phase surfaced reusable material for ${JSON.stringify(entry.objective)}; review the linked diary entry before promoting it beyond this package.`,
            evidence: [
              `Phase status: ${entry.status}.`,
              `Primary cognitive tool: ${entry.primaryTool}.`,
              excerpt
                ? `Captured output excerpt: ${excerpt}`
                : "The phase completed without a stable output excerpt.",
            ],
            heuristics: [
              "Promote only after confirming the candidate still matches the full raw diary capture.",
            ],
            antiPatterns: [
              "Do not treat candidate-only KES output as a canonical learning without review.",
              "Do not promote failed or partial loop output beyond the linked diary evidence.",
            ],
            followUps: [
              "Review the linked diary entry and explicitly decide whether to elevate this candidate.",
            ],
            metadata: {
              event: "phase_candidate",
              agent: entry.agent,
              primaryTool: entry.primaryTool,
              status: entry.status,
            },
          }
        : undefined,
    });

    materializeKesArtifactPlan(plan);
    return toLoopArtifacts(plan);
  }

  writeComplete(entry: LoopKesCompleteEntry): LoopKesArtifact[] {
    const failedPhases = entry.phases.filter((phase) => phase.status !== "done");
    const learningCandidates = entry.emittedArtifacts.filter(
      (artifact) => artifact.type === "kes_learning_candidate",
    );
    const plan = createKesArtifactPlan(this.packageRoot, {
      diary: {
        kind: "complete",
        summary: `${entry.plugin} loop completion for ${entry.objective}`,
        source: {
          kind: "loop_summary",
          loop: entry.plugin,
          sessionId: entry.sessionId,
          objective: entry.objective,
        },
        actions: [
          `Completed ${entry.phases.length} phases in ${entry.elapsed}ms.`,
          `Overall outcome: ${entry.success ? "success" : "completed with failures"}.`,
          `Emitted ${entry.emittedArtifacts.length} package-owned KES artifacts during this loop run.`,
        ],
        surprises:
          failedPhases.length > 0
            ? [
                `Non-success phases: ${failedPhases.map((phase) => `${phase.phase} (${phase.status})`).join(", ")}.`,
              ]
            : undefined,
        candidateHints:
          learningCandidates.length > 0
            ? learningCandidates.map(
                (artifact) => `Review candidate-only learning artifact ${artifact.content}.`,
              )
            : undefined,
        followUps:
          failedPhases.length > 0
            ? ["Investigate failed phases before treating this loop run as reusable knowledge."]
            : ["Review the emitted diary and candidate-only learning artifacts for promotion."],
        metadata: {
          event: "complete",
          success: entry.success,
          elapsed: entry.elapsed,
          phases: entry.phases,
          artifactPaths: entry.emittedArtifacts.map((artifact) => artifact.content),
        },
        timestamp: entry.timestamp,
      },
    });

    materializeKesArtifactPlan(plan);
    return toLoopArtifacts(plan);
  }
}

function toLoopArtifacts(plan: ReturnType<typeof createKesArtifactPlan>): LoopKesArtifact[] {
  const artifacts: LoopKesArtifact[] = [toLoopArtifact(plan.diary)];
  if (plan.learningCandidate) {
    artifacts.push(toLoopArtifact(plan.learningCandidate));
  }
  return artifacts;
}

function toLoopArtifact(draft: {
  kind: "diary" | "learning_candidate";
  relativePath: string;
  absolutePath: string;
  title: string;
  metadata: Record<string, unknown>;
}): LoopKesArtifact {
  return {
    type: draft.kind === "diary" ? "kes_diary" : "kes_learning_candidate",
    content: draft.relativePath,
    metadata: {
      ...draft.metadata,
      title: draft.title,
      absolutePath: draft.absolutePath,
    },
  };
}

function shouldEmitLearningCandidate(entry: LoopKesPhaseEntry): boolean {
  return entry.status === "done" && entry.primaryTool === "knowledge-crystallization";
}

function summarizeOutput(output: string, maxLength = 220): string {
  const normalized = output.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatEvidenceOutcome(evidence: EvidenceWriteResult | SkippedEvidenceWriteResult): string {
  if (evidence.ok) {
    return evidence.via;
  }
  if (evidence.via === "skipped") {
    return `${evidence.via} (${evidence.reason})`;
  }
  return evidence.via;
}
