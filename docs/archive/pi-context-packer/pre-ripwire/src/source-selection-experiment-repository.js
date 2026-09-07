import { validateSourceListPreparation } from "./source-selection-experiment-preparation.js";
import { validateSourceListArtifact } from "./source-selection-experiment-source-list.js";
import {
  boundedText,
  compareUtf8,
  exactKeys,
  invariant,
  isCommit,
  isSafePath,
  normalizeText,
  sha256Digest,
  unique,
} from "./source-selection-experiment-utils.js";

function canonicalPathOrder(paths) {
  return paths.every(
    (itemPath, index) => index === 0 || compareUtf8(paths[index - 1], itemPath) < 0,
  );
}

function validateStaleness(sample, repositoryId, repository) {
  exactKeys(
    sample,
    ["commit", "rawArtifactSha256", "method", "sampledPaths", "stalePaths", "sampleDigest"],
    [],
    `${repositoryId}.metadataStalenessSample`,
  );
  invariant(sample.commit === repository.commit, `${repositoryId}: staleness commit mismatch`);
  invariant(
    sample.rawArtifactSha256 === repository.rawArtifactSha256,
    `${repositoryId}: staleness source-list artifact mismatch`,
  );
  invariant(
    boundedText(sample.method, 2000, true) && sample.method === normalizeText(sample.method),
    `${repositoryId}: staleness method must be normalized nonblank text`,
  );
  for (const field of ["sampledPaths", "stalePaths"]) {
    invariant(Array.isArray(sample[field]), `${repositoryId}: ${field} must be an array`);
    invariant(
      sample[field].every(isSafePath) && unique(sample[field]) && canonicalPathOrder(sample[field]),
      `${repositoryId}: ${field} must contain unique canonical safe paths`,
    );
  }
  invariant(sample.sampledPaths.length > 0, `${repositoryId}: staleness sample is empty`);
  invariant(
    sample.sampledPaths.every(
      (itemPath) =>
        repository.pathSet.has(itemPath) &&
        repository.recordByPath.get(itemPath).metadataStatus === "present",
    ),
    `${repositoryId}: sampledPaths must be metadata-present source-list items`,
  );
  invariant(
    sample.stalePaths.every((itemPath) => sample.sampledPaths.includes(itemPath)),
    `${repositoryId}: stalePaths must be sampled`,
  );
  const { sampleDigest: _ignored, ...body } = sample;
  invariant(sample.sampleDigest === sha256Digest(body), `${repositoryId}: sampleDigest mismatch`);
}

function validateRepository(repository) {
  exactKeys(
    repository,
    ["id", "commit", "sourceListArtifact", "sourceListPreparation", "metadataStalenessSample"],
    [],
    "repository",
  );
  invariant(
    boundedText(repository.id, 128, true) && repository.id === normalizeText(repository.id),
    "repository id must be normalized nonblank text",
  );
  invariant(isCommit(repository.commit), `${repository.id}: repository commit is invalid`);
  const payload = validateSourceListArtifact(repository.sourceListArtifact);
  invariant(payload.items.length > 0, `${repository.id}: source-list candidate universe is empty`);
  const preparation = validateSourceListPreparation(
    repository.sourceListPreparation,
    repository.commit,
    repository.sourceListArtifact,
    payload,
  );
  const presentCount = payload.items.filter(
    ({ metadataStatus }) => metadataStatus === "present",
  ).length;
  const paths = payload.items.map(({ path }) => path);
  const validated = {
    input: repository,
    id: repository.id,
    commit: repository.commit,
    records: payload.items,
    rawArtifactSha256: repository.sourceListArtifact.rawSha256,
    sourceListPayload: payload,
    preparation,
    coverage: presentCount / payload.items.length,
    presentCount,
    pathSet: new Set(paths),
    recordByPath: new Map(payload.items.map((item) => [item.path, item])),
  };
  validateStaleness(repository.metadataStalenessSample, repository.id, validated);
  return validated;
}

export function validateRepositories(repositories) {
  invariant(Array.isArray(repositories) && repositories.length > 0, "repositories are required");
  const result = new Map();
  for (const repository of repositories) {
    const validated = validateRepository(repository);
    invariant(!result.has(validated.id), "repository ids must be unique");
    result.set(validated.id, validated);
  }
  return result;
}

export function repositoryResult(repository) {
  const sourceExecutable = repository.input.sourceListPreparation.sourceListExecutable;
  const sample = repository.input.metadataStalenessSample;
  return {
    id: repository.id,
    commit: repository.commit,
    sourceListContractVersion: repository.sourceListPayload.contractVersion,
    rawSourceListArtifactSha256: repository.rawArtifactSha256,
    sourceListPreparationObservationDigest:
      repository.input.sourceListPreparation.observationDigest,
    sourceListRevision: sourceExecutable.revision,
    sourceListExecutableArtifactSha256: sourceExecutable.artifactSha256,
    candidateCount: repository.records.length,
    trackedPathCount: repository.preparation.trackedPathCount,
    metadataPresentCount: repository.presentCount,
    metadataCoverage: repository.coverage,
    sourceListEligible: repository.coverage >= 0.6,
    rawEvidenceRetainedInPreparedInput: true,
    metadataStalenessSample: {
      commit: sample.commit,
      rawArtifactSha256: sample.rawArtifactSha256,
      sampleDigest: sample.sampleDigest,
      method: sample.method,
      sampled: sample.sampledPaths.length,
      stale: sample.stalePaths.length,
      staleRate: sample.stalePaths.length / sample.sampledPaths.length,
    },
  };
}
