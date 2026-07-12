---
summary: "Preregistered four-arm source-list and SCI source-selection ablation protocol."
read_when:
  - "Preparing or reviewing source-selection ablation artifacts."
  - "Reconsidering source-list or SCI-assisted selection in pi-context-packer."
type: "experiment"
system4d:
  container: "Preregistered source-selection experiment boundary."
  compass: "Compare frozen arms without granting automatic adoption authority."
  engine: "Freeze prepared evidence -> validate receipts -> evaluate paired eligible cases -> review independently."
  fog: "Unavailable SCI or metadata coverage can be misreported as comparative quality."
---

# Source-list + SCI selection ablation preregistration — 2026-07-12

## Decision posture

The standing decision remains **REJECT automatic source-list provider adoption now**. This protocol creates evidence; it does not reverse the decision in [the source-list provider pilot](2026-07-11-source-list-provider-pilot.md), authorize production wiring, or make a successful threshold result self-adopting. A later owner review must decide whether any measured value justifies invocation, trust, context, and maintenance costs.

## Question and frozen unit

For maintenance questions with file-level target truth fixed before evaluation, compare four deterministic selection arms over the **same frozen canonical candidate paths and the same explicit `maxItems` budget**:

1. `paths` — lexical path score only;
2. `source_list` — path score plus authored `summary` and `readWhen` tokens;
3. `sci` — SCI's supplied owner rank only; and
4. `fusion` — SCI owner rank first, with source-list/path scores only breaking equal SCI ranks.

Each eligible repository must contribute at least 10 independently specified maintenance questions. A case freezes its id, repository id and full commit, question, canonical candidates, truth paths, eligibility, and positive `maxItems` before ranking. The evaluator rejects an eligible repository with fewer than 10 questions. All truth paths must be members of the candidate set. Truth is passed only to the metric function after selections have been produced; it never supplies a budget, score, owner relation, tie-break, or fallback.

## Repository eligibility and metadata staleness

A repository is source-list eligible only when its frozen inventory has at least 60% `present` metadata coverage without a workspace metadata mandate. The prepared repository record reports coverage as a fraction. Near-zero and otherwise ineligible repositories remain visible but are not pooled as positive source-list evidence.

Before execution, preparers must draw and freeze a metadata-staleness sample for every repository. The sample must contain at least one metadata-bearing candidate, list every sampled path, and list the subset whose authored purpose is materially stale against the frozen commit. Selection does not use the staleness labels. Reports include sampled and stale counts; reviewers must inspect the prepared sampling basis and disclose sampling method and size alongside results. This harness checks membership and reports counts but does not inspect repositories or adjudicate prose freshness.

## Ranking contract

Question tokens are distinct lowercase ASCII alphanumerics of length at least three after removing the fixed stop set `and,the,for,its,with,change,focused,test,tests,behavior`.

- Path score: two points per query token appearing as an exact normalized path token.
- Source-list score: path score plus one point per query token appearing in `summary` or `readWhen`.
- SCI score: the non-negative integer owner rank supplied by SCI; lower is better. The evaluator does not infer imports, symbols, ownership, or missing ranks.
- Fusion: lower SCI owner rank, then higher combined metadata/path score, then higher metadata score, then higher path score.
- Remaining ties: ascending UTF-8 byte order of repository-relative path.

Each arm returns at most the case's explicit `maxItems`. The budget is identical across arms and is not derived from truth size. Candidate order in prepared JSON has no ranking significance.

## SCI receipt and fail-closed gate

SCI and fusion are available only when a prepared ranking covers the canonical candidate set exactly and a receipt binds all of the following:

- receipt protocol `sci-owner-ranking-receipt/v1`;
- exact case id and full repository commit;
- SHA-256 of the canonical UTF-8-byte-sorted candidate path array;
- SHA-256 of canonical `(path, owner rank)` records;
- one package-fixed trusted executable path;
- literal read-only sandbox mode;
- `noIndex: true`;
- `.ontology` absent before and after execution; and
- cleanup completed.

A missing, malformed, mismatched, incomplete, untrusted, writable, indexing-enabled, `.ontology`-ambiguous, or unclean receipt makes **both SCI and fusion unavailable**. They produce no selection and no metric. Fusion never falls back to source-list or paths. Unavailability is not a zero score and is not evidence for another arm.

The harness does not run SCI, index code, discover a repository, establish executable trust, or prove sandbox facts. Those are evidence-preparation responsibilities outside this runner. The runner consumes only a prepared JSON file and its caller-supplied SHA-256.

## Metrics and aggregation

Per available arm and case, report:

- ordered selected paths;
- hits;
- precision (`hits / selected`);
- recall (`hits / truth`);
- unnecessary-selection/read proxy (selected non-truth paths); and
- omitted truth paths.

Availability is reported as `available / eligible` for each arm. Aggregate comparisons are macro precision and recall plus summed unnecessary selections and omissions. They are computed only on paired cases where paths and the treatment are both eligible and available. The all-four case list is the intersection where every arm is eligible and available. No unpaired score, unavailable SCI case, or ineligible repository may enter a treatment aggregate.

The staleness sample is reported separately and cannot alter ranking or truth metrics. This protocol does not claim actual packet reads or task completion; unnecessary selection is only a read proxy.

## Decision thresholds

A source-list reconsideration requires all existing gates, not merely one favorable table:

1. at least three independently owned representative repositories at 60% or greater metadata coverage;
2. at least 10 preregistered questions per eligible repository under this frozen paired protocol;
3. paired macro precision improvement of at least `0.10`, unnecessary-selection reduction of at least `20%`, and no increase in target omissions;
4. a disclosed metadata-staleness sample with near-zero-coverage repositories excluded from positive aggregation;
5. a separately available SCI structural comparison with valid safety/executable receipts; and
6. independent review concluding that automatic invocation is worth its costs.

For SCI or fusion, report the same quality deltas and availability denominator, but no automatic-adoption threshold is implied. A treatment with incomplete availability cannot be represented as generally superior. Multiple questions from one repository are not independent repository replications.

## Prepared artifact and reproduction

The input JSON uses protocol `pi-context-packer-source-selection-ablation/v1`, repository records, and case records matching the evaluator contract. It should be archived with its SHA-256 before execution. Run only against that prepared artifact:

```bash
INPUT=prepared-source-selection-ablation.json
HASH=$(sha256sum "$INPUT" | cut -d' ' -f1)
node scripts/run-source-selection-experiment.mjs \
  --input "$INPUT" \
  --input-sha256 "$HASH" \
  --output source-selection-ablation-results.json
sha256sum "$INPUT" source-selection-ablation-results.json
```

The output file must not already exist. Reviewers should retain the input, output, hashes, frozen repository commits, candidate inventory receipts, staleness-sampling record, and independent SCI sandbox receipt together. A rerun with changed candidates, questions, truth, budgets, metadata, SCI ranks, commits, or receipts is a new experiment, not a reproduction.

## Non-authorizations and interpretation limits

This protocol authorizes no production adapter, provider registration, automatic context-plan/context-pack wiring, source-list change, metadata authoring campaign, SCI provider change, SCI indexing, `.ontology` creation, repository discovery, AK mutation, external mutation, merge, push, PR, or adoption decision. It does not transfer source-list metadata semantics into SCI or SCI structural semantics into source-list. `pi-context-packer` remains the final deterministic selector; source owners supply prepared evidence only.

The lexical arms remain weak baselines. File truth is not proof that transitive context is useless. Authored metadata may be stale or benchmark-aware. SCI owner rank may encode different structural notions across versions. Precision/recall do not price subprocess latency, context tokens, trust review, or maintenance. These limits favor the standing conservative **REJECT** decision until every gate is independently cleared and reviewed.
