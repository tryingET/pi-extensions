import { aggregateExperiment } from "./source-selection-experiment-aggregate.js";
import { EXECUTION_OBSERVATION_SCHEMA } from "./source-selection-experiment-observation.js";
import { SOURCE_LIST_PREPARATION_SCHEMA } from "./source-selection-experiment-preparation.js";
import {
  expectedQuestionIdentity,
  validateQuestionIdentity,
} from "./source-selection-experiment-question.js";
import { buildRankingRows, metrics, selectArm } from "./source-selection-experiment-ranking.js";
import { SCI_RECEIPT_SCHEMA } from "./source-selection-experiment-receipt.js";
import {
  repositoryResult,
  validateRepositories,
} from "./source-selection-experiment-repository.js";
import { validateStructuralEvidenceBundle } from "./source-selection-experiment-structural.js";
import {
  boundedText,
  exactKeys,
  invariant,
  normalizeText,
  sha256Digest,
  sha256Raw,
  unique,
} from "./source-selection-experiment-utils.js";

export const EXPERIMENT_PROTOCOL = "pi-context-packer-source-selection-ablation/v2";
export { EXECUTION_OBSERVATION_SCHEMA, SCI_RECEIPT_SCHEMA, SOURCE_LIST_PREPARATION_SCHEMA };

const ARMS = ["paths", "source_list", "structural", "fusion"];

function validateCases(cases, repositories) {
  invariant(Array.isArray(cases) && cases.length > 0, "cases are required");
  const ids = [];
  const questionIds = [];
  const intentsByRepository = new Map([...repositories.keys()].map((id) => [id, new Set()]));
  const targetsByRepository = new Map([...repositories.keys()].map((id) => [id, new Set()]));
  const countByRepository = new Map([...repositories.keys()].map((id) => [id, 0]));
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
    ids.push(item.id);
    invariant(repositories.has(item.repositoryId), `${item.id}: unknown repository`);
    invariant(
      boundedText(item.question, 4000, true) && item.question === normalizeText(item.question),
      `${item.id}: question must be normalized nonblank text`,
    );
    const repository = repositories.get(item.repositoryId);
    invariant(item.repositoryCommit === repository.commit, `${item.id}: mixed repository commit`);
    invariant(
      item.sourceListArtifactSha256 === repository.rawArtifactSha256,
      `${item.id}: mixed source-list owner artifact`,
    );
    invariant(
      Number.isSafeInteger(item.maxItems) &&
        item.maxItems > 0 &&
        item.maxItems <= repository.records.length,
      `${item.id}: explicit maxItems is invalid`,
    );
    invariant(Array.isArray(item.truth) && item.truth.length > 0, `${item.id}: truth is required`);
    invariant(
      unique(item.truth) && item.truth.every((itemPath) => repository.pathSet.has(itemPath)),
      `${item.id}: truth must contain unique owner-artifact paths`,
    );
    const identity = validateQuestionIdentity(item, repository);
    invariant(
      !intentsByRepository.get(item.repositoryId).has(identity.intentSignature),
      `${item.repositoryId}: duplicate normalized intent signature`,
    );
    invariant(
      !targetsByRepository.get(item.repositoryId).has(identity.targetBasisDigest),
      `${item.repositoryId}: duplicate truth target basis`,
    );
    intentsByRepository.get(item.repositoryId).add(identity.intentSignature);
    targetsByRepository.get(item.repositoryId).add(identity.targetBasisDigest);
    questionIds.push(identity.questionId);
    countByRepository.set(item.repositoryId, countByRepository.get(item.repositoryId) + 1);
  }
  invariant(unique(ids), "case ids must be unique");
  invariant(unique(questionIds), "questionIds must be unique");
  for (const [repositoryId, count] of countByRepository) {
    invariant(
      count >= 10,
      `${repositoryId}: eligibility requires at least 10 cases with distinct intents and truth targets`,
    );
  }
}

function armAvailability(repository, structuralEvidence) {
  const sourceListEligible = repository.coverage >= 0.6;
  return {
    paths: { eligible: true, available: true, failures: [] },
    source_list: {
      eligible: sourceListEligible,
      available: sourceListEligible,
      failures: sourceListEligible ? [] : ["repository_metadata_coverage_below_60_percent"],
    },
    structural: {
      eligible: true,
      available: structuralEvidence.available,
      failures: structuralEvidence.failures,
    },
    fusion: {
      eligible: sourceListEligible,
      available: sourceListEligible && structuralEvidence.available,
      failures: sourceListEligible
        ? structuralEvidence.failures
        : ["repository_metadata_coverage_below_60_percent"],
    },
  };
}

function evaluateCase(caseDefinition, repository) {
  const structuralEvidence = validateStructuralEvidenceBundle(caseDefinition, repository);
  const rows = buildRankingRows(caseDefinition, repository, structuralEvidence);
  const statuses = armAvailability(repository, structuralEvidence);
  const arms = Object.fromEntries(
    ARMS.map((arm) => {
      const status = statuses[arm];
      return [
        arm,
        {
          ...status,
          maxItems: caseDefinition.maxItems,
          candidateCount: repository.records.length,
          sourceListArtifactSha256: repository.rawArtifactSha256,
          metrics: status.available
            ? metrics(selectArm(rows, arm, caseDefinition.maxItems), caseDefinition.truth)
            : null,
        },
      ];
    }),
  );
  return {
    id: caseDefinition.id,
    repositoryId: caseDefinition.repositoryId,
    repositoryCommit: caseDefinition.repositoryCommit,
    sourceListArtifactSha256: caseDefinition.sourceListArtifactSha256,
    question: caseDefinition.question,
    questionId: caseDefinition.questionId,
    intentSignature: caseDefinition.intentSignature,
    targetBasisDigest: caseDefinition.targetBasisDigest,
    maxItems: caseDefinition.maxItems,
    candidateCount: repository.records.length,
    arms,
    structuralEvidence: structuralEvidence.available
      ? {
          receiptDigest: structuralEvidence.receipt.receiptDigest,
          requestDigest: structuralEvidence.receipt.requestDigest,
          executionObservationDigest:
            caseDefinition.structuralEvidence.executionObservation.observationDigest,
          rawRequestSha256:
            caseDefinition.structuralEvidence.executionObservation.rawEvidence.requestSha256,
          rawReceiptSha256:
            caseDefinition.structuralEvidence.executionObservation.rawEvidence.receiptSha256,
          transcriptSha256:
            caseDefinition.structuralEvidence.executionObservation.rawEvidence.transcriptSha256,
          candidateIds: structuralEvidence.candidateIds,
          rawEvidenceRetainedInPreparedInput: true,
          encounterOrderHasRelevanceSemantics: false,
        }
      : null,
  };
}

export function evaluateSourceSelectionExperiment(experiment) {
  exactKeys(experiment, ["protocol", "repositories", "cases"], [], "experiment");
  invariant(experiment.protocol === EXPERIMENT_PROTOCOL, "unsupported experiment protocol");
  const repositories = validateRepositories(experiment.repositories);
  validateCases(experiment.cases, repositories);
  const evaluatedCases = experiment.cases.map((item) =>
    evaluateCase(item, repositories.get(item.repositoryId)),
  );
  return {
    protocol: EXPERIMENT_PROTOCOL,
    standingDecision: "REJECT_AUTOMATIC_SOURCE_LIST_ADOPTION",
    rankingOwner: "pi-context-packer",
    structuralEvidenceOrderSemantics: "none",
    candidateUniversePolicy: "validated_raw_source_list_v1_artifact_shared_by_all_arms",
    repositories: [...repositories.values()].map(repositoryResult),
    cases: evaluatedCases,
    ...aggregateExperiment(evaluatedCases, repositories),
  };
}

export const experimentInternals = Object.freeze({
  expectedQuestionIdentity,
  sha256Digest,
  sha256Raw,
});
