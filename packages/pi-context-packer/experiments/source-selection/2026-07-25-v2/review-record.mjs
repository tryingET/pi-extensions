import {
  CASES_RELATIVE_PATH,
  EXPECTED_CASES_SHA256,
  EXPECTED_PREREGISTRATION_SHA256,
  PREREGISTRATION_RELATIVE_PATH,
  REPOSITORIES,
} from "./experiment-config.mjs";

export const CASE_COHORT_REVIEWS = Object.freeze({
  "agent-scripts": "dispatch-1784965442566",
  "engineering-core": "dispatch-1784965442566-1",
  dspx: "dispatch-1784965442567",
  "pi-extensions": "dispatch-1784965442568",
});

export const STALENESS_REVIEWS = Object.freeze({
  "agent-scripts": "dispatch-1784967045475",
  "engineering-core": "dispatch-1784967045476",
  dspx: "dispatch-1784967045476-1",
  "pi-extensions": "dispatch-1784967045477",
});

export function stalenessMethod(repositoryId) {
  const dispatchId = STALENESS_REVIEWS[repositoryId];
  if (!dispatchId) throw new Error(`${repositoryId}: missing staleness review dispatch`);
  return `Deterministic pre-ranking sample: the first up to 10 UTF-8-ordered metadata-present paths from the validated raw source-list artifact. Independently reviewed before ranking against the frozen commit and ACCEPTed by ${dispatchId}; stalePaths=[] was retained. Staleness review does not affect ranking.`;
}

export function independentReviewSummary() {
  return {
    status: "accepted-before-ranking",
    blockerRemediationDispatchId: "dispatch-1784967679451",
    caseCohorts: Object.fromEntries(
      REPOSITORIES.map(({ id }) => [
        id,
        { decision: "ACCEPT", dispatchId: CASE_COHORT_REVIEWS[id] },
      ]),
    ),
    metadataStalenessSamples: Object.fromEntries(
      REPOSITORIES.map(({ id }) => [
        id,
        { decision: "ACCEPT", dispatchId: STALENESS_REVIEWS[id], sampledPaths: 10, stalePaths: [] },
      ]),
    ),
    rankingLeakage: "none",
    rankingExecuted: false,
    rankingInspected: false,
  };
}

export function reviewMarkdown() {
  const commitRows = REPOSITORIES.map(({ id, commit }) => `| ${id} | \`${commit}\` |`).join("\n");
  const reviewRows = REPOSITORIES.map(
    ({ id }) =>
      `| ${id} | ACCEPT | \`${CASE_COHORT_REVIEWS[id]}\` | ACCEPT, stalePaths=[] | \`${STALENESS_REVIEWS[id]}\` |`,
  ).join("\n");
  return `# Pre-ranking review

Status: all case cohorts and metadata-staleness samples were independently **ACCEPTed before ranking**. Blockers from \`dispatch-1784967679451\` were remediated by repreparation as new frozen bytes.

- Canonical case source: \`${CASES_RELATIVE_PATH}\`, \`sha256:${EXPECTED_CASES_SHA256}\`.
- Preregistration: \`${PREREGISTRATION_RELATIVE_PATH}\`, \`sha256:${EXPECTED_PREREGISTRATION_SHA256}\`.
- Ranking leakage: **none**; no ranking was executed, retained, printed, or inspected.
- Metadata staleness: all four 10-path samples retained \`stalePaths=[]\`.
- SCI index/state evidence: retained strace \`trace=%file\` bundle is bounded file-access corroboration, not authentication; Git index reads are classified separately.
- Producer measurements: actual monotonic durations, exact raw bytes, and \`ceil(bytes/4)\` estimates are retained in \`preparation-summary.generated.json\`.
- Final ranking result: absent.

## Frozen commits

| Repository | Commit |
|---|---|
${commitRows}

## Independent ACCEPT reviews

| Repository | Case cohort | Case dispatch | Staleness sample | Staleness dispatch |
|---|---|---|---|---|
${reviewRows}
`;
}
