import { parseRawJson, validateRawText } from "./source-selection-experiment-raw.js";
import {
  boundedText,
  canonicalJson,
  exactKeys,
  invariant,
  isCommit,
  isDigest,
  sha256Digest,
} from "./source-selection-experiment-utils.js";

export const EXECUTION_OBSERVATION_SCHEMA =
  "pi-context-packer.structural_evidence_execution_observation.v2";

function validateArtifact(artifact, expected, label, { requireRevision = false } = {}) {
  exactKeys(
    artifact,
    requireRevision
      ? ["name", "version", "path", "revision", "sha256"]
      : ["name", "version", "path", "sha256"],
    [],
    label,
  );
  invariant(
    artifact.name === expected.name && artifact.version === expected.version,
    `${label} provenance mismatch`,
  );
  invariant(
    boundedText(artifact.path, 4096, true) && artifact.path.startsWith("/"),
    `${label}.path is invalid`,
  );
  if (requireRevision) invariant(isCommit(artifact.revision), `${label}.revision is invalid`);
  invariant(isDigest(artifact.sha256), `${label}.sha256 is invalid`);
}

function validateTargetState(state, repository) {
  exactKeys(
    state,
    [
      "headBefore",
      "headAfter",
      "statusBefore",
      "statusAfter",
      "cleanBefore",
      "cleanAfter",
      "noIndex",
      "indexRead",
      "indexBuilt",
      "ontologyBefore",
      "ontologyAfter",
    ],
    [],
    "observation.targetState",
  );
  invariant(
    state.headBefore === repository.commit &&
      state.headAfter === repository.commit &&
      state.statusBefore === "" &&
      state.statusAfter === "" &&
      state.cleanBefore === true &&
      state.cleanAfter === true,
    "observation clean target-state gate failed",
  );
  invariant(
    state.noIndex === true &&
      state.indexRead === false &&
      state.indexBuilt === false &&
      state.ontologyBefore === "absent" &&
      state.ontologyAfter === "absent",
    "observation no-index or ontology gate failed",
  );
}

function validateProcess(process) {
  exactKeys(
    process,
    ["exitCode", "receiptCount", "processGroupTerminationConfirmed"],
    [],
    "observation.process",
  );
  invariant(
    process.exitCode === 0 &&
      process.receiptCount === 1 &&
      process.processGroupTerminationConfirmed === true,
    "observation process gate failed",
  );
}

function validateRawEvidence(raw, observation, receipt) {
  exactKeys(
    raw,
    [
      "requestJson",
      "requestSha256",
      "receiptJson",
      "receiptSha256",
      "stdout",
      "stdoutSha256",
      "stderr",
      "stderrSha256",
      "transcriptJson",
      "transcriptSha256",
      "processJson",
      "processSha256",
      "stateJson",
      "stateSha256",
    ],
    [],
    "observation.rawEvidence",
  );
  const request = parseRawJson(raw.requestJson, raw.requestSha256, "raw request JSON");
  const parsedReceipt = parseRawJson(raw.receiptJson, raw.receiptSha256, "raw receipt JSON");
  invariant(
    canonicalJson(request) === canonicalJson(receipt.request),
    "raw request parsed value mismatch",
  );
  invariant(
    canonicalJson(parsedReceipt) === canonicalJson(receipt),
    "raw receipt parsed value mismatch",
  );
  validateRawText(raw.stdout, raw.stdoutSha256, "raw stdout");
  validateRawText(raw.stderr, raw.stderrSha256, "raw stderr", { allowEmpty: true });
  invariant(
    raw.stdout === raw.receiptJson,
    "stdout must contain exactly the retained receipt JSON",
  );
  invariant(raw.stderr === "", "successful exporter stderr must be empty");
  const process = parseRawJson(raw.processJson, raw.processSha256, "raw process evidence");
  const state = parseRawJson(raw.stateJson, raw.stateSha256, "raw state evidence");
  invariant(
    canonicalJson(process) === canonicalJson(observation.process),
    "raw process evidence mismatch",
  );
  invariant(
    canonicalJson(state) === canonicalJson(observation.targetState),
    "raw state evidence mismatch",
  );
  const transcript = parseRawJson(
    raw.transcriptJson,
    raw.transcriptSha256,
    "raw execution transcript",
  );
  exactKeys(
    transcript,
    [
      "command",
      "commandDigest",
      "requestSha256",
      "receiptSha256",
      "stdoutSha256",
      "stderrSha256",
      "processSha256",
      "stateSha256",
    ],
    [],
    "raw execution transcript value",
  );
  invariant(
    canonicalJson(transcript.command) === canonicalJson(observation.command) &&
      transcript.commandDigest === observation.commandDigest &&
      transcript.requestSha256 === raw.requestSha256 &&
      transcript.receiptSha256 === raw.receiptSha256 &&
      transcript.stdoutSha256 === raw.stdoutSha256 &&
      transcript.stderrSha256 === raw.stderrSha256 &&
      transcript.processSha256 === raw.processSha256 &&
      transcript.stateSha256 === raw.stateSha256,
    "raw execution transcript bindings mismatch",
  );
}

export function validateExecutionObservation(observation, receipt, repository) {
  exactKeys(
    observation,
    [
      "schema",
      "receiptDigest",
      "repositoryCommit",
      "requestArtifact",
      "command",
      "commandDigest",
      "sciArtifact",
      "backendArtifact",
      "rawEvidence",
      "targetState",
      "process",
      "cleanup",
      "observationDigest",
    ],
    [],
    "structuralEvidence.executionObservation",
  );
  invariant(observation.schema === EXECUTION_OBSERVATION_SCHEMA, "observation schema mismatch");
  const { observationDigest: _ignored, ...body } = observation;
  invariant(observation.observationDigest === sha256Digest(body), "observation digest mismatch");
  invariant(
    observation.receiptDigest === receipt.receiptDigest,
    "observation receipt binding mismatch",
  );
  invariant(observation.repositoryCommit === repository.commit, "observation commit mismatch");
  exactKeys(observation.requestArtifact, ["path", "sha256"], [], "observation.requestArtifact");
  invariant(
    boundedText(observation.requestArtifact.path, 4096, true) &&
      observation.requestArtifact.path.startsWith("/") &&
      isDigest(observation.requestArtifact.sha256),
    "observation request artifact pin is invalid",
  );
  validateArtifact(
    observation.sciArtifact,
    { name: receipt.producer.name, version: receipt.producer.version },
    "observation.sciArtifact",
    { requireRevision: true },
  );
  validateArtifact(
    observation.backendArtifact,
    { name: receipt.backend.executable.name, version: receipt.backend.executable.version },
    "observation.backendArtifact",
  );
  const expectedCommand = [
    observation.sciArtifact.path,
    "experimental",
    "structural-evidence-receipt",
    "--request-file",
    observation.requestArtifact.path,
  ];
  invariant(
    canonicalJson(observation.command) === canonicalJson(expectedCommand),
    "observation command must use the exact structural exporter argv",
  );
  invariant(
    observation.commandDigest === sha256Digest(observation.command),
    "observation command digest mismatch",
  );
  validateTargetState(observation.targetState, repository);
  validateProcess(observation.process);
  exactKeys(observation.cleanup, ["completed", "temporaryRootsRemoved"], [], "observation.cleanup");
  invariant(
    observation.cleanup.completed === true && observation.cleanup.temporaryRootsRemoved === true,
    "observation cleanup gate failed",
  );
  validateRawEvidence(observation.rawEvidence, observation, receipt);
  invariant(
    observation.requestArtifact.sha256 === observation.rawEvidence.requestSha256,
    "request artifact pin does not match retained raw request",
  );
}
