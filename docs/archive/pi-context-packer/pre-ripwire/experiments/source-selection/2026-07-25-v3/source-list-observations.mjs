#!/usr/bin/env node
/**
 * Collect the preregistered v3 source-list full/probe observations without ranking.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  parseTrackedPathEvidence,
  validateSourceListArtifact,
  validateTrackedPaths,
} from "../../../src/source-selection-experiment-source-list.js";
import { exactKeys, sha256Digest } from "../../../src/source-selection-experiment-utils.js";
import {
  EXPECTED_GIT_SHA256,
  EXPECTED_NODE_SHA256,
  EXPECTED_SOURCE_LIST_SHA256,
  GIT_PATH,
  NODE_PATH,
  OBSERVATIONS,
  PAIR_ORDERS,
  PATH_VALUE,
  REPOSITORIES,
  RESULT,
  WORK_ROOT,
} from "./experiment-config.mjs";
import {
  capture,
  checked,
  exists,
  fail,
  rawDigest,
  sha256Hex,
  stableJson,
} from "./experiment-process.mjs";

const PAGE_SIZE = 100;
const COVERAGE_THRESHOLD = 0.6;

function byteCost(value) {
  const bytes = Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value, "utf8");
  return { bytes, approximateTokensCeilBytesDiv4: Math.ceil(bytes / 4) };
}

function safeDuration(start, label) {
  const value = Number(process.hrtime.bigint() - start);
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${label}: invalid monotonic duration`);
  return value;
}

async function git(root, args) {
  return checked(GIT_PATH, ["-C", root, ...args]);
}

async function gitText(root, args) {
  return (await git(root, args)).stdout.toString("utf8").trim();
}

async function sourceState(root) {
  const head = await gitText(root, ["rev-parse", "HEAD"]);
  const status = (
    await git(root, [
      "-c",
      "core.fsmonitor=false",
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ])
  ).stdout;
  return {
    head,
    statusSha256: rawDigest(status),
    statusByteCount: status.length,
    clean: status.length === 0,
  };
}

async function fingerprint(root) {
  const start = process.hrtime.bigint();
  const head = await gitText(root, ["rev-parse", "HEAD"]);
  const status = (
    await git(root, [
      "-c",
      "core.fsmonitor=false",
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ])
  ).stdout;
  const indexBytes = await readFile(join(root, ".git", "index"));
  const ontology = await exists(join(root, ".ontology"));
  return {
    durationNs: safeDuration(start, `${root} fingerprint`),
    state: {
      head,
      statusSha256: rawDigest(status),
      statusByteCount: status.length,
      clean: status.length === 0,
      indexSha256: rawDigest(indexBytes),
      ontology: ontology ? "present" : "absent",
    },
  };
}

function assertStable(before, after, commit, label) {
  if (
    before.head !== commit ||
    after.head !== commit ||
    !before.clean ||
    !after.clean ||
    before.statusByteCount !== 0 ||
    after.statusByteCount !== 0 ||
    before.indexSha256 !== after.indexSha256 ||
    before.ontology !== "absent" ||
    after.ontology !== "absent"
  ) {
    fail(`${label}: frozen target changed, is dirty, or contains .ontology state`);
  }
}

function validateProbe(rawJson, rawSha256) {
  if (rawDigest(rawJson) !== rawSha256) fail("probe raw digest mismatch");
  let payload;
  try {
    payload = JSON.parse(rawJson);
  } catch {
    fail("probe stdout is not JSON");
  }
  const fields = [
    "contractVersion",
    "mode",
    "repository",
    "supportedExtensions",
    "totalCount",
    "returnedCount",
    "page",
    "pageSize",
    "totalPages",
    "truncated",
    "items",
    "violationCount",
    "violations",
    "ok",
  ];
  exactKeys(payload, fields, [], "source-list probe");
  if (
    payload.contractVersion !== "source-list.v1" ||
    payload.mode !== "inventory" ||
    payload.repository !== "." ||
    payload.ok !== true ||
    !Number.isSafeInteger(payload.totalCount) ||
    payload.totalCount <= 0 ||
    payload.page !== 1 ||
    payload.pageSize !== PAGE_SIZE ||
    !Array.isArray(payload.items) ||
    payload.returnedCount !== payload.items.length ||
    payload.returnedCount !== Math.min(PAGE_SIZE, payload.totalCount) ||
    payload.totalPages !== Math.ceil(payload.totalCount / PAGE_SIZE) ||
    payload.truncated !== payload.returnedCount < payload.totalCount ||
    payload.violationCount !== 0 ||
    !Array.isArray(payload.violations) ||
    payload.violations.length !== 0
  ) {
    fail("probe envelope violates the exact page-1/page-size-100 contract");
  }
  // Reuse the owner-artifact validator for exact item grammar and canonical ordering.
  const synthetic = {
    ...payload,
    totalCount: payload.items.length,
    returnedCount: payload.items.length,
    page: 1,
    pageSize: Math.max(payload.items.length, 1),
    totalPages: 1,
    truncated: false,
  };
  const syntheticRaw = JSON.stringify(synthetic);
  validateSourceListArtifact({ rawJson: syntheticRaw, rawSha256: rawDigest(syntheticRaw) });
  const present = payload.items.filter(({ metadataStatus }) => metadataStatus === "present").length;
  const absent = payload.items.length - present;
  const threshold = Math.ceil(COVERAGE_THRESHOLD * payload.totalCount);
  let decision = "unknown";
  if (present >= threshold) decision = "eligible";
  else if (absent > payload.totalCount - threshold) decision = "ineligible";
  return {
    payload,
    classification: { decision, totalCount: payload.totalCount, threshold, present, absent },
  };
}

function validateFull(rawJson, rawSha256) {
  return validateSourceListArtifact({ rawJson, rawSha256 });
}

async function invoke(repository, sourceListPath, mode) {
  const args =
    mode === "probe"
      ? [sourceListPath, "--repo", ".", "--page", "1", "--page-size", String(PAGE_SIZE), "--json"]
      : [sourceListPath, "--repo", ".", "--full-list", "--json"];
  const command = [NODE_PATH, ...args];
  const before = await fingerprint(repository.root);
  const producerStart = process.hrtime.bigint();
  const result = await capture(command[0], command.slice(1), {
    cwd: repository.root,
    env: {
      ...process.env,
      PATH: PATH_VALUE,
      PUSHGATEWAY_URL: "",
      GIT_OPTIONAL_LOCKS: "0",
    },
  });
  const producerNs = safeDuration(producerStart, `${repository.id} ${mode} producer`);
  if (result.code !== 0 || result.signal !== null || result.stderr.length !== 0) {
    fail(`${repository.id} ${mode}: producer failed or wrote stderr`);
  }
  const rawJson = result.stdout.toString("utf8");
  const rawSha256 = rawDigest(result.stdout);
  const parseStart = process.hrtime.bigint();
  const validated =
    mode === "probe"
      ? validateProbe(rawJson, rawSha256)
      : { payload: validateFull(rawJson, rawSha256) };
  const parseValidateNs = safeDuration(parseStart, `${repository.id} ${mode} parse/validate`);
  const after = await fingerprint(repository.root);
  assertStable(before.state, after.state, repository.commit, `${repository.id} ${mode}`);
  const fingerprintNs = before.durationNs + after.durationNs;
  const runtimeCostNs = producerNs + parseValidateNs + fingerprintNs;
  if (!Number.isSafeInteger(runtimeCostNs) || runtimeCostNs <= 0) {
    fail(`${repository.id} ${mode}: invalid runtime cost`);
  }
  return {
    mode,
    command,
    commandDigest: sha256Digest(command),
    rawJson,
    payload: validated.payload,
    classification: validated.classification ?? null,
    observation: {
      mode,
      command,
      commandDigest: sha256Digest(command),
      exitCode: result.code,
      signal: result.signal,
      stdoutSha256: rawSha256,
      stderrSha256: rawDigest(result.stderr),
      producerNs,
      parseValidateNs,
      fingerprintNs,
      runtimeCostNs,
      transport: {
        stdout: byteCost(result.stdout),
        stderr: byteCost(result.stderr),
        total: byteCost(Buffer.concat([result.stdout, result.stderr])),
      },
      before: before.state,
      after: after.state,
      probeClassification: validated.classification ?? null,
    },
  };
}

function median(values) {
  if (values.length !== 5 || values.some((value) => !Number.isFinite(value))) {
    fail("median requires five finite observations");
  }
  return [...values].sort((left, right) => left - right)[2];
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

async function materialize() {
  await mkdir(join(WORK_ROOT, "repos"), { recursive: true });
  const repositories = [];
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
    const state = await fingerprint(root);
    assertStable(state.state, state.state, definition.commit, `${definition.id} materialization`);
    repositories.push({ ...definition, root, materializedState: state.state });
  }
  return repositories;
}

async function collectRepository(repository, sourceListPath) {
  const pairs = [];
  let retainedFull = null;
  let retainedProbe = null;
  for (const [index, order] of PAIR_ORDERS.entries()) {
    const invocations = {};
    for (const mode of order) invocations[mode] = await invoke(repository, sourceListPath, mode);
    const { probe, full } = invocations;
    if (probe.payload.totalCount !== full.payload.totalCount) {
      fail(`${repository.id} pair ${index + 1}: probe/full totalCount mismatch`);
    }
    if (
      JSON.stringify(probe.payload.items) !== JSON.stringify(full.payload.items.slice(0, PAGE_SIZE))
    ) {
      fail(`${repository.id} pair ${index + 1}: probe items differ from full prefix`);
    }
    const presentCount = full.payload.items.filter(
      ({ metadataStatus }) => metadataStatus === "present",
    ).length;
    const groundTruth =
      presentCount / full.payload.totalCount >= COVERAGE_THRESHOLD ? "eligible" : "ineligible";
    const decision = probe.classification.decision;
    const policyNs =
      decision === "eligible"
        ? probe.observation.runtimeCostNs + full.observation.runtimeCostNs
        : probe.observation.runtimeCostNs;
    const fullNs = full.observation.runtimeCostNs;
    pairs.push({
      pair: index + 1,
      order: order.map((mode) => (mode === "probe" ? "P" : "F")).join("→"),
      probe: probe.observation,
      full: full.observation,
      groundTruth,
      classificationCorrect: decision === "unknown" ? null : decision === groundTruth,
      policyRuntimeCostNs: policyNs,
      ineligibleReduction: (fullNs - policyNs) / fullNs,
      eligibleTax: (policyNs - fullNs) / fullNs,
    });
    if (retainedFull === null) retainedFull = full;
    if (retainedProbe === null) retainedProbe = probe;
    if (full.observation.stdoutSha256 !== retainedFull.observation.stdoutSha256) {
      fail(`${repository.id}: full artifact changed across observations`);
    }
    if (probe.observation.stdoutSha256 !== retainedProbe.observation.stdoutSha256) {
      fail(`${repository.id}: probe artifact changed across observations`);
    }
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
  const stage = await capture(GIT_PATH, stageCommand.slice(1), { cwd: repository.root });
  if (stage.code !== 0 || stage.signal !== null || stage.stderr.length !== 0) {
    fail(`${repository.id}: Git stage evidence failed or wrote stderr`);
  }
  validateTrackedPaths(retainedFull.payload, parseTrackedPathEvidence(stage.stdout));
  const presentPaths = retainedFull.payload.items
    .filter(({ metadataStatus }) => metadataStatus === "present")
    .map(({ path }) => path)
    .slice(0, 10);
  const finalState = await fingerprint(repository.root);
  assertStable(
    repository.materializedState,
    finalState.state,
    repository.commit,
    `${repository.id} final`,
  );
  const groundTruthCoverage =
    retainedFull.payload.items.filter(({ metadataStatus }) => metadataStatus === "present").length /
    retainedFull.payload.totalCount;
  const decisions = pairs.map(({ probe }) => probe.probeClassification.decision);
  if (new Set(decisions).size !== 1)
    fail(`${repository.id}: probe classification changed across pairs`);
  return {
    id: repository.id,
    commit: repository.commit,
    expectedRole: repository.expectedRole,
    sourceListArtifact: {
      rawJson: retainedFull.rawJson,
      rawSha256: retainedFull.observation.stdoutSha256,
    },
    probeArtifact: {
      rawJson: retainedProbe.rawJson,
      rawSha256: retainedProbe.observation.stdoutSha256,
    },
    trackedPathInventory: {
      command: stageCommand,
      commandDigest: sha256Digest(stageCommand),
      stdoutBase64: stage.stdout.toString("base64"),
      stdoutSha256: rawDigest(stage.stdout),
      stderrSha256: rawDigest(stage.stderr),
      exitCode: stage.code,
    },
    coverage: {
      totalCount: retainedFull.payload.totalCount,
      metadataPresentCount: retainedFull.payload.items.filter(
        ({ metadataStatus }) => metadataStatus === "present",
      ).length,
      ratio: groundTruthCoverage,
      groundTruth: groundTruthCoverage >= COVERAGE_THRESHOLD ? "eligible" : "ineligible",
      probeDecision: decisions[0],
    },
    metadataStalenessCandidate: {
      method:
        presentPaths.length === 0
          ? "The retained full source-list.v1 artifact contains zero metadata-present paths; independent review must confirm that exact frozen-commit absence without ranking output."
          : "First up to 10 UTF-8-ordered metadata-present paths from the retained full source-list.v1 artifact; independent review must inspect exact frozen Git blobs without ranking output.",
      sampledPaths: presentPaths,
    },
    pairs,
    statistics: {
      pairCount: pairs.length,
      firstRunPair: pairs[0],
      repeatedPairs: pairs.slice(1).map(({ pair }) => pair),
      medianIneligibleReduction: median(
        pairs.map(({ ineligibleReduction }) => ineligibleReduction),
      ),
      medianEligibleTax: median(pairs.map(({ eligibleTax }) => eligibleTax)),
      allPairsValid: pairs.length === 5 && pairs.every(({ full }) => full.runtimeCostNs > 0),
      allClassificationsCorrect: pairs.every(
        ({ classificationCorrect }) => classificationCorrect !== false,
      ),
      conclusive: pairs.every(({ probe }) => probe.probeClassification.decision !== "unknown"),
    },
    retainedEvidenceCost: {
      fullArtifact: byteCost(retainedFull.rawJson),
      probeArtifact: byteCost(retainedProbe.rawJson),
      trackedStage: byteCost(stage.stdout),
      modelInputBytes: 0,
      modelInputTokens: 0,
    },
    targetState: {
      materialized: repository.materializedState,
      final: finalState.state,
      unchanged: true,
    },
  };
}

async function main() {
  if (await exists(OBSERVATIONS)) fail(`refusing existing observation artifact: ${OBSERVATIONS}`);
  if (await exists(RESULT)) fail(`ranking result must remain absent: ${RESULT}`);
  if (await exists(WORK_ROOT)) fail(`refusing existing work root: ${WORK_ROOT}`);
  const nodeHash = sha256Hex(await readFile(NODE_PATH));
  const gitHash = sha256Hex(await readFile(GIT_PATH));
  if (nodeHash !== EXPECTED_NODE_SHA256 || gitHash !== EXPECTED_GIT_SHA256) {
    fail("Node or Git executable differs from the preregistered pin");
  }
  const ownerStatesBefore = Object.fromEntries(
    await Promise.all(REPOSITORIES.map(async ({ id, source }) => [id, await sourceState(source)])),
  );
  await mkdir(WORK_ROOT, { mode: 0o700 });
  try {
    const repositories = await materialize();
    const sourceListPath = join(
      repositories.find(({ id }) => id === "agent-scripts").root,
      "scripts/source-list.mjs",
    );
    if (sha256Hex(await readFile(sourceListPath)) !== EXPECTED_SOURCE_LIST_SHA256) {
      fail("source-list executable differs from the preregistered pin");
    }
    const observations = [];
    for (const repository of repositories)
      observations.push(await collectRepository(repository, sourceListPath));
    const eligible = observations.filter(({ coverage }) => coverage.groundTruth === "eligible");
    const controls = observations.filter(
      ({ expectedRole }) => expectedRole === "ineligible-control",
    );
    const ownerStatesAfter = Object.fromEntries(
      await Promise.all(
        REPOSITORIES.map(async ({ id, source }) => [id, await sourceState(source)]),
      ),
    );
    if (JSON.stringify(ownerStatesAfter) !== JSON.stringify(ownerStatesBefore)) {
      fail("a source-owner repository changed during observation collection");
    }
    const falseDecisions = observations.reduce(
      (total, repository) =>
        total +
        repository.pairs.filter(({ classificationCorrect }) => classificationCorrect === false)
          .length,
      0,
    );
    const conclusive = observations.every(({ statistics }) => statistics.conclusive);
    const eligibleTaxMacro = mean(eligible.map(({ statistics }) => statistics.medianEligibleTax));
    const controlReductionMacro = mean(
      controls.map(({ statistics }) => statistics.medianIneligibleReduction),
    );
    const value = {
      schema: "pi-context-packer.source_list_cost_observations.v3",
      status: "collected-pre-ranking-staleness-review-required",
      rankingExecuted: false,
      resultAbsent: true,
      policy: {
        coverageThreshold: COVERAGE_THRESHOLD,
        page: 1,
        pageSize: PAGE_SIZE,
        pairOrders: PAIR_ORDERS.map((order) =>
          order.map((mode) => (mode === "probe" ? "P" : "F")).join("→"),
        ),
        runtimeCostFormula: "producerNs + parseValidateNs + fingerprintNs",
        eligiblePolicy: "P + F",
        ineligibleOrUnknownPolicy: "P only; source-list unavailable when unknown",
        repositoryStatistic: "median of five pair ratios",
        macroStatistic: "equal-repository arithmetic mean of repository medians",
      },
      executableArtifacts: {
        node: { path: NODE_PATH, sha256: `sha256:${nodeHash}` },
        git: { path: GIT_PATH, sha256: `sha256:${gitHash}` },
        sourceList: {
          path: "agent-scripts@36792de9:scripts/source-list.mjs",
          sha256: `sha256:${EXPECTED_SOURCE_LIST_SHA256}`,
        },
      },
      repositories: observations,
      aggregates: {
        eligibleRepositoryCount: eligible.length,
        ineligibleControlCount: controls.length,
        falseDecisionCount: falseDecisions,
        allProbeDecisionsConclusive: conclusive,
        eligibleTaxMacro,
        ineligibleControlReductionMacro: controlReductionMacro,
        gates: {
          zeroFalseDecisions: falseDecisions === 0,
          allDeclaredRepositoriesConclusive: conclusive,
          ineligibleControlReductionAtLeast20Percent: controlReductionMacro >= 0.2,
          eligibleTaxAtMost10Percent: eligibleTaxMacro <= 0.1,
          allPairsValid: observations.every(({ statistics }) => statistics.allPairsValid),
        },
      },
      ownerStates: { before: ownerStatesBefore, after: ownerStatesAfter, unchanged: true },
      limitations: [
        "The bounded-output probe still performs the producer's complete inventory and metadata work before output slicing.",
        "Monotonic observations are host-local and are not cache-cold or production-latency claims.",
        "Hashes establish integrity, not producer authentication.",
        "ceil(bytes/4) is disclosure-only; model-input bytes and tokens are zero.",
      ],
    };
    await writeFile(OBSERVATIONS, stableJson(value), { flag: "wx", mode: 0o644 });
    process.stdout.write(
      stableJson({
        status: "observations-collected",
        repositories: observations.length,
        pairs: observations.reduce((total, repository) => total + repository.pairs.length, 0),
        rankingExecuted: false,
        resultAbsent: true,
        aggregates: value.aggregates,
        sha256: rawDigest(stableJson(value)),
      }),
    );
  } finally {
    await rm(WORK_ROOT, { recursive: true, force: true });
  }
}

await main();
