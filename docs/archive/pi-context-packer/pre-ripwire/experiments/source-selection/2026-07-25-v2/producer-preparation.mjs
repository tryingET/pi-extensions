import { mkdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

import { experimentInternals } from "../../../src/source-selection-experiment.js";
import {
  BACKEND_PATH,
  BUN_PATH,
  EXPECTED_ARTIFACTS,
  EXPECTED_SCI_REVISION,
  GIT_PATH,
  GZIP_PATH,
  NODE_PATH,
  REPOSITORIES,
  SCI_DIST_CLI,
  SCI_OWNER_ROOT,
  SCI_PACKAGE,
  SCI_PATH,
  STRACE_PATH,
  TAR_PATH,
  WORK_ROOT,
} from "./experiment-config.mjs";
import {
  assertStableTarget,
  capture,
  checked,
  commandVersion,
  fail,
  git,
  gitText,
  preparationState,
  rawDigest,
  sha256Hex,
  targetState,
  verifyArtifact,
} from "./experiment-runtime.mjs";
import { stalenessMethod } from "./review-record.mjs";
import { byteAndTokenCost } from "./trace-evidence.mjs";

async function materializeRepositories() {
  const roots = [];
  await mkdir(join(WORK_ROOT, "repos"), { recursive: true });
  for (const definition of REPOSITORIES) {
    const root = join(WORK_ROOT, "repos", definition.id);
    await checked(GIT_PATH, [
      "clone",
      "--quiet",
      "--no-local",
      "--no-hardlinks",
      definition.source,
      root,
    ]);
    await git(root, [
      "-c",
      "advice.detachedHead=false",
      "checkout",
      "--quiet",
      "--detach",
      definition.commit,
    ]);
    const state = await targetState(root);
    if (
      state.head !== definition.commit ||
      state.status !== "" ||
      !state.clean ||
      state.ontology !== "absent"
    ) {
      fail(`${definition.id}: detached materialization is not clean at the frozen commit`);
    }
    roots.push({ ...definition, root, materializedState: state });
  }
  return roots;
}
async function prepareSourceList(repository, sourceListPath) {
  const before = await targetState(repository.root);
  const command = [NODE_PATH, sourceListPath, "--repo", ".", "--full-list", "--json"];
  const monotonicStart = process.hrtime.bigint();
  const sourceResult = await capture(command[0], command.slice(1), { cwd: repository.root });
  const monotonicDurationNanoseconds = Number(process.hrtime.bigint() - monotonicStart);
  if (!Number.isSafeInteger(monotonicDurationNanoseconds) || monotonicDurationNanoseconds <= 0) {
    fail(`${repository.id}: invalid monotonic source-list duration`);
  }
  if (sourceResult.code !== 0 || sourceResult.signal !== null || sourceResult.stderr.length !== 0) {
    fail(`${repository.id}: exact source-list command failed or wrote stderr`);
  }
  const stageCommand = [
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
  const stageResult = await capture(GIT_PATH, stageCommand.slice(1), { cwd: repository.root });
  if (stageResult.code !== 0 || stageResult.signal !== null || stageResult.stderr.length !== 0) {
    fail(`${repository.id}: exact Git stage command failed or wrote stderr`);
  }
  const after = await targetState(repository.root);
  assertStableTarget(before, after, repository.commit, `${repository.id} source-list preparation`);
  const rawJson = sourceResult.stdout.toString("utf8");
  const rawHash = sha256Hex(sourceResult.stdout);
  const stageHash = sha256Hex(stageResult.stdout);
  if (rawHash !== repository.rawArtifactSha256 || stageHash !== repository.stageSha256) {
    fail(
      `${repository.id}: raw source-list or Git stage evidence hash differs from the prereviewed pin`,
    );
  }
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    fail(`${repository.id}: source-list stdout is not JSON`);
  }
  const rawArtifactSha256 = rawDigest(sourceResult.stdout);
  const sourceListArtifact = { rawJson, rawSha256: rawArtifactSha256 };
  const preparationBody = {
    schema: "pi-context-packer.source_list_preparation_observation.v1",
    repositoryCommit: repository.commit,
    rawArtifactSha256,
    sourceListExecutable: {
      nodePath: NODE_PATH,
      path: sourceListPath,
      revision: REPOSITORIES[0].commit,
      artifactSha256: rawDigest(await readFile(sourceListPath)),
    },
    command,
    commandDigest: experimentInternals.sha256Digest(command),
    exitCode: sourceResult.code,
    targetState: preparationState(before, after),
    trackedPathInventory: {
      command: stageCommand,
      commandDigest: experimentInternals.sha256Digest(stageCommand),
      stdoutBase64: stageResult.stdout.toString("base64"),
      stdoutSha256: rawDigest(stageResult.stdout),
      exitCode: stageResult.code,
    },
  };
  const sourceListPreparation = {
    ...preparationBody,
    observationDigest: experimentInternals.sha256Digest(preparationBody),
  };
  const presentPaths = payload.items
    .filter((item) => item.metadataStatus === "present")
    .map((item) => item.path)
    .slice(0, 10);
  if (presentPaths.length === 0)
    fail(`${repository.id}: no metadata-present staleness sample paths`);
  const sampleBody = {
    commit: repository.commit,
    rawArtifactSha256,
    method: stalenessMethod(repository.id),
    sampledPaths: presentPaths,
    stalePaths: [],
  };
  const presentCount = payload.items.filter((item) => item.metadataStatus === "present").length;
  return {
    sourceListArtifact,
    sourceListPreparation,
    metadataStalenessSample: {
      ...sampleBody,
      sampleDigest: experimentInternals.sha256Digest(sampleBody),
    },
    payload,
    rawArtifactSha256,
    evidence: {
      sourceListStdoutSha256: rawDigest(sourceResult.stdout),
      sourceListStderrSha256: rawDigest(sourceResult.stderr),
      sourceListStderrByteCount: sourceResult.stderr.length,
      trackedStageStdoutSha256: rawDigest(stageResult.stdout),
      trackedStageStderrSha256: rawDigest(stageResult.stderr),
      trackedStageStderrByteCount: stageResult.stderr.length,
      targetIndexSha256Before: before.indexSha256,
      targetIndexSha256After: after.indexSha256,
      candidateCount: payload.items.length,
      metadataPresentCount: presentCount,
      metadataCoverage: presentCount / payload.items.length,
      monotonicDurationNanoseconds,
      producerInvocationCost: {
        stdout: byteAndTokenCost(sourceResult.stdout),
        stderr: byteAndTokenCost(sourceResult.stderr),
        total: byteAndTokenCost(Buffer.concat([sourceResult.stdout, sourceResult.stderr])),
      },
    },
  };
}
async function verifyHostArtifacts() {
  const nodeVersion = await commandVersion(NODE_PATH, ["--version"]);
  const gitVersion = await commandVersion(GIT_PATH, ["--version"]);
  const gzipVersion = await commandVersion(GZIP_PATH, ["--version"], true);
  const bunVersion = await commandVersion(BUN_PATH, ["--version"]);
  const sciVersion = await commandVersion(SCI_PATH, ["--version"]);
  const backendVersion = await commandVersion(BACKEND_PATH, ["--version"]);
  const straceVersion = await commandVersion(STRACE_PATH, ["--version"], true);
  const tarVersion = await commandVersion(TAR_PATH, ["--version"], true);
  const sciRevision = await gitText(SCI_OWNER_ROOT, ["rev-parse", "HEAD"]);
  if (sciRevision !== EXPECTED_SCI_REVISION) fail("SCI revision differs from the executable pin");
  const artifacts = {
    node: await verifyArtifact("node", NODE_PATH, nodeVersion, EXPECTED_ARTIFACTS.node),
    git: await verifyArtifact("git", GIT_PATH, gitVersion, EXPECTED_ARTIFACTS.git),
    gzip: await verifyArtifact("gzip", GZIP_PATH, gzipVersion, EXPECTED_ARTIFACTS.gzip),
    bun: await verifyArtifact("bun", BUN_PATH, bunVersion, EXPECTED_ARTIFACTS.bun),
    sci: await verifyArtifact(
      "semantic-code-intelligence",
      SCI_PATH,
      sciVersion,
      EXPECTED_ARTIFACTS.sci,
      {
        revision: sciRevision,
        resolvedPath: await realpath(SCI_PATH),
      },
    ),
    backend: await verifyArtifact(
      "ast-grep",
      BACKEND_PATH,
      backendVersion,
      EXPECTED_ARTIFACTS.backend,
    ),
    strace: await verifyArtifact("strace", STRACE_PATH, straceVersion, EXPECTED_ARTIFACTS.strace),
    tar: await verifyArtifact("tar", TAR_PATH, tarVersion, EXPECTED_ARTIFACTS.tar),
    sciDistCli: await verifyArtifact(
      "semantic-code-intelligence-dist-cli",
      SCI_DIST_CLI,
      null,
      EXPECTED_ARTIFACTS.sciDistCli,
    ),
    sciPackage: await verifyArtifact(
      "semantic-code-intelligence-package",
      SCI_PACKAGE,
      null,
      EXPECTED_ARTIFACTS.sciPackage,
    ),
  };
  return artifacts;
}

export { materializeRepositories, prepareSourceList, verifyHostArtifacts };
