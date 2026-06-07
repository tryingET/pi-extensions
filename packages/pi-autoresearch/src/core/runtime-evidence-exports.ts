import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { slugAutoresearchName } from "./runtime-autoplan.ts";
import { buildAutoresearchSegmentCloseout } from "./runtime-closeout.ts";
import {
  AUTORESEARCH_LEARNING_EXPORT_FILE,
  AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE,
} from "./runtime-constants.ts";
import { formatMetricInterpretation, formatMetricValue } from "./runtime-format.ts";
import type {
  AutoresearchAkEvidencePacket,
  AutoresearchKnowledgeExportPacket,
  AutoresearchLearningExportResult,
  AutoresearchOracleEvidenceExportResult,
  AutoresearchOracleEvidencePacket,
  AutoresearchOracleEvidenceRecord,
  AutoresearchOraclePublicationPreflightSummary,
  AutoresearchSegmentCloseout,
  AutoresearchSegmentCloseoutRun,
} from "./runtime-model.ts";
import { resolveAutoresearchPacketExportPath } from "./runtime-packet-export-paths.ts";
import { formatCandidateBindingLines } from "./runtime-status-format.ts";

function stableAutoresearchOracleRecordId(input: unknown): string {
  return `autoresearch-run-${createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16)}`;
}

function buildAutoresearchOracleText(input: {
  closeout: AutoresearchSegmentCloseout;
  run: AutoresearchSegmentCloseoutRun;
}): string {
  const { closeout, run } = input;
  const candidateLabel =
    run.experiment?.candidate?.branch ??
    run.experiment?.candidate?.worktreePath ??
    run.experiment?.candidate?.diffSummary ??
    "no candidate binding";
  return [
    `autoresearch campaign=${closeout.campaign ?? "unnamed"}`,
    `metric=${closeout.metricName ?? "unset"} ${closeout.metricUnit || "unitless"} direction=${closeout.direction ?? "unset"}`,
    `run_status=${run.status} run_kind=${run.runKind} empirical_decision=${run.empiricalDecisionClass}`,
    `metric_value=${String(run.metric)} checks=${run.checks}`,
    `hypothesis=${run.experiment?.hypothesis ?? "none"}`,
    `intervention=${run.experiment?.interventionSummary ?? "none"}`,
    `candidate=${candidateLabel}`,
    `description=${run.description}`,
  ].join("\n");
}

function buildAutoresearchOracleEvidenceRecords(
  closeout: AutoresearchSegmentCloseout,
): AutoresearchOracleEvidenceRecord[] {
  return closeout.runs.map((run) => {
    const recordIdentity = {
      cwd: closeout.cwd,
      receiptPath: closeout.receiptPath,
      campaign: closeout.campaign,
      metricName: closeout.metricName,
      iteration: run.iteration,
      timestamp: run.timestamp,
      description: run.description,
      metric: run.metric,
    };
    return {
      recordKind: "autoresearch.campaign_run.oracle_evidence.v1",
      recordId: stableAutoresearchOracleRecordId(recordIdentity),
      campaign: closeout.campaign,
      metricName: closeout.metricName,
      metricUnit: closeout.metricUnit,
      direction: closeout.direction,
      runStatus: run.status,
      runKind: run.runKind,
      empiricalDecisionClass: run.empiricalDecisionClass,
      metric: run.metric,
      timestamp: run.timestamp,
      description: run.description,
      checks: run.checks,
      hypothesisId: run.experiment?.hypothesisId ?? null,
      hypothesis: run.experiment?.hypothesis ?? null,
      interventionSummary: run.experiment?.interventionSummary ?? null,
      candidate: run.experiment?.candidate ?? null,
      oracleText: buildAutoresearchOracleText({ closeout, run }),
      sourceRefs: {
        receiptPath: closeout.receiptPath,
        closeoutPacketKind: "autoresearch.closeout.v1",
        runIteration: run.iteration,
        runTimestamp: run.timestamp,
      },
      nonAuthority: true,
    };
  });
}

function buildAutoresearchOraclePublicationPreflightSummary(
  recordCount: number,
): AutoresearchOraclePublicationPreflightSummary {
  const blockedReasons = recordCount === 0 ? ["no campaign run receipts are available"] : [];
  return {
    status:
      blockedReasons.length > 0 ? "blocked_no_campaign_evidence" : "ready_for_dspx_owner_review",
    target: "dspx_oracle_postgres_pgvector",
    publicationLabel: "retained_behavior_memory_candidate",
    sharedOracleMutated: false,
    localCoordinatesDbMigrated: false,
    canonicalAuthorityMutated: false,
    blockedReasons,
    suggestedDspxOwnerAction:
      recordCount === 0
        ? "collect at least one bounded campaign run before preparing DSPx Oracle publication preflight"
        : "map this packet into DSPx-owned program-oracle evidence artifacts, then run DSPx publication preflight from the DSPx owner surface before any shared write",
    suggestedDspxPreflightCommandTemplate:
      "'dspx' 'oracle' 'autoresearch-evidence' 'publish-preflight' '--packet' '<autoresearch_oracle_evidence.json>' '--target' 'shared-postgres' '--publication-label' 'retained' '--publisher-id' '<operator-or-session-id>' '--publisher-role' 'operator' '--publisher-assertion' '<why-this-behavior-memory-should-be-retained>' '--redaction-status' 'checked' '--retention-class' 'retained_behavior_memory' '--out' '<autoresearch_oracle_publication_preflight.json>' '--json'",
  };
}

export function buildAutoresearchOracleEvidencePacket(
  cwd: string,
): AutoresearchOracleEvidencePacket {
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  const records = buildAutoresearchOracleEvidenceRecords(closeout);
  const publicationPreflight = buildAutoresearchOraclePublicationPreflightSummary(records.length);
  const boundary =
    "Oracle evidence packet is non-mutating and adapter-ready; DSPx owns Oracle publication preflight/shared writes, local coordinates.db remains scratch/cache, and AK/society.v2.db remains canonical authority.";
  return {
    packetKind: "autoresearch.oracle_evidence.v1",
    adapterContractVersion: 1,
    targetKinds: ["dspx_oracle", "empirical_memory", "evidence", "adapter_source"],
    cwd: closeout.cwd,
    campaign: closeout.campaign,
    sourceArtifacts: {
      closeoutPacketKind: closeout.packetKind,
      receiptPath: closeout.receiptPath,
    },
    records,
    publicationPreflight,
    adapterBoundary: boundary,
    evidenceBoundary: boundary,
    authorityBoundary:
      "This packet is empirical behavior memory input only; it does not publish to Oracle Postgres, migrate local coordinates.db, write AK/KES, choose winners, or authorize promotion.",
  };
}

function resolveAutoresearchOracleEvidenceExportPath(cwd: string, outPath?: string): string {
  return resolveAutoresearchPacketExportPath({
    cwd,
    outPath,
    defaultPath: AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE,
    label: "oracle evidence export",
  });
}

function resolveAutoresearchLearningExportPath(cwd: string, outPath?: string): string {
  return resolveAutoresearchPacketExportPath({
    cwd,
    outPath,
    defaultPath: AUTORESEARCH_LEARNING_EXPORT_FILE,
    label: "learning export",
  });
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function buildDspxAutoresearchPreflightArgv(packetPath: string): string[] {
  return [
    "dspx",
    "oracle",
    "autoresearch-evidence",
    "publish-preflight",
    "--packet",
    packetPath,
    "--target",
    "shared-postgres",
    "--publication-label",
    "retained",
    "--publisher-id",
    "<operator-or-session-id>",
    "--publisher-role",
    "operator",
    "--publisher-assertion",
    "<why-this-behavior-memory-should-be-retained>",
    "--redaction-status",
    "checked",
    "--retention-class",
    "retained_behavior_memory",
    "--out",
    "<autoresearch_oracle_publication_preflight.json>",
    "--json",
  ];
}

function formatShellCommand(argv: readonly string[]): string {
  return argv.map(shellQuote).join(" ");
}

export function writeAutoresearchOracleEvidencePacket(input: {
  cwd: string;
  outPath?: string;
  overwrite?: boolean;
}): AutoresearchOracleEvidenceExportResult {
  const packet = buildAutoresearchOracleEvidencePacket(input.cwd);
  const outputPath = resolveAutoresearchOracleEvidenceExportPath(input.cwd, input.outPath);
  if (existsSync(outputPath) && input.overwrite !== true) {
    throw new Error(
      `oracle evidence export already exists; pass overwrite=true to replace it: ${outputPath}`,
    );
  }
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  return {
    exportKind: "autoresearch.oracle_evidence_export.v1",
    path: outputPath,
    packet,
    suggestedDspxPreflightCommand: formatShellCommand(
      buildDspxAutoresearchPreflightArgv(outputPath),
    ),
    suggestedDspxPreflightArgv: buildDspxAutoresearchPreflightArgv(outputPath),
    effect: {
      localFileWritten: true,
      sharedOracleMutated: false,
      localCoordinatesDbMigrated: false,
      canonicalAuthorityMutated: false,
      akCalled: false,
      kesWritten: false,
    },
    authorityBoundary:
      "Local export only; DSPx owns publication preflight/shared Oracle writes, and AK/society.v2.db remains canonical authority.",
  };
}

export function formatAutoresearchOracleEvidenceExportResult(
  result: AutoresearchOracleEvidenceExportResult,
): string {
  return [
    "# PI-AUTORESEARCH ORACLE EVIDENCE EXPORT",
    "",
    `- export kind: ${result.exportKind}`,
    `- packet kind: ${result.packet.packetKind}`,
    `- path: ${result.path}`,
    `- records: ${result.packet.records.length}`,
    `- shared Oracle mutated: ${result.effect.sharedOracleMutated ? "yes" : "no"}`,
    `- local coordinates.db migrated: ${result.effect.localCoordinatesDbMigrated ? "yes" : "no"}`,
    `- canonical authority mutated: ${result.effect.canonicalAuthorityMutated ? "yes" : "no"}`,
    `- boundary: ${result.authorityBoundary}`,
    "",
    "## DSPx owner preflight",
    "```bash",
    result.suggestedDspxPreflightCommand,
    "```",
  ].join("\n");
}

export function writeAutoresearchKnowledgeExportPacket(input: {
  cwd: string;
  outPath?: string;
  overwrite?: boolean;
}): AutoresearchLearningExportResult {
  const packet = buildAutoresearchKnowledgeExportPacket(input.cwd);
  const outputPath = resolveAutoresearchLearningExportPath(input.cwd, input.outPath);
  if (existsSync(outputPath) && input.overwrite !== true) {
    throw new Error(
      `learning export already exists; pass overwrite=true to replace it: ${outputPath}`,
    );
  }
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  return {
    exportKind: "autoresearch.learning_export.v1",
    path: outputPath,
    packet,
    suggestedKesAdapterCall: `autoresearch_learning_kes_adapter({ action: "plan", packetPath: ${JSON.stringify(outputPath)} })`,
    effect: {
      localFileWritten: true,
      akCalled: false,
      kesWritten: false,
      externalAuthorityMutated: false,
      promotionStateChanged: false,
    },
    authorityBoundary:
      "Local learning packet export only; KES/KMS/notes adapters own persistence, promotion, and external writes.",
  };
}

export function formatAutoresearchLearningExportResult(
  result: AutoresearchLearningExportResult,
): string {
  return [
    "# PI-AUTORESEARCH LEARNING EXPORT",
    "",
    `- export kind: ${result.exportKind}`,
    `- packet kind: ${result.packet.packetKind}`,
    `- path: ${result.path}`,
    `- target kinds: ${result.packet.targetKinds.join(", ")}`,
    `- AK called: ${result.effect.akCalled ? "yes" : "no"}`,
    `- KES written: ${result.effect.kesWritten ? "yes" : "no"}`,
    `- external authority mutated: ${result.effect.externalAuthorityMutated ? "yes" : "no"}`,
    `- promotion state changed: ${result.effect.promotionStateChanged ? "yes" : "no"}`,
    `- boundary: ${result.authorityBoundary}`,
    "",
    "## Suggested owner-routed KES adapter call",
    "```ts",
    result.suggestedKesAdapterCall,
    "```",
  ].join("\n");
}

export function formatAutoresearchOracleEvidencePacket(
  packet: AutoresearchOracleEvidencePacket,
): string {
  const recordLines = packet.records.map((record) =>
    [
      `- record: ${record.recordId}`,
      `  - status: ${record.runStatus}/${record.runKind}`,
      `  - empirical decision: ${record.empiricalDecisionClass}`,
      `  - metric: ${formatMetricValue(record.metric, record.metricUnit)}`,
      `  - timestamp: ${record.timestamp}`,
      `  - hypothesis: ${record.hypothesis ?? "(none)"}`,
      `  - candidate: ${record.candidate?.branch ?? record.candidate?.worktreePath ?? "(none)"}`,
      `  - non-authority: ${record.nonAuthority ? "yes" : "no"}`,
    ].join("\n"),
  );
  return [
    "# PI-AUTORESEARCH ORACLE-READY EVIDENCE",
    "",
    `- packet kind: ${packet.packetKind}`,
    `- adapter contract version: ${packet.adapterContractVersion}`,
    `- target kinds: ${packet.targetKinds.join(", ")}`,
    `- cwd: ${packet.cwd}`,
    `- campaign: ${packet.campaign ?? "(unnamed)"}`,
    `- receipt log: ${packet.sourceArtifacts.receiptPath}`,
    `- record count: ${packet.records.length}`,
    `- preflight status: ${packet.publicationPreflight.status}`,
    `- preflight target: ${packet.publicationPreflight.target}`,
    `- shared Oracle mutated: ${packet.publicationPreflight.sharedOracleMutated ? "yes" : "no"}`,
    `- local coordinates.db migrated: ${packet.publicationPreflight.localCoordinatesDbMigrated ? "yes" : "no"}`,
    `- canonical authority mutated: ${packet.publicationPreflight.canonicalAuthorityMutated ? "yes" : "no"}`,
    `- adapter boundary: ${packet.adapterBoundary}`,
    `- authority boundary: ${packet.authorityBoundary}`,
    "",
    "## DSPx owner preflight handoff",
    `- suggested action: ${packet.publicationPreflight.suggestedDspxOwnerAction}`,
    "```bash",
    packet.publicationPreflight.suggestedDspxPreflightCommandTemplate,
    "```",
    ...(packet.publicationPreflight.blockedReasons.length > 0
      ? [
          "",
          "## Blocked reasons",
          ...packet.publicationPreflight.blockedReasons.map((reason) => `- ${reason}`),
        ]
      : []),
    "",
    "## Oracle-readable records",
    ...(recordLines.length > 0 ? recordLines : ["- (none)"]),
  ].join("\n");
}

export function buildAutoresearchKnowledgeExportPacket(
  cwd: string,
): AutoresearchKnowledgeExportPacket {
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  const title = `Autoresearch learning: ${closeout.campaign ?? "unnamed campaign"}`;
  const suggestedPath = `docs/learnings/${slugAutoresearchName("autoresearch-learning", closeout.campaign)}.md`;
  return {
    packetKind: "autoresearch.learning.v1",
    adapterContractVersion: 1,
    targetKinds: ["kes", "kms", "knowledge_base", "notes"],
    suggestedPath,
    title,
    markdown: renderAutoresearchLearningMarkdown(closeout, title),
    closeout,
    adapterBoundary:
      "Knowledge export packet is non-mutating and adapter-ready; KES/KMS adapters own persistence, promotion, and any external writes.",
  };
}

export function buildAutoresearchAkEvidencePacket(input: {
  cwd: string;
  taskId: number;
}): AutoresearchAkEvidencePacket {
  if (!Number.isInteger(input.taskId) || input.taskId < 1) {
    throw new Error("AK evidence export requires an exact positive integer taskId.");
  }
  const closeout = buildAutoresearchSegmentCloseout(input.cwd);
  const result = renderAutoresearchAkEvidenceResult(closeout);
  const adapterBoundary =
    "AK evidence packet is non-mutating and task-bound; the controller must explicitly call the AK/evidence owner surface to record it.";
  return {
    packetKind: "autoresearch.ak_evidence.v1",
    adapterContractVersion: 1,
    targetKinds: ["ak", "task_system", "evidence_ledger"],
    taskId: input.taskId,
    checkType: "autoresearch:segment_closeout",
    result,
    closeout,
    suggestedToolCall: `evidence_record({ task_id: ${input.taskId}, check_type: "autoresearch:segment_closeout", result: ${JSON.stringify(result)} })`,
    adapterBoundary,
    evidenceBoundary: adapterBoundary,
  };
}

export function formatAutoresearchKnowledgeExportPacket(
  packet: AutoresearchKnowledgeExportPacket,
): string {
  return [
    "# PI-AUTORESEARCH KNOWLEDGE EXPORT PACKET",
    "",
    `- packet kind: ${packet.packetKind}`,
    `- adapter contract version: ${packet.adapterContractVersion}`,
    `- target kinds: ${packet.targetKinds.join(", ")}`,
    `- suggested path: ${packet.suggestedPath}`,
    `- adapter boundary: ${packet.adapterBoundary}`,
    "",
    "## Markdown",
    packet.markdown,
  ].join("\n");
}

export function formatAutoresearchAkEvidencePacket(packet: AutoresearchAkEvidencePacket): string {
  return [
    "# PI-AUTORESEARCH AK EVIDENCE PACKET",
    "",
    `- packet kind: ${packet.packetKind}`,
    `- adapter contract version: ${packet.adapterContractVersion}`,
    `- target kinds: ${packet.targetKinds.join(", ")}`,
    `- task id: ${packet.taskId}`,
    `- check type: ${packet.checkType}`,
    `- campaign: ${packet.closeout.campaign ?? "(unnamed)"}`,
    `- empirical decision: ${packet.closeout.empiricalDecisionClass}`,
    `- adapter boundary: ${packet.adapterBoundary}`,
    `- evidence boundary: ${packet.evidenceBoundary}`,
    "",
    "## Result",
    packet.result,
    "",
    "## Suggested explicit controller call",
    `\`${packet.suggestedToolCall}\``,
  ].join("\n");
}

function renderAutoresearchLearningMarkdown(
  closeout: AutoresearchSegmentCloseout,
  title: string,
): string {
  const metricUnit = closeout.metricUnit;
  return [
    `# ${title}`,
    "",
    "## Summary",
    `- campaign: ${closeout.campaign ?? "(unnamed)"}`,
    `- metric: ${closeout.metricName ?? "(unset)"} (${metricUnit || "unitless"}, ${closeout.direction ?? "unset"} is better)`,
    `- runs: ${closeout.runCount} total / ${closeout.successfulRunCount} successful`,
    `- baseline: ${formatMetricValue(closeout.baselineMetric, metricUnit)}`,
    `- best: ${formatMetricValue(closeout.bestMetric, metricUnit)}`,
    `- empirical decision: ${closeout.empiricalDecisionClass}`,
    `- recommended action: ${closeout.recommendedAction}`,
    "",
    "## Timing interpretation",
    formatMetricInterpretation(closeout.timingInterpretation, metricUnit),
    "",
    "## What was learned",
    `- Current empirical meaning: ${closeout.empiricalDecisionClass}.`,
    `- This packet is learning material, not canonical AK evidence or ontology truth.`,
    "",
    "## Candidate bindings",
    ...(closeout.candidateBindings.length > 0
      ? closeout.candidateBindings.flatMap((binding, index) => [
          `- candidate ${index + 1}`,
          ...formatCandidateBindingLines(binding).map((line) => `  ${line}`),
        ])
      : ["- (none)"]),
    "",
    "## Receipt references",
    `- receipt log: ${closeout.receiptPath}`,
  ].join("\n");
}

function renderAutoresearchAkEvidenceResult(closeout: AutoresearchSegmentCloseout): string {
  return [
    `pi-autoresearch segment closeout for ${closeout.campaign ?? "(unnamed campaign)"}`,
    `metric=${closeout.metricName ?? "(unset)"} ${closeout.metricUnit || "unitless"}; direction=${closeout.direction ?? "unset"}`,
    `runs=${closeout.runCount} total/${closeout.successfulRunCount} successful; baseline=${formatMetricValue(closeout.baselineMetric, closeout.metricUnit)}; best=${formatMetricValue(closeout.bestMetric, closeout.metricUnit)}`,
    `empirical_decision=${closeout.empiricalDecisionClass}`,
    `empirical_posture=${closeout.empiricalPosture.classification}; promotion_ready=${closeout.empiricalPosture.promotionReady ? "yes" : "no"}; ${closeout.empiricalPosture.summary}`,
    `timing_interpretation=${formatMetricInterpretation(closeout.timingInterpretation, closeout.metricUnit)}`,
    `recommended_action=${closeout.recommendedAction}`,
    closeout.candidateBindings.length > 0
      ? `candidate_bindings=${closeout.candidateBindings
          .map((binding) => binding.branch ?? binding.worktreePath ?? binding.source ?? "candidate")
          .join(", ")}`
      : "candidate_bindings=(none)",
    `receipt_log=${closeout.receiptPath}`,
  ].join("\n");
}
