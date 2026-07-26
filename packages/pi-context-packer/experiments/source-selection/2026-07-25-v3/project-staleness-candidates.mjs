#!/usr/bin/env node
/** Project bounded metadata-staleness samples from retained observations without producer or ranking execution. */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { EXPERIMENT_DIR, OBSERVATIONS, RESULT } from "./experiment-config.mjs";
import { exists, fail, rawDigest, stableJson } from "./experiment-process.mjs";

const outputPath = join(EXPERIMENT_DIR, "metadata-staleness-candidates.generated.json");
if (await exists(outputPath)) fail(`refusing existing projection: ${outputPath}`);
if (await exists(RESULT)) fail(`ranking result must remain absent: ${RESULT}`);
const observationBytes = await readFile(OBSERVATIONS);
const observations = JSON.parse(observationBytes.toString("utf8"));
const repositories = observations.repositories.map((repository) => {
  const full = JSON.parse(repository.sourceListArtifact.rawJson);
  const byPath = new Map(full.items.map((item) => [item.path, item]));
  const sampledItems = repository.metadataStalenessCandidate.sampledPaths.map((path) => {
    const item = byPath.get(path);
    if (!item || item.metadataStatus !== "present") {
      fail(`${repository.id}: staleness sample is not metadata-present in the retained artifact`);
    }
    return {
      path: item.path,
      summary: item.summary,
      readWhen: item.readWhen,
    };
  });
  if (
    sampledItems.length === 0 &&
    !(repository.coverage.metadataPresentCount === 0 && repository.coverage.ratio === 0)
  ) {
    fail(`${repository.id}: empty sample is only valid for zero metadata-present coverage`);
  }
  return {
    id: repository.id,
    commit: repository.commit,
    sourceListArtifactSha256: repository.sourceListArtifact.rawSha256,
    totalCount: repository.coverage.totalCount,
    metadataPresentCount: repository.coverage.metadataPresentCount,
    metadataCoverage: repository.coverage.ratio,
    method: repository.metadataStalenessCandidate.method,
    sampledItems,
  };
});
const projection = {
  schema: "pi-context-packer.metadata_staleness_candidates.v3",
  status: "independent-review-required-before-prepared-input",
  sourceObservationSha256: rawDigest(observationBytes),
  rankingExecuted: false,
  truthOrRankingUsedForSampling: false,
  repositories,
};
const output = stableJson(projection);
await writeFile(outputPath, output, { flag: "wx", mode: 0o644 });
process.stdout.write(
  stableJson({
    status: "staleness-candidates-projected",
    repositories: repositories.length,
    sampledItems: repositories.reduce(
      (total, repository) => total + repository.sampledItems.length,
      0,
    ),
    rankingExecuted: false,
    sha256: rawDigest(output),
  }),
);
