import { createHash } from "node:crypto";

export const EXPERIMENT_PROTOCOL = "pi-context-packer-source-selection-ablation/v1";
export const SCI_RECEIPT_PROTOCOL = "sci-owner-ranking-receipt/v1";
export const TRUSTED_SCI_EXECUTABLES = Object.freeze([
  "/usr/local/bin/sci",
  "/usr/bin/sci",
  "/bin/sci",
  "/usr/local/bin/semantic-code-intelligence",
  "/usr/bin/semantic-code-intelligence",
  "/bin/semantic-code-intelligence",
]);

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "its",
  "with",
  "change",
  "focused",
  "test",
  "tests",
  "behavior",
]);
const encoder = new TextEncoder();

function invariant(condition, message) {
  if (!condition) throw new TypeError(message);
}

function compareUtf8(left, right) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort(compareUtf8)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function words(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? [],
  );
}

function queryTokens(question) {
  return [...words(question)]
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .sort(compareUtf8);
}

function matchingTokenCount(text, tokens) {
  const available = words(text);
  return tokens.reduce((count, token) => count + Number(available.has(token)), 0);
}

function isCanonicalRepositoryPath(value) {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > 4096)
    return false;
  if (value.startsWith("/") || value.includes("\\") || /^[A-Za-z]:\//.test(value)) return false;
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || code === 0x7f)) return false;
  }
  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function validateCandidate(candidate, caseId) {
  invariant(candidate && typeof candidate === "object", `${caseId}: candidate must be an object`);
  invariant(
    typeof candidate.path === "string" && candidate.path.length > 0,
    `${caseId}: candidate path is required`,
  );
  invariant(
    isCanonicalRepositoryPath(candidate.path),
    `${caseId}: candidate path must be canonical and repository-relative`,
  );
  invariant(
    candidate.summary === undefined || typeof candidate.summary === "string",
    `${caseId}: summary must be a string`,
  );
  invariant(
    candidate.readWhen === undefined ||
      (Array.isArray(candidate.readWhen) &&
        candidate.readWhen.every((entry) => typeof entry === "string")),
    `${caseId}: readWhen must be an array of strings`,
  );
}

function candidateSetHash(candidates) {
  const paths = candidates.map(({ path }) => path).sort(compareUtf8);
  return sha256(canonicalJson(paths));
}

function rankingHash(rankings) {
  const canonical = rankings
    .map(({ path, rank }) => ({ path, rank }))
    .sort((left, right) => compareUtf8(left.path, right.path));
  return sha256(canonicalJson(canonical));
}

function validateSci(caseDefinition, paths, setHash) {
  const receipt = caseDefinition.sci?.receipt;
  const rankings = caseDefinition.sci?.rankings;
  const failures = [];
  if (!receipt || typeof receipt !== "object") failures.push("receipt_missing");
  if (!Array.isArray(rankings)) failures.push("rankings_missing");

  if (receipt) {
    if (receipt.protocol !== SCI_RECEIPT_PROTOCOL) failures.push("protocol_mismatch");
    if (receipt.caseId !== caseDefinition.id) failures.push("case_id_mismatch");
    if (receipt.repoCommit !== caseDefinition.repoCommit) failures.push("repo_commit_mismatch");
    if (receipt.candidateSetHash !== setHash) failures.push("candidate_set_hash_mismatch");
    if (!TRUSTED_SCI_EXECUTABLES.includes(receipt.executable))
      failures.push("untrusted_executable");
    if (receipt.sandboxMode !== "read-only") failures.push("sandbox_not_read_only");
    if (receipt.noIndex !== true) failures.push("indexing_not_disabled");
    if (receipt.ontologyStateBefore !== "absent" || receipt.ontologyStateAfter !== "absent") {
      failures.push("ontology_absence_not_proven");
    }
    if (receipt.cleanupCompleted !== true) failures.push("cleanup_not_completed");
  }

  const rankByPath = new Map();
  let rankingsMalformed = false;
  if (Array.isArray(rankings)) {
    for (const ranking of rankings) {
      if (
        !ranking ||
        typeof ranking.path !== "string" ||
        !Number.isSafeInteger(ranking.rank) ||
        ranking.rank < 0 ||
        rankByPath.has(ranking.path)
      ) {
        failures.push("rankings_malformed");
        rankingsMalformed = true;
        break;
      }
      rankByPath.set(ranking.path, ranking.rank);
    }
    if (rankByPath.size !== paths.size || [...paths].some((path) => !rankByPath.has(path))) {
      failures.push("rankings_not_canonical_candidate_set");
    }
    if (!rankingsMalformed && receipt && receipt.rankingHash !== rankingHash(rankings)) {
      failures.push("ranking_hash_mismatch");
    }
  }

  return {
    available: failures.length === 0,
    failures: [...new Set(failures)].sort(compareUtf8),
    rankByPath,
  };
}

function rankedRows(caseDefinition, sciValidation) {
  const tokens = queryTokens(caseDefinition.question);
  return caseDefinition.candidates.map((candidate) => {
    const pathScore = matchingTokenCount(candidate.path, tokens) * 2;
    const metadata = [candidate.summary ?? "", ...(candidate.readWhen ?? [])].join(" ");
    return {
      path: candidate.path,
      pathScore,
      metadataScore: matchingTokenCount(metadata, tokens),
      sciRank: sciValidation.rankByPath.get(candidate.path),
    };
  });
}

function select(rows, arm, maxItems) {
  const ordered = [...rows];
  ordered.sort((left, right) => {
    if (arm === "sci" || arm === "fusion") {
      const rankDelta = left.sciRank - right.sciRank;
      if (rankDelta !== 0) return rankDelta;
    }
    if (arm === "source_list" || arm === "fusion") {
      const metadataTotalDelta =
        right.pathScore + right.metadataScore - (left.pathScore + left.metadataScore);
      if (metadataTotalDelta !== 0) return metadataTotalDelta;
      const metadataDelta = right.metadataScore - left.metadataScore;
      if (metadataDelta !== 0) return metadataDelta;
    }
    if (arm !== "sci") {
      const pathDelta = right.pathScore - left.pathScore;
      if (pathDelta !== 0) return pathDelta;
    }
    return compareUtf8(left.path, right.path);
  });
  return ordered.slice(0, maxItems).map(({ path }) => path);
}

function metrics(selected, truth) {
  const truthSet = new Set(truth);
  const hits = selected.filter((path) => truthSet.has(path));
  return {
    selected,
    hits: hits.length,
    precision: selected.length === 0 ? 0 : hits.length / selected.length,
    recall: truth.length === 0 ? 0 : hits.length / truth.length,
    unnecessary: selected.filter((path) => !truthSet.has(path)),
    omittedTruth: truth.filter((path) => !selected.includes(path)),
  };
}

function mean(values) {
  return values.length === 0
    ? null
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function aggregatePair(cases, treatment) {
  const paired = cases.filter(
    (entry) =>
      entry.arms.paths.available &&
      entry.arms[treatment].eligible &&
      entry.arms[treatment].available,
  );
  const summarize = (arm) => ({
    macroPrecision: mean(paired.map((entry) => entry.arms[arm].metrics.precision)),
    macroRecall: mean(paired.map((entry) => entry.arms[arm].metrics.recall)),
    unnecessary: paired.reduce(
      (total, entry) => total + entry.arms[arm].metrics.unnecessary.length,
      0,
    ),
    omissions: paired.reduce(
      (total, entry) => total + entry.arms[arm].metrics.omittedTruth.length,
      0,
    ),
  });
  return {
    caseIds: paired.map(({ id }) => id),
    pairedCaseCount: paired.length,
    paths: summarize("paths"),
    [treatment]: summarize(treatment),
  };
}

function validateRepository(repository) {
  invariant(
    repository && typeof repository.id === "string" && repository.id.length > 0,
    "repository id is required",
  );
  invariant(
    typeof repository.metadataCoverage === "number" &&
      repository.metadataCoverage >= 0 &&
      repository.metadataCoverage <= 1,
    `${repository.id}: metadataCoverage must be between zero and one`,
  );
  const sample = repository.metadataStalenessSample;
  invariant(
    sample && Array.isArray(sample.sampledPaths) && sample.sampledPaths.length > 0,
    `${repository.id}: staleness sample is required`,
  );
  invariant(Array.isArray(sample.stalePaths), `${repository.id}: stalePaths must be an array`);
  invariant(
    new Set(sample.sampledPaths).size === sample.sampledPaths.length,
    `${repository.id}: sampledPaths must be unique`,
  );
  invariant(
    new Set(sample.stalePaths).size === sample.stalePaths.length,
    `${repository.id}: stalePaths must be unique`,
  );
  invariant(
    sample.sampledPaths.every(isCanonicalRepositoryPath),
    `${repository.id}: sampledPaths must be canonical and repository-relative`,
  );
  invariant(
    sample.stalePaths.every((path) => sample.sampledPaths.includes(path)),
    `${repository.id}: stalePaths must be sampled`,
  );
}

export function evaluateSourceSelectionExperiment(experiment) {
  invariant(experiment && typeof experiment === "object", "experiment must be an object");
  invariant(experiment.protocol === EXPERIMENT_PROTOCOL, "unsupported experiment protocol");
  invariant(
    Array.isArray(experiment.repositories) && experiment.repositories.length > 0,
    "repositories are required",
  );
  invariant(Array.isArray(experiment.cases) && experiment.cases.length > 0, "cases are required");
  experiment.repositories.forEach(validateRepository);
  const repositories = new Map(
    experiment.repositories.map((repository) => [repository.id, repository]),
  );
  invariant(repositories.size === experiment.repositories.length, "repository ids must be unique");

  const caseIds = new Set();
  const counts = new Map();
  const metadataCandidates = new Map();
  for (const item of experiment.cases) {
    invariant(
      item && typeof item.id === "string" && item.id.length > 0 && !caseIds.has(item.id),
      "case ids must be unique",
    );
    caseIds.add(item.id);
    invariant(repositories.has(item.repositoryId), `${item.id}: unknown repository`);
    invariant(
      /^[0-9a-f]{40,64}$/.test(item.repoCommit),
      `${item.id}: repoCommit must be a full lowercase hash`,
    );
    invariant(
      typeof item.question === "string" && item.question.length > 0,
      `${item.id}: question is required`,
    );
    invariant(
      Array.isArray(item.candidates) && item.candidates.length > 0,
      `${item.id}: candidates are required`,
    );
    item.candidates.forEach((candidate) => {
      validateCandidate(candidate, item.id);
    });
    const paths = new Set(item.candidates.map(({ path }) => path));
    invariant(paths.size === item.candidates.length, `${item.id}: candidate paths must be unique`);
    invariant(
      Number.isSafeInteger(item.maxItems) && item.maxItems > 0 && item.maxItems <= paths.size,
      `${item.id}: explicit maxItems is invalid`,
    );
    invariant(
      Array.isArray(item.truth) && item.truth.length > 0,
      `${item.id}: truth is required for metrics`,
    );
    invariant(
      new Set(item.truth).size === item.truth.length && item.truth.every((path) => paths.has(path)),
      `${item.id}: truth must be unique canonical candidates`,
    );
    invariant(
      item.eligibility &&
        typeof item.eligibility.sourceList === "boolean" &&
        typeof item.eligibility.sci === "boolean",
      `${item.id}: arm eligibility is required`,
    );
    const repository = repositories.get(item.repositoryId);
    invariant(
      !item.eligibility.sourceList || repository.metadataCoverage >= 0.6,
      `${item.id}: source-list eligibility requires >=60% repository coverage`,
    );
    const repositoryCounts = counts.get(item.repositoryId) ?? {
      total: 0,
      sourceList: 0,
      sci: 0,
      fusion: 0,
    };
    repositoryCounts.total += 1;
    if (item.eligibility.sourceList) repositoryCounts.sourceList += 1;
    if (item.eligibility.sci) repositoryCounts.sci += 1;
    if (item.eligibility.sourceList && item.eligibility.sci) repositoryCounts.fusion += 1;
    counts.set(item.repositoryId, repositoryCounts);
    const metadataPaths = metadataCandidates.get(item.repositoryId) ?? new Set();
    for (const candidate of item.candidates) {
      if ((candidate.summary ?? "").length > 0 || (candidate.readWhen ?? []).length > 0) {
        metadataPaths.add(candidate.path);
      }
    }
    metadataCandidates.set(item.repositoryId, metadataPaths);
  }
  for (const [repositoryId, repository] of repositories) {
    const armCounts = counts.get(repositoryId);
    invariant(
      armCounts && armCounts.total >= 10,
      `${repositoryId}: every declared repository requires at least 10 questions`,
    );
    for (const arm of ["sourceList", "sci", "fusion"]) {
      const count = armCounts[arm];
      invariant(
        count === 0 || count >= 10,
        `${repositoryId}: ${arm} eligibility requires at least 10 questions`,
      );
    }
    const metadataPaths = metadataCandidates.get(repositoryId) ?? new Set();
    invariant(
      repository.metadataStalenessSample.sampledPaths.every((path) => metadataPaths.has(path)),
      `${repositoryId}: staleness sample must reference frozen metadata-bearing candidates`,
    );
  }

  const evaluatedCases = experiment.cases.map((item) => {
    const paths = new Set(item.candidates.map(({ path }) => path));
    const setHash = candidateSetHash(item.candidates);
    const sci = validateSci(item, paths, setHash);
    const rows = rankedRows(item, sci);
    const availability = {
      paths: { eligible: true, available: true, failures: [] },
      source_list: {
        eligible: item.eligibility.sourceList,
        available: item.eligibility.sourceList,
        failures: [],
      },
      sci: {
        eligible: item.eligibility.sci,
        available: item.eligibility.sci && sci.available,
        failures: sci.failures,
      },
      fusion: {
        eligible: item.eligibility.sourceList && item.eligibility.sci,
        available: item.eligibility.sourceList && item.eligibility.sci && sci.available,
        failures: sci.failures,
      },
    };
    const arms = Object.fromEntries(
      Object.entries(availability).map(([arm, status]) => [
        arm,
        {
          ...status,
          metrics: status.available ? metrics(select(rows, arm, item.maxItems), item.truth) : null,
        },
      ]),
    );
    return {
      id: item.id,
      repositoryId: item.repositoryId,
      maxItems: item.maxItems,
      candidateSetHash: setHash,
      arms,
    };
  });

  const availability = Object.fromEntries(
    ["paths", "source_list", "sci", "fusion"].map((arm) => {
      const eligible = evaluatedCases.filter((entry) => entry.arms[arm].eligible);
      return [
        arm,
        {
          eligible: eligible.length,
          available: eligible.filter((entry) => entry.arms[arm].available).length,
        },
      ];
    }),
  );
  const allFour = evaluatedCases.filter((entry) =>
    ["paths", "source_list", "sci", "fusion"].every(
      (arm) => entry.arms[arm].eligible && entry.arms[arm].available,
    ),
  );

  return {
    protocol: EXPERIMENT_PROTOCOL,
    repositories: experiment.repositories.map((repository) => ({
      id: repository.id,
      metadataCoverage: repository.metadataCoverage,
      caseCount: counts.get(repository.id).total,
      eligibleCases: {
        sourceList: counts.get(repository.id).sourceList,
        sci: counts.get(repository.id).sci,
        fusion: counts.get(repository.id).fusion,
      },
      metadataStalenessSample: {
        sampled: repository.metadataStalenessSample.sampledPaths.length,
        stale: repository.metadataStalenessSample.stalePaths.length,
      },
    })),
    cases: evaluatedCases,
    availability,
    paired: {
      source_list: aggregatePair(evaluatedCases, "source_list"),
      sci: aggregatePair(evaluatedCases, "sci"),
      fusion: aggregatePair(evaluatedCases, "fusion"),
      allFourCaseIds: allFour.map(({ id }) => id),
    },
  };
}

export const experimentInternals = Object.freeze({ candidateSetHash, rankingHash });
