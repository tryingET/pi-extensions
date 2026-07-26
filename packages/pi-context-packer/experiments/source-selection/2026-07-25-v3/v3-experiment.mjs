import { validateSourceListPreparation } from "../../../src/source-selection-experiment-preparation.js";
import { validateQuestionIdentity } from "../../../src/source-selection-experiment-question.js";
import {
  buildRankingRows,
  metrics,
  selectArm,
} from "../../../src/source-selection-experiment-ranking.js";
import { validateSourceListArtifact } from "../../../src/source-selection-experiment-source-list.js";
import { validateStructuralEvidenceBundle } from "../../../src/source-selection-experiment-structural.js";
import {
  boundedText,
  exactKeys,
  invariant,
  isCommit,
  isSafePath,
  mean,
  normalizeText,
  sha256Digest,
  unique,
} from "../../../src/source-selection-experiment-utils.js";
import { positiveEvidenceDiagnostics, selectPositiveEvidence } from "./ranking-treatment.mjs";

export const V3_PROTOCOL = "pi-context-packer-source-selection-refinement/v3";
const ARMS = ["paths", "source_list_full", "source_list_positive", "structural", "fusion_full"];

function canonicalPaths(values) {
  return [...values].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function validateStaleness(sample, repository) {
  exactKeys(
    sample,
    ["commit", "rawArtifactSha256", "method", "sampledPaths", "stalePaths", "sampleDigest"],
    [],
    `${repository.id}.metadataStalenessSample`,
  );
  invariant(sample.commit === repository.commit, `${repository.id}: staleness commit mismatch`);
  invariant(
    sample.rawArtifactSha256 === repository.rawArtifactSha256,
    `${repository.id}: staleness artifact mismatch`,
  );
  invariant(
    boundedText(sample.method, 2000, true) && sample.method === normalizeText(sample.method),
    `${repository.id}: invalid staleness method`,
  );
  for (const field of ["sampledPaths", "stalePaths"]) {
    invariant(Array.isArray(sample[field]), `${repository.id}: ${field} must be an array`);
    invariant(
      sample[field].every(isSafePath) &&
        unique(sample[field]) &&
        JSON.stringify(sample[field]) === JSON.stringify(canonicalPaths(sample[field])),
      `${repository.id}: ${field} must contain canonical unique safe paths`,
    );
  }
  invariant(
    sample.sampledPaths.length > 0 || repository.presentCount === 0,
    `${repository.id}: empty staleness sample requires zero metadata-present records`,
  );
  invariant(
    sample.sampledPaths.every(
      (path) =>
        repository.pathSet.has(path) &&
        repository.recordByPath.get(path).metadataStatus === "present",
    ),
    `${repository.id}: staleness sample is outside metadata-present records`,
  );
  invariant(
    sample.stalePaths.every((path) => sample.sampledPaths.includes(path)),
    `${repository.id}: stale path was not sampled`,
  );
  const { sampleDigest: _ignored, ...body } = sample;
  invariant(sample.sampleDigest === sha256Digest(body), `${repository.id}: sample digest mismatch`);
}

function validateRepository(input) {
  exactKeys(
    input,
    ["id", "commit", "sourceListArtifact", "sourceListPreparation", "metadataStalenessSample"],
    [],
    "repository",
  );
  invariant(
    boundedText(input.id, 128, true) && input.id === normalizeText(input.id),
    "repository id is invalid",
  );
  invariant(isCommit(input.commit), `${input.id}: invalid commit`);
  const payload = validateSourceListArtifact(input.sourceListArtifact);
  invariant(payload.items.length > 0, `${input.id}: empty candidate universe`);
  const preparation = validateSourceListPreparation(
    input.sourceListPreparation,
    input.commit,
    input.sourceListArtifact,
    payload,
  );
  const presentCount = payload.items.filter(
    ({ metadataStatus }) => metadataStatus === "present",
  ).length;
  const repository = {
    input,
    id: input.id,
    commit: input.commit,
    payload,
    records: payload.items,
    rawArtifactSha256: input.sourceListArtifact.rawSha256,
    presentCount,
    coverage: presentCount / payload.items.length,
    pathSet: new Set(payload.items.map(({ path }) => path)),
    recordByPath: new Map(payload.items.map((item) => [item.path, item])),
    preparation,
  };
  validateStaleness(input.metadataStalenessSample, repository);
  return repository;
}

function validateRepositories(inputs) {
  invariant(Array.isArray(inputs) && inputs.length === 5, "v3 requires exactly five repositories");
  const repositories = new Map();
  for (const input of inputs) {
    const repository = validateRepository(input);
    invariant(!repositories.has(repository.id), "repository ids must be unique");
    repositories.set(repository.id, repository);
  }
  invariant(
    [...repositories.values()].filter(({ coverage }) => coverage >= 0.6).length >= 3,
    "v3 requires at least three metadata-eligible repositories",
  );
  return repositories;
}

function validateCases(cases, repositories) {
  invariant(Array.isArray(cases) && cases.length === 50, "v3 requires exactly 50 cases");
  const ids = [];
  const questionIds = [];
  const counts = new Map([...repositories.keys()].map((id) => [id, 0]));
  const intents = new Map([...repositories.keys()].map((id) => [id, new Set()]));
  const targets = new Map([...repositories.keys()].map((id) => [id, new Set()]));
  for (const item of cases) {
    exactKeys(
      item,
      [
        "id",
        "repositoryId",
        "repositoryCommit",
        "sourceListArtifactSha256",
        "question",
        "questionId",
        "intentSignature",
        "targetBasisDigest",
        "maxItems",
        "truth",
        "structuralEvidence",
      ],
      [],
      "case",
    );
    invariant(boundedText(item.id, 128, true), "case id must be nonblank");
    invariant(repositories.has(item.repositoryId), `${item.id}: unknown repository`);
    const repository = repositories.get(item.repositoryId);
    invariant(item.repositoryCommit === repository.commit, `${item.id}: commit mismatch`);
    invariant(
      item.sourceListArtifactSha256 === repository.rawArtifactSha256,
      `${item.id}: source-list artifact mismatch`,
    );
    invariant(
      boundedText(item.question, 4000, true) && item.question === normalizeText(item.question),
      `${item.id}: question is invalid`,
    );
    invariant(
      Number.isSafeInteger(item.maxItems) && item.maxItems === 4,
      `${item.id}: maxItems must equal four`,
    );
    invariant(
      Array.isArray(item.truth) &&
        item.truth.length >= 1 &&
        item.truth.length <= 4 &&
        unique(item.truth) &&
        item.truth.every((path) => repository.pathSet.has(path)),
      `${item.id}: truth is invalid or outside the universe`,
    );
    const identity = validateQuestionIdentity(item, repository);
    invariant(
      !intents.get(item.repositoryId).has(identity.intentSignature),
      `${item.id}: duplicate intent`,
    );
    invariant(
      !targets.get(item.repositoryId).has(identity.targetBasisDigest),
      `${item.id}: duplicate truth target`,
    );
    intents.get(item.repositoryId).add(identity.intentSignature);
    targets.get(item.repositoryId).add(identity.targetBasisDigest);
    ids.push(item.id);
    questionIds.push(identity.questionId);
    counts.set(item.repositoryId, counts.get(item.repositoryId) + 1);
  }
  invariant(unique(ids) && unique(questionIds), "case and question ids must be unique");
  for (const [id, count] of counts) invariant(count === 10, `${id}: expected exactly 10 cases`);
}

function availability(repository, structural) {
  const eligible = repository.coverage >= 0.6;
  return {
    paths: { eligible: true, available: true, failures: [] },
    source_list_full: {
      eligible,
      available: eligible,
      failures: eligible ? [] : ["repository_metadata_coverage_below_60_percent"],
    },
    source_list_positive: {
      eligible,
      available: eligible,
      failures: eligible ? [] : ["repository_metadata_coverage_below_60_percent"],
    },
    structural: {
      eligible: true,
      available: structural.available,
      failures: structural.failures,
    },
    fusion_full: {
      eligible,
      available: eligible && structural.available,
      failures: eligible ? structural.failures : ["repository_metadata_coverage_below_60_percent"],
    },
  };
}

function evaluateCase(item, repository) {
  const structural = validateStructuralEvidenceBundle(item, repository);
  const rows = buildRankingRows(item, repository, structural);
  const statuses = availability(repository, structural);
  const selections = {
    paths: selectArm(rows, "paths", item.maxItems),
    source_list_full: selectArm(rows, "source_list", item.maxItems),
    source_list_positive: selectPositiveEvidence(rows, item.maxItems),
    structural: selectArm(rows, "structural", item.maxItems),
    fusion_full: selectArm(rows, "fusion", item.maxItems),
  };
  const arms = Object.fromEntries(
    ARMS.map((arm) => {
      const status = statuses[arm];
      const armMetrics = status.available ? metrics(selections[arm], item.truth) : null;
      return [
        arm,
        {
          ...status,
          maxItems: item.maxItems,
          candidateCount: repository.records.length,
          metrics: armMetrics,
          diagnostics:
            arm === "source_list_positive" && status.available
              ? positiveEvidenceDiagnostics(rows, selections[arm], item.maxItems)
              : null,
        },
      ];
    }),
  );
  return {
    id: item.id,
    repositoryId: item.repositoryId,
    repositoryCommit: item.repositoryCommit,
    question: item.question,
    questionId: item.questionId,
    intentSignature: item.intentSignature,
    targetBasisDigest: item.targetBasisDigest,
    maxItems: item.maxItems,
    candidateCount: repository.records.length,
    arms,
    structuralEvidence: structural.available
      ? {
          receiptDigest: structural.receipt.receiptDigest,
          executionObservationDigest:
            item.structuralEvidence.executionObservation.observationDigest,
          encounterOrderHasRelevanceSemantics: false,
        }
      : null,
  };
}

function summarize(entries, arm) {
  const available = entries.filter((entry) => entry.arms[arm].available);
  if (available.length === 0) return { caseCount: 0 };
  const unnecessary = available.reduce(
    (total, entry) => total + entry.arms[arm].metrics.unnecessary.length,
    0,
  );
  const omissions = available.reduce(
    (total, entry) => total + entry.arms[arm].metrics.omittedTruth.length,
    0,
  );
  const selected = available.reduce(
    (total, entry) => total + entry.arms[arm].metrics.selected.length,
    0,
  );
  return {
    caseCount: available.length,
    macroPrecision: mean(available.map((entry) => entry.arms[arm].metrics.precision)),
    macroRecall: mean(available.map((entry) => entry.arms[arm].metrics.recall)),
    unnecessary,
    unnecessaryPerCase: unnecessary / available.length,
    omissions,
    omissionsPerCase: omissions / available.length,
    selected,
    selectedPerCase: selected / available.length,
    underfilledCaseRate:
      arm === "source_list_positive"
        ? mean(available.map((entry) => Number(entry.arms[arm].diagnostics.underfilled)))
        : null,
    emptySelectionRate:
      arm === "source_list_positive"
        ? mean(available.map((entry) => Number(entry.arms[arm].diagnostics.abstained)))
        : null,
    unusedCapacityPerCase:
      arm === "source_list_positive"
        ? mean(available.map((entry) => entry.arms[arm].diagnostics.unusedCapacity))
        : null,
    positiveEvidenceCandidatesPerCase:
      arm === "source_list_positive"
        ? mean(available.map((entry) => entry.arms[arm].diagnostics.positiveEvidenceCandidateCount))
        : null,
    zeroEvidenceSelectedCount:
      arm === "source_list_positive"
        ? available.reduce(
            (total, entry) => total + entry.arms[arm].diagnostics.zeroEvidenceSelectedCount,
            0,
          )
        : null,
  };
}

function aggregate(cases, repositories) {
  const eligibleRepositoryIds = [...repositories.values()]
    .filter(({ coverage }) => coverage >= 0.6)
    .map(({ id }) => id);
  const perRepository = Object.fromEntries(
    [...repositories.keys()].map((id) => {
      const entries = cases.filter(({ repositoryId }) => repositoryId === id);
      return [
        id,
        {
          caseCount: entries.length,
          arms: Object.fromEntries(ARMS.map((arm) => [arm, summarize(entries, arm)])),
        },
      ];
    }),
  );
  const equalMacro = Object.fromEntries(
    ARMS.map((arm) => {
      const included = eligibleRepositoryIds
        .map((id) => perRepository[id].arms[arm])
        .filter(({ caseCount }) => caseCount > 0);
      if (included.length === 0) return [arm, { repositoryCount: 0 }];
      return [
        arm,
        {
          repositoryCount: included.length,
          macroPrecision: mean(included.map(({ macroPrecision }) => macroPrecision)),
          macroRecall: mean(included.map(({ macroRecall }) => macroRecall)),
          meanRepositoryUnnecessaryPerCase: mean(
            included.map(({ unnecessaryPerCase }) => unnecessaryPerCase),
          ),
          meanRepositoryOmissionsPerCase: mean(
            included.map(({ omissionsPerCase }) => omissionsPerCase),
          ),
          selectedPerCase: mean(included.map(({ selectedPerCase }) => selectedPerCase)),
          underfilledCaseRate: mean(
            included
              .map(({ underfilledCaseRate }) => underfilledCaseRate)
              .filter((value) => value !== null),
          ),
          emptySelectionRate: mean(
            included
              .map(({ emptySelectionRate }) => emptySelectionRate)
              .filter((value) => value !== null),
          ),
          unusedCapacityPerCase: mean(
            included
              .map(({ unusedCapacityPerCase }) => unusedCapacityPerCase)
              .filter((value) => value !== null),
          ),
          positiveEvidenceCandidatesPerCase: mean(
            included
              .map(({ positiveEvidenceCandidatesPerCase }) => positiveEvidenceCandidatesPerCase)
              .filter((value) => value !== null),
          ),
          zeroEvidenceSelectedCount: included.reduce(
            (total, item) => total + (item.zeroEvidenceSelectedCount ?? 0),
            0,
          ),
        },
      ];
    }),
  );
  const paths = equalMacro.paths;
  const positive = equalMacro.source_list_positive;
  const full = equalMacro.source_list_full;
  const unnecessaryReduction =
    paths.meanRepositoryUnnecessaryPerCase === 0
      ? null
      : (paths.meanRepositoryUnnecessaryPerCase - positive.meanRepositoryUnnecessaryPerCase) /
        paths.meanRepositoryUnnecessaryPerCase;
  const perRepositoryOmissionNonIncrease = eligibleRepositoryIds.every(
    (id) =>
      perRepository[id].arms.source_list_positive.omissionsPerCase <=
      perRepository[id].arms.paths.omissionsPerCase,
  );
  const eligibleCases = cases.filter((entry) => eligibleRepositoryIds.includes(entry.repositoryId));
  const gates = {
    atLeastThreeEligibleRepositories: eligibleRepositoryIds.length >= 3,
    tenCasesPerDeclaredRepository: [...repositories.keys()].every(
      (id) => perRepository[id].caseCount === 10,
    ),
    precisionDeltaAtLeastPoint10: positive.macroPrecision - paths.macroPrecision >= 0.1,
    pathsUnnecessaryBaselinePositive: paths.meanRepositoryUnnecessaryPerCase > 0,
    unnecessaryReductionAtLeast20Percent:
      unnecessaryReduction !== null && unnecessaryReduction >= 0.2,
    macroOmissionsDoNotIncrease:
      positive.meanRepositoryOmissionsPerCase <= paths.meanRepositoryOmissionsPerCase,
    noEligibleRepositoryOmissionIncrease: perRepositoryOmissionNonIncrease,
    zeroEvidenceSelectedCountIsZero: positive.zeroEvidenceSelectedCount === 0,
    allEligibleTreatmentCasesAvailable: eligibleCases.every(
      (entry) => entry.arms.source_list_positive.available,
    ),
    improvesFullWithoutTradeoff:
      positive.meanRepositoryUnnecessaryPerCase < full.meanRepositoryUnnecessaryPerCase &&
      positive.meanRepositoryOmissionsPerCase <= full.meanRepositoryOmissionsPerCase &&
      positive.macroPrecision >= full.macroPrecision,
  };
  return {
    eligibleRepositoryIds,
    denominators: {
      declaredRepositories: repositories.size,
      eligibleRepositories: eligibleRepositoryIds.length,
      declaredCases: cases.length,
      eligibleTreatmentCases: eligibleCases.length,
      availableTreatmentCases: eligibleCases.filter(
        (entry) => entry.arms.source_list_positive.available,
      ).length,
    },
    perRepository,
    equalRepositoryMacro: equalMacro,
    primaryDeltaFromPaths: {
      macroPrecision: positive.macroPrecision - paths.macroPrecision,
      macroRecall: positive.macroRecall - paths.macroRecall,
      meanRepositoryUnnecessaryPerCase:
        positive.meanRepositoryUnnecessaryPerCase - paths.meanRepositoryUnnecessaryPerCase,
      unnecessaryReductionRate: unnecessaryReduction,
      meanRepositoryOmissionsPerCase:
        positive.meanRepositoryOmissionsPerCase - paths.meanRepositoryOmissionsPerCase,
    },
    deltaFromSourceListFull: {
      macroPrecision: positive.macroPrecision - full.macroPrecision,
      macroRecall: positive.macroRecall - full.macroRecall,
      meanRepositoryUnnecessaryPerCase:
        positive.meanRepositoryUnnecessaryPerCase - full.meanRepositoryUnnecessaryPerCase,
      meanRepositoryOmissionsPerCase:
        positive.meanRepositoryOmissionsPerCase - full.meanRepositoryOmissionsPerCase,
    },
    gates,
    qualityGatePassed: Object.values(gates).every(Boolean),
  };
}

export function validateV3Experiment(input) {
  exactKeys(input, ["protocol", "repositories", "cases", "costStudy"], [], "experiment");
  invariant(input.protocol === V3_PROTOCOL, "unsupported v3 protocol");
  const repositories = validateRepositories(input.repositories);
  validateCases(input.cases, repositories);
  invariant(
    input.costStudy?.schema === "pi-context-packer.source_list_cost_observations.v3" &&
      input.costStudy.rankingExecuted === false &&
      input.costStudy.resultAbsent === true,
    "cost study is missing or not pre-ranking",
  );
  return { repositories };
}

export function evaluateV3Experiment(input) {
  const { repositories } = validateV3Experiment(input);
  const cases = input.cases.map((item) => evaluateCase(item, repositories.get(item.repositoryId)));
  return {
    protocol: V3_PROTOCOL,
    standingDecision: "REJECT_AUTOMATIC_SOURCE_LIST_INVOCATION",
    rankingOwner: "pi-context-packer",
    candidateUniversePolicy: "retained_full_source_list_v1_artifact_shared_by_all_arms",
    structuralEvidenceOrderSemantics: "none",
    costStudy: {
      aggregates: input.costStudy.aggregates,
      automaticInvocationGatePassed: false,
    },
    repositories: [...repositories.values()].map((repository) => ({
      id: repository.id,
      commit: repository.commit,
      candidateCount: repository.records.length,
      metadataPresentCount: repository.presentCount,
      metadataCoverage: repository.coverage,
      sourceListEligible: repository.coverage >= 0.6,
      rawSourceListArtifactSha256: repository.rawArtifactSha256,
      stalenessSampleCount: repository.input.metadataStalenessSample.sampledPaths.length,
      stalePathCount: repository.input.metadataStalenessSample.stalePaths.length,
    })),
    cases,
    aggregate: aggregate(cases, repositories),
  };
}
