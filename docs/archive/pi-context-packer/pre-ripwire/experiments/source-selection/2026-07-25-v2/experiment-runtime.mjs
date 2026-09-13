import { lstat, mkdir, readdir, readFile, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { experimentInternals } from "../../../src/source-selection-experiment.js";
import { validateExecutionObservation } from "../../../src/source-selection-experiment-observation.js";
import {
  validatePhaseBRequest,
  validateReceipt,
} from "../../../src/source-selection-experiment-receipt.js";
import {
  BACKEND_PATH,
  EXPECTED_PROVENANCE,
  GIT_PATH,
  SCI_PATH,
  STRACE_PATH,
  WORK_ROOT,
} from "./experiment-config.mjs";
import {
  capture,
  checked,
  cleanEnvironment,
  exists,
  fail,
  normalizeText,
  rawDigest,
  sha256Hex,
  stableJson,
} from "./experiment-process.mjs";
import { byteAndTokenCost, inspectFileAccessTrace } from "./trace-evidence.mjs";

async function git(cwd, args, options = {}) {
  return checked(GIT_PATH, ["-C", cwd, ...args], options);
}

async function gitText(cwd, args) {
  return (await git(cwd, args)).stdout.toString("utf8").trim();
}

async function gitStatus(cwd) {
  return (
    await git(cwd, [
      "-c",
      "core.fsmonitor=false",
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ])
  ).stdout.toString("utf8");
}

async function shaFile(path) {
  return sha256Hex(await readFile(path));
}

async function commandVersion(path, args, firstLine = false) {
  const result = await checked(path, args);
  if (result.stderr.length !== 0) fail(`${path}: version command wrote stderr`);
  const value = result.stdout.toString("utf8").trim();
  return firstLine ? value.split("\n")[0] : value;
}

async function verifyArtifact(name, path, version, expected, extra = {}) {
  const hash = await shaFile(path);
  if (hash !== expected.sha256) fail(`${name}: executable SHA-256 mismatch`);
  if (expected.version !== undefined && version !== expected.version) {
    fail(`${name}: version mismatch: ${version}`);
  }
  return { name, path, version, sha256: `sha256:${hash}`, ...extra };
}

async function sourceState(root) {
  const head = await gitText(root, ["rev-parse", "HEAD"]);
  const status = await gitStatus(root);
  return {
    head,
    statusSha256: rawDigest(status),
    statusByteCount: Buffer.byteLength(status),
    clean: status === "",
  };
}

async function targetState(root) {
  const ontology = (await exists(join(root, ".ontology"))) ? "present" : "absent";
  const indexPath = join(root, ".git", "index");
  const indexSha256 = (await exists(indexPath)) ? rawDigest(await readFile(indexPath)) : null;
  const status = await gitStatus(root);
  return {
    head: await gitText(root, ["rev-parse", "HEAD"]),
    status,
    clean: status === "",
    ontology,
    indexSha256,
  };
}

function assertStableTarget(before, after, commit, label) {
  if (
    before.head !== commit ||
    after.head !== commit ||
    before.status !== "" ||
    after.status !== "" ||
    !before.clean ||
    !after.clean ||
    before.ontology !== "absent" ||
    after.ontology !== "absent" ||
    before.indexSha256 === null ||
    before.indexSha256 !== after.indexSha256
  ) {
    fail(`${label}: target mutation, dirty state, index change, or .ontology state observed`);
  }
}

function observationState(before, after) {
  return {
    headBefore: before.head,
    headAfter: after.head,
    statusBefore: before.status,
    statusAfter: after.status,
    cleanBefore: before.clean,
    cleanAfter: after.clean,
    noIndex: true,
    indexRead: false,
    indexBuilt: false,
    ontologyBefore: before.ontology,
    ontologyAfter: after.ontology,
  };
}

function preparationState(before, after) {
  return {
    headBefore: before.head,
    headAfter: after.head,
    statusBefore: before.status,
    statusAfter: after.status,
    cleanBefore: before.clean,
    cleanAfter: after.clean,
  };
}

async function processGroupGone(pid) {
  if (!pid) return false;
  const deadline = Date.now() + 5000;
  while (Date.now() <= deadline) {
    try {
      process.kill(-pid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") return true;
      throw error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {}
  return false;
}

function requestFor(caseDefinition) {
  const request = {
    question: normalizeText(caseDefinition.question),
    seeds: [
      { id: "seed:language", kind: "text", value: normalizeText(caseDefinition.language) },
      { id: "seed:pattern", kind: "text", value: normalizeText(caseDefinition.pattern) },
      ...caseDefinition.paths.map((value, index) => ({
        id: `seed:path-${String(index + 1).padStart(4, "0")}`,
        kind: "path",
        value,
      })),
    ],
    operations: ["structural_search"],
    limits: {
      maxCandidates: 10000,
      maxCandidatesPerFile: 10000,
      maxEvidenceBytes: 8 * 1024 * 1024,
      timeoutMs: 120000,
    },
  };
  if (request.question !== caseDefinition.question) {
    fail(`${caseDefinition.id}: frozen question is not already normalized`);
  }
  validatePhaseBRequest(request, `${caseDefinition.id}.request`);
  return request;
}

async function runStructuralCase(caseDefinition, repository, artifacts) {
  const request = requestFor(caseDefinition);
  const requestPath = join(WORK_ROOT, "requests", `${caseDefinition.id}.json`);
  const runtimeRoot = join(WORK_ROOT, "runtime", caseDefinition.id);
  await mkdir(runtimeRoot, { recursive: false });
  const requestJson = stableJson(request);
  await writeFile(requestPath, requestJson, { encoding: "utf8", flag: "wx", mode: 0o600 });
  const requestStat = await lstat(requestPath);
  if (!requestStat.isFile() || requestStat.isSymbolicLink())
    fail(`${caseDefinition.id}: unsafe request file`);
  const retainedRequestJson = await readFile(requestPath, "utf8");
  if (retainedRequestJson !== requestJson) fail(`${caseDefinition.id}: request artifact changed`);

  const before = await targetState(repository.root);
  if (before.head !== repository.commit || !before.clean || before.ontology !== "absent") {
    fail(`${caseDefinition.id}: target is not a clean ontology-free frozen commit`);
  }
  const command = [
    SCI_PATH,
    "experimental",
    "structural-evidence-receipt",
    "--request-file",
    requestPath,
  ];
  const tracePath = join(WORK_ROOT, "traces", "raw", `${caseDefinition.id}.strace`);
  const instrumentationArgv = [
    STRACE_PATH,
    "-f",
    "-qq",
    "-s",
    "4096",
    "-e",
    "trace=%file",
    "-o",
    tracePath,
    "--",
    ...command,
  ];
  const monotonicStart = process.hrtime.bigint();
  const result = await capture(instrumentationArgv[0], instrumentationArgv.slice(1), {
    cwd: repository.root,
    env: cleanEnvironment({ TMPDIR: runtimeRoot }),
    detached: true,
  });
  const monotonicDurationNanoseconds = Number(process.hrtime.bigint() - monotonicStart);
  if (!Number.isSafeInteger(monotonicDurationNanoseconds) || monotonicDurationNanoseconds <= 0) {
    fail(`${caseDefinition.id}: invalid monotonic SCI duration`);
  }
  const processGroupTerminationConfirmed = await processGroupGone(result.pid);
  const runtimeEntries = await readdir(runtimeRoot);
  if (runtimeEntries.length === 0) await rmdir(runtimeRoot);
  const runtimeRootRemovedAndAbsent = !(await exists(runtimeRoot));
  const traceStat = await lstat(tracePath);
  if (
    !traceStat.isFile() ||
    traceStat.isSymbolicLink() ||
    traceStat.size <= 0 ||
    traceStat.size > 64 * 1024 * 1024
  ) {
    fail(`${caseDefinition.id}: strace output is not a bounded regular file`);
  }
  const traceBytes = await readFile(tracePath);
  const traceCorroboration = inspectFileAccessTrace(traceBytes, repository.root, caseDefinition.id);
  const after = await targetState(repository.root);
  assertStableTarget(before, after, repository.commit, caseDefinition.id);
  if (
    result.code !== 0 ||
    result.signal !== null ||
    !processGroupTerminationConfirmed ||
    result.stderr.length !== 0 ||
    runtimeEntries.length !== 0 ||
    !runtimeRootRemovedAndAbsent
  ) {
    fail(
      `${caseDefinition.id}: SCI execution gate failed (code=${result.code}, signal=${result.signal}, group=${processGroupTerminationConfirmed}, stderrBytes=${result.stderr.length}, runtimeEntries=${runtimeEntries.length}, runtimeRootAbsent=${runtimeRootRemovedAndAbsent})`,
    );
  }

  const receiptJson = result.stdout.toString("utf8");
  let receipt;
  try {
    receipt = JSON.parse(receiptJson);
  } catch {
    fail(`${caseDefinition.id}: SCI stdout is not exactly one JSON receipt`);
  }
  validateReceipt(receipt);
  if (
    JSON.stringify(receipt.request) !== JSON.stringify(request) ||
    receipt.summary.complete !== true ||
    receipt.backend.outcome.status !== "succeeded" ||
    receipt.repository.snapshotId !== `git:${repository.commit}` ||
    receipt.repository.baseFingerprint !== `git:${repository.commit}` ||
    receipt.repository.observedFingerprint !== `git:${repository.commit}` ||
    receipt.repository.stableAcrossExecution !== true ||
    receipt.producer.name !== EXPECTED_PROVENANCE.producerName ||
    receipt.producer.version !== EXPECTED_PROVENANCE.producerVersion ||
    receipt.producer.workflow !== EXPECTED_PROVENANCE.producerWorkflow ||
    receipt.backend.name !== EXPECTED_PROVENANCE.backendName ||
    receipt.backend.version !== EXPECTED_PROVENANCE.backendVersion ||
    receipt.backend.executable.name !== EXPECTED_PROVENANCE.executableName ||
    receipt.backend.executable.version !== EXPECTED_PROVENANCE.executableVersion
  ) {
    fail(`${caseDefinition.id}: SCI receipt is incomplete, unavailable, or provenance-mismatched`);
  }

  const processEvidence = {
    exitCode: result.code,
    receiptCount: 1,
    processGroupTerminationConfirmed,
  };
  const stateEvidence = observationState(before, after);
  const processJson = stableJson(processEvidence);
  const stateJson = stableJson(stateEvidence);
  const stderr = result.stderr.toString("utf8");
  const transcript = {
    command,
    commandDigest: experimentInternals.sha256Digest(command),
    requestSha256: rawDigest(requestJson),
    receiptSha256: rawDigest(receiptJson),
    stdoutSha256: rawDigest(receiptJson),
    stderrSha256: rawDigest(stderr),
    processSha256: rawDigest(processJson),
    stateSha256: rawDigest(stateJson),
  };
  const transcriptJson = stableJson(transcript);
  const rawEvidence = {
    requestJson,
    requestSha256: rawDigest(requestJson),
    receiptJson,
    receiptSha256: rawDigest(receiptJson),
    stdout: receiptJson,
    stdoutSha256: rawDigest(receiptJson),
    stderr,
    stderrSha256: rawDigest(stderr),
    transcriptJson,
    transcriptSha256: rawDigest(transcriptJson),
    processJson,
    processSha256: rawDigest(processJson),
    stateJson,
    stateSha256: rawDigest(stateJson),
  };
  const observationBody = {
    schema: "pi-context-packer.structural_evidence_execution_observation.v2",
    receiptDigest: receipt.receiptDigest,
    repositoryCommit: repository.commit,
    requestArtifact: { path: requestPath, sha256: rawEvidence.requestSha256 },
    command,
    commandDigest: transcript.commandDigest,
    sciArtifact: {
      name: EXPECTED_PROVENANCE.producerName,
      version: EXPECTED_PROVENANCE.producerVersion,
      path: SCI_PATH,
      revision: artifacts.sci.revision,
      sha256: artifacts.sci.sha256,
    },
    backendArtifact: {
      name: EXPECTED_PROVENANCE.executableName,
      version: EXPECTED_PROVENANCE.executableVersion,
      path: BACKEND_PATH,
      sha256: artifacts.backend.sha256,
    },
    rawEvidence,
    targetState: stateEvidence,
    process: processEvidence,
    cleanup: { completed: true, temporaryRootsRemoved: true },
  };
  const executionObservation = {
    ...observationBody,
    observationDigest: experimentInternals.sha256Digest(observationBody),
  };
  validateExecutionObservation(executionObservation, receipt, { commit: repository.commit });
  const rawByteAndTokenCosts = Object.fromEntries(
    Object.entries({
      requestJson,
      receiptJson,
      stdout: receiptJson,
      stderr,
      processJson,
      stateJson,
      transcriptJson,
    }).map(([name, value]) => [name, byteAndTokenCost(value)]),
  );
  const producerIoBytes =
    Buffer.byteLength(requestJson) + result.stdout.length + result.stderr.length;
  const producerInvocationCost = {
    request: byteAndTokenCost(requestJson),
    stdout: byteAndTokenCost(result.stdout),
    stderr: byteAndTokenCost(result.stderr),
    total: {
      bytes: producerIoBytes,
      approximateTokensCeilBytesDiv4: Math.ceil(producerIoBytes / 4),
    },
  };
  return {
    expectedRequest: request,
    expectedRequestDigest: experimentInternals.sha256Digest(request),
    expectedProvenance: { ...EXPECTED_PROVENANCE },
    receipt,
    executionObservation,
    targetIndexSha256Before: before.indexSha256,
    targetIndexSha256After: after.indexSha256,
    monotonicDurationNanoseconds,
    producerInvocationCost,
    rawByteAndTokenCosts,
    runtimeRootRemovedAndAbsent,
    trace: {
      path: tracePath,
      rawSha256: rawDigest(traceBytes),
      subjectArgv: command,
      instrumentationArgv,
      corroboration: traceCorroboration,
    },
  };
}

export {
  assertStableTarget,
  capture,
  checked,
  commandVersion,
  exists,
  fail,
  git,
  gitStatus,
  gitText,
  preparationState,
  rawDigest,
  runStructuralCase,
  sha256Hex,
  shaFile,
  sourceState,
  stableJson,
  targetState,
  verifyArtifact,
};
