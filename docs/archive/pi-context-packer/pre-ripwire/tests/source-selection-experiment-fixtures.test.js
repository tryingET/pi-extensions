import path from "node:path";

import {
  EXECUTION_OBSERVATION_SCHEMA,
  EXPERIMENT_PROTOCOL,
  experimentInternals,
  SCI_RECEIPT_SCHEMA,
  SOURCE_LIST_PREPARATION_SCHEMA,
} from "../src/source-selection-experiment.js";
import { DEFAULT_SOURCE_EXTENSIONS } from "../src/source-selection-experiment-source-list.js";

export const COMMIT = "a".repeat(40);
export const ARMS = ["paths", "source_list", "structural", "fusion"];
const QUESTIONS = [
  "Locate alpha request parsing and validation behavior.",
  "Trace beta candidate filtering and fallback behavior.",
  "Explain cache invalidation after tracked source edits.",
  "Review configuration defaults for selection budgets.",
  "Inspect exporter process cleanup after failed execution.",
  "Find graph edge normalization and self-reference handling.",
  "Audit parser rejection of malformed owner artifacts.",
  "Compare ranking tie breaks for equal structural counts.",
  "Verify receipt digest binding across raw evidence.",
  "Test runner hash checks before prepared input parsing.",
  "Diagnose security boundaries around external commands.",
  "Document zeta maintenance ownership and escalation.",
];

const CASE_TRUTHS = [
  ["src/alpha.js"],
  ["src/beta.js"],
  ["src/cache.js"],
  ["src/config.js"],
  ["src/exporter.js"],
  ["src/graph.js"],
  ["src/parser.js"],
  ["src/ranking.js"],
  ["src/receipt.js"],
  ["src/runner.js"],
  ["src/security.js"],
  ["src/zeta.js"],
];

function sourceItem(record) {
  const present = record.status === "present";
  return {
    path: record.path,
    indexKind: record.indexKind ?? "regular",
    extension: path.posix.extname(record.path).toLowerCase(),
    worktreeKind: record.worktreeKind ?? record.indexKind ?? "regular",
    metadataStatus: record.metadataStatus ?? record.status,
    summary: present ? record.summary : null,
    readWhen: present ? (record.readWhen ?? []) : [],
    metadataError: record.metadataError ?? null,
  };
}

function trackedBytes(items) {
  return Buffer.from(
    items
      .map((item) => {
        const mode =
          item.indexKind === "symlink"
            ? "120000"
            : item.indexKind === "gitlink"
              ? "160000"
              : "100644";
        return `${mode} ${"a".repeat(40)} 0\t${item.path}\0`;
      })
      .join(""),
    "utf8",
  );
}

function makeSourceListArtifact(records) {
  const items = records
    .map(sourceItem)
    .sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
  const payload = {
    contractVersion: "source-list.v1",
    mode: "inventory",
    repository: ".",
    supportedExtensions: [...DEFAULT_SOURCE_EXTENSIONS],
    totalCount: items.length,
    returnedCount: items.length,
    page: 1,
    pageSize: Math.max(items.length, 1),
    totalPages: 1,
    truncated: false,
    items,
    violationCount: 0,
    violations: [],
    ok: true,
  };
  const rawJson = `${JSON.stringify(payload, null, 2)}\n`;
  return { rawJson, rawSha256: experimentInternals.sha256Raw(rawJson), payload };
}

function makeSourceListPreparation(artifact, commit) {
  const sourceListExecutable = {
    nodePath: "/usr/bin/node",
    path: "/opt/pinned/agent-scripts/scripts/source-list.mjs",
    revision: "b".repeat(40),
    artifactSha256: experimentInternals.sha256Raw("source-list executable"),
  };
  const command = [
    sourceListExecutable.nodePath,
    sourceListExecutable.path,
    "--repo",
    ".",
    "--full-list",
    "--json",
  ];
  const bytes = trackedBytes(artifact.payload.items);
  const trackedCommand = [
    "git",
    "-C",
    ".",
    "--literal-pathspecs",
    "ls-files",
    "--cached",
    "--stage",
    "-z",
    "--",
  ];
  const observation = {
    schema: SOURCE_LIST_PREPARATION_SCHEMA,
    repositoryCommit: commit,
    rawArtifactSha256: artifact.rawSha256,
    sourceListExecutable,
    command,
    commandDigest: experimentInternals.sha256Digest(command),
    exitCode: 0,
    targetState: {
      headBefore: commit,
      headAfter: commit,
      statusBefore: "",
      statusAfter: "",
      cleanBefore: true,
      cleanAfter: true,
    },
    trackedPathInventory: {
      command: trackedCommand,
      commandDigest: experimentInternals.sha256Digest(trackedCommand),
      stdoutBase64: bytes.toString("base64"),
      stdoutSha256: experimentInternals.sha256Raw(bytes),
      exitCode: 0,
    },
    observationDigest: "",
  };
  resignPreparation(observation);
  return observation;
}

export function resignPreparation(observation) {
  const { observationDigest: _ignored, ...body } = observation;
  observation.observationDigest = experimentInternals.sha256Digest(body);
}

export function makeRequest(question) {
  return {
    question,
    seeds: [
      { id: "seed:language", kind: "text", value: "JavaScript" },
      { id: "seed:pattern", kind: "text", value: "$MATCH" },
      { id: "seed:path", kind: "path", value: "src" },
    ],
    operations: ["structural_search"],
    limits: {
      maxCandidates: 20,
      maxCandidatesPerFile: 5,
      maxEvidenceBytes: 65536,
      timeoutMs: 30000,
    },
  };
}

export function resignReceipt(receipt, requestChanged = false) {
  if (requestChanged) receipt.requestDigest = experimentInternals.sha256Digest(receipt.request);
  const { receiptDigest: _ignored, ...body } = receipt;
  receipt.receiptDigest = experimentInternals.sha256Digest(body);
}

export function makeReceipt(question, commit = COMMIT, evidencePaths = ["src/alpha.js"]) {
  const request = makeRequest(question);
  const evidence = evidencePaths.map((itemPath, index) => {
    const identity = {
      path: itemPath,
      kind: "match",
      range: { start: { line: index, column: 0 }, end: { line: index, column: 5 } },
    };
    return {
      id: `candidate:${experimentInternals.sha256Digest(identity)}`,
      identity,
      operation: "structural_search",
      snippet: "alpha",
      byteCount: 5,
      provenance: { backend: "ast-grep", workflow: "structural-evidence-export-v1" },
    };
  });
  const receipt = {
    schema: SCI_RECEIPT_SCHEMA,
    request,
    requestDigest: experimentInternals.sha256Digest(request),
    repository: {
      snapshotId: `git:${commit}`,
      baseFingerprint: `git:${commit}`,
      observedFingerprint: `git:${commit}`,
      stableAcrossExecution: true,
    },
    producer: {
      name: "semantic-code-intelligence",
      version: "2.0.0",
      workflow: "structural-evidence-export-v1",
    },
    backend: {
      name: "ast-grep",
      version: "0.40.5",
      executable: { name: "ast-grep", version: "0.40.5" },
      outcome: { status: "succeeded", exitCode: 0, message: "evidence collected" },
    },
    evidence,
    summary: {
      returnedCount: evidence.length,
      totalObservedCount: evidence.length,
      evidenceBytes: evidence.length * 5,
      capped: false,
      complete: true,
    },
    limitations: [],
    receiptDigest: "",
  };
  resignReceipt(receipt);
  return receipt;
}

function rawJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function rebuildRawEvidence(observation, request, receipt) {
  const requestJson = rawJson(request);
  const receiptJson = rawJson(receipt);
  const processJson = rawJson(observation.process);
  const stateJson = rawJson(observation.targetState);
  const raw = {
    requestJson,
    requestSha256: experimentInternals.sha256Raw(requestJson),
    receiptJson,
    receiptSha256: experimentInternals.sha256Raw(receiptJson),
    stdout: receiptJson,
    stdoutSha256: experimentInternals.sha256Raw(receiptJson),
    stderr: "",
    stderrSha256: experimentInternals.sha256Raw(""),
    transcriptJson: "",
    transcriptSha256: "",
    processJson,
    processSha256: experimentInternals.sha256Raw(processJson),
    stateJson,
    stateSha256: experimentInternals.sha256Raw(stateJson),
  };
  const transcript = {
    command: observation.command,
    commandDigest: observation.commandDigest,
    requestSha256: raw.requestSha256,
    receiptSha256: raw.receiptSha256,
    stdoutSha256: raw.stdoutSha256,
    stderrSha256: raw.stderrSha256,
    processSha256: raw.processSha256,
    stateSha256: raw.stateSha256,
  };
  raw.transcriptJson = rawJson(transcript);
  raw.transcriptSha256 = experimentInternals.sha256Raw(raw.transcriptJson);
  observation.rawEvidence = raw;
  observation.requestArtifact.sha256 = raw.requestSha256;
}

export function resignObservation(observation) {
  const { observationDigest: _ignored, ...body } = observation;
  observation.observationDigest = experimentInternals.sha256Digest(body);
}

export function refreshExecutionObservation(item) {
  const observation = item.structuralEvidence.executionObservation;
  observation.receiptDigest = item.structuralEvidence.receipt.receiptDigest;
  rebuildRawEvidence(
    observation,
    item.structuralEvidence.receipt.request,
    item.structuralEvidence.receipt,
  );
  resignObservation(observation);
}

function makeExecutionObservation(request, receipt, commit) {
  const requestArtifact = { path: "/evidence/prepared-request.json", sha256: "" };
  const sciArtifact = {
    name: "semantic-code-intelligence",
    version: "2.0.0",
    path: "/opt/pinned/semantic-code-intelligence",
    revision: "c".repeat(40),
    sha256: experimentInternals.sha256Raw("sci artifact"),
  };
  const command = [
    sciArtifact.path,
    "experimental",
    "structural-evidence-receipt",
    "--request-file",
    requestArtifact.path,
  ];
  const observation = {
    schema: EXECUTION_OBSERVATION_SCHEMA,
    receiptDigest: receipt.receiptDigest,
    repositoryCommit: commit,
    requestArtifact,
    command,
    commandDigest: experimentInternals.sha256Digest(command),
    sciArtifact,
    backendArtifact: {
      name: "ast-grep",
      version: "0.40.5",
      path: "/opt/pinned/ast-grep",
      sha256: experimentInternals.sha256Raw("backend artifact"),
    },
    rawEvidence: null,
    targetState: {
      headBefore: commit,
      headAfter: commit,
      statusBefore: "",
      statusAfter: "",
      cleanBefore: true,
      cleanAfter: true,
      noIndex: true,
      indexRead: false,
      indexBuilt: false,
      ontologyBefore: "absent",
      ontologyAfter: "absent",
    },
    process: { exitCode: 0, receiptCount: 1, processGroupTerminationConfirmed: true },
    cleanup: { completed: true, temporaryRootsRemoved: true },
    observationDigest: "",
  };
  rebuildRawEvidence(observation, request, receipt);
  resignObservation(observation);
  return observation;
}

export function makeStructuralEvidence(question, commit = COMMIT, evidencePaths) {
  const expectedRequest = makeRequest(question);
  const receipt = makeReceipt(question, commit, evidencePaths);
  return {
    expectedRequest,
    expectedRequestDigest: experimentInternals.sha256Digest(expectedRequest),
    expectedProvenance: {
      producerName: "semantic-code-intelligence",
      producerVersion: "2.0.0",
      producerWorkflow: "structural-evidence-export-v1",
      backendName: "ast-grep",
      backendVersion: "0.40.5",
      executableName: "ast-grep",
      executableVersion: "0.40.5",
    },
    receipt,
    executionObservation: makeExecutionObservation(expectedRequest, receipt, commit),
  };
}

export function makeRepository(id = "repo", records, commit = COMMIT) {
  const artifact = makeSourceListArtifact(
    records ??
      CASE_TRUTHS.map(([itemPath], index) => ({
        path: itemPath,
        status: "present",
        summary: `owner record ${index + 1}`,
      })),
  );
  const sampledPaths = [
    artifact.payload.items.find(({ metadataStatus }) => metadataStatus === "present").path,
  ];
  const sample = {
    commit,
    rawArtifactSha256: artifact.rawSha256,
    method: "deterministic first metadata-present path review",
    sampledPaths,
    stalePaths: [],
    sampleDigest: "",
  };
  const { sampleDigest: _ignored, ...body } = sample;
  sample.sampleDigest = experimentInternals.sha256Digest(body);
  return {
    id,
    commit,
    sourceListArtifact: { rawJson: artifact.rawJson, rawSha256: artifact.rawSha256 },
    sourceListPreparation: makeSourceListPreparation(artifact, commit),
    metadataStalenessSample: sample,
  };
}

export function rebuildQuestionIdentity(item, repository) {
  const identity = experimentInternals.expectedQuestionIdentity(item, {
    commit: repository.commit,
    rawArtifactSha256: repository.sourceListArtifact.rawSha256,
  });
  Object.assign(item, identity);
}

export function makeCases(repository, count = 10, options = {}) {
  return Array.from({ length: count }, (_, index) => {
    const question = QUESTIONS[index];
    const truth = options.truths?.[index] ?? options.truth ?? CASE_TRUTHS[index];
    const item = {
      id: `${repository.id}-${index + 1}`,
      repositoryId: repository.id,
      repositoryCommit: repository.commit,
      sourceListArtifactSha256: repository.sourceListArtifact.rawSha256,
      question,
      questionId: "",
      intentSignature: "",
      targetBasisDigest: "",
      maxItems: options.maxItems ?? 2,
      truth: structuredClone(truth),
      structuralEvidence: makeStructuralEvidence(
        question,
        repository.commit,
        options.evidencePaths,
      ),
    };
    rebuildQuestionIdentity(item, repository);
    return item;
  });
}

export function makeExperiment(options = {}) {
  const repository = makeRepository("repo", options.records);
  return {
    protocol: EXPERIMENT_PROTOCOL,
    repositories: [repository],
    cases: makeCases(repository, options.caseCount ?? 10, options),
  };
}
