---
summary: "Preregistered source-list and SCI structural-evidence selection ablation protocol."
read_when:
  - "Preparing or reviewing source-selection ablation artifacts."
  - "Reconsidering source-list or SCI-assisted selection in pi-context-packer."
type: "reference"
system4d:
  container: "Preregistered source-selection experiment boundary."
  compass: "Compare frozen arms without granting automatic adoption authority."
  engine: "Retain raw owner artifacts -> validate preparation/execution observations -> evaluate disclosed intersections -> review independently."
  fog: "Self-consistent projections, cloned questions, evidence order, and unbound hashes can masquerade as quality evidence."
---

# Source-list + SCI structural-evidence selection ablation preregistration — 2026-07-12

## Decision and ownership

The standing decision from the historical source-list provider pilot remains **REJECT automatic source-list provider adoption now**. This harness produces review evidence only. It does not reverse that decision, authorize production wiring, or make a favorable result self-adopting. The pilot artifact is not present in the current reconciled documentation tree, so this preregistration does not retain a broken relative link to it.

Ownership remains explicit:

- Agent Scripts `source-list` owns the factual `source-list.v1` tracked-source inventory and metadata-status grammar;
- Semantic Code Intelligence (SCI) owns `semantic-code-intelligence.structural_evidence_receipt.v1` and its structural evidence semantics; and
- `pi-context-packer` owns ranking, tie-breaks, budgets, selection, ablation metrics, and interpretation.

Neither owner artifact is authenticated by this harness. Raw bytes, commands, observations, revisions, and artifact hashes are retained so an independent reviewer can assess the external preparation boundary. Hashes detect content mismatch; they are not signatures.

## Adoption decision gates

The historical pilot's numeric reconsideration gates are promoted here so the current v2 protocol has one reviewable decision contract. Automatic `source-list` invocation remains **REJECTED** unless every condition below is satisfied:

1. at least three independently owned representative repositories each derive at least 60% `present` metadata coverage from their frozen raw `source-list.v1` artifact without a workspace metadata mandate;
2. every declared repository contributes at least 10 pre-ranking-reviewed maintenance questions with distinct normalized intent signatures and distinct canonical truth target sets;
3. all arms use identical frozen candidate universes and positive per-case `maxItems` budgets, with truth entering only post-selection metrics;
4. on the `paths ∩ source_list` eligible-and-available population, equal-repository macro precision improves by at least `0.10`, the equal-repository unnecessary-selection/read proxy has a positive `pathsMacroUnnecessary` baseline and falls by at least `20%` under the formula `(pathsMacroUnnecessary - sourceListMacroUnnecessary) / pathsMacroUnnecessary`, and equal-repository target omissions do not increase;
5. metadata staleness is independently sampled and reported for every repository, while repositories below 60% coverage remain visible as ineligible controls rather than positive metadata evidence;
6. structural and fusion arms use actual fail-closed SCI owner receipts and retained execution observations, remain separate from source-list semantics, and report provider availability without fallback;
7. preparation and execution report source-list/SCI latency, raw artifact bytes, approximate context/token cost, executable identity, and maintenance/trust limitations; and
8. an independent post-ranking review concludes that automatic invocation is worth those costs and records an explicit `ADOPT`, `REFINE`, or `REJECT` owner decision.

For the 20% gate, `pathsMacroUnnecessary` and `sourceListMacroUnnecessary` are the equal-repository macro unnecessary-selection/read quantities on that same disclosed intersection. The percentage reduction is exactly `(pathsMacroUnnecessary - sourceListMacroUnnecessary) / pathsMacroUnnecessary`. `pathsMacroUnnecessary` must be strictly positive. A zero paths baseline makes the percentage reduction undefined and the 20% improvement **not demonstrated**; it is not treated as a pass, zero reduction, or infinite improvement.

The source-list adoption gate compares `source_list` against `paths`; a structural or fusion improvement cannot substitute for a failed metadata gate. Clearing every numeric gate still does not self-authorize production wiring. `ADOPT` only permits creation of a separate scoped implementation task and owner review.

## Frozen case and four arms

Input protocol `pi-context-packer-source-selection-ablation/v2` compares:

1. `paths` — lexical path score;
2. `source_list` — path plus authored metadata score;
3. `structural` — context-packer's structural path/type/count policy over validated SCI evidence; and
4. `fusion` — structural ordering followed by source-list/path lexical tie-breaks.

Every arm uses the same validated owner-artifact candidate universe and one positive case `maxItems`. A case freezes its repository/commit, raw source-list artifact digest, normalized question, preregistered question identity, intent signature, target-basis digest, truth, expected SCI request/provenance, SCI receipt, and execution observation. Truth enters only metric calculation after selection.

## Raw source-list owner artifact

There is no caller-projected inventory. Each repository retains the exact raw UTF-8 JSON text emitted by:

```text
<node> <pinned-source-list.mjs> --repo . --full-list --json
```

and `rawSha256` over those exact bytes. The consumer parses and validates the closed success envelope:

- `contractVersion: source-list.v1`, `mode: inventory`, `repository: .`, and `ok: true`;
- the exact default `supportedExtensions` implied by the preregistered command;
- full-list posture: page/total-pages one, `truncated: false`, exact page size, and returned/total/item counts equal;
- inventory-mode zero violation fields;
- unique UTF-8-byte-ordered context-safe paths and exact path extensions;
- closed index/worktree kind enums; and
- closed metadata status, summary, `readWhen`, and error relationships matching source-list's v1 grammar.

`present` requires a regular source, a normalized nonblank summary of at most 240 characters, up to five normalized nonblank read-when hints, and no error. `absent`, `invalid`, `unreadable`, and `not_applicable` require their owner-defined null/empty metadata posture and kind/error relationships. Context-packer rejects control-bearing or otherwise unsafe paths rather than silently changing the owner artifact's universe.

Candidate paths, metadata, counts, and coverage are derived only from this parsed raw artifact. Coverage is `present items / all items`. `source_list` and `fusion` are eligible only at 60% or greater. Cases repeat the raw artifact digest and cannot supply alternate candidates or metadata.

## Source-list preparation observation

Each repository also retains a closed `pi-context-packer.source_list_preparation_observation.v1` containing:

- target full commit plus clean, empty-status, unchanged HEAD observations before and after;
- absolute Node/source-list executable paths;
- full source-list revision and executable artifact SHA-256 pins;
- exact full-list JSON argv, canonical digest, and exit-zero observation;
- the exact raw output artifact digest; and
- raw base64 Git index evidence from exact `git -C . --literal-pathspecs ls-files --cached --stage -z --`, with command, exit, and raw-byte hashes.

The harness parses the NUL stage records, derives supported tracked paths/index kinds, and requires exact equality with every source-list item. This catches a self-consistent raw artifact that omits, adds, or changes tracked candidates. The observation digest binds the complete record.

This is preparation evidence, not source-list authentication. Executable revision/hash claims require independent external corroboration.

## Metadata staleness

Every repository freezes a normalized nonblank staleness method, sampled metadata-present paths, stale subset, commit, raw source-list artifact digest, and `sampleDigest` over that body. Samples with another commit/artifact, duplicates, absent metadata, stale nonsample paths, or a bad digest are rejected. Staleness never changes ranking.

## Question identity and clone gate

Exact-string uniqueness is insufficient. The harness derives a normalized intent token set by lowercasing, removing punctuation, numeric/alphanumeric-number labels, and generic labels such as `case`, `question`, `scenario`, `example`, and `number`, then deduplicating and sorting remaining tokens.

Each case preregisters:

- `intentSignature = SHA-256(canonical normalized intent tokens)`;
- `targetBasisDigest = SHA-256(commit, raw source-list artifact digest, UTF-8-sorted truth path set)`; and
- `questionId = question:<SHA-256(repository id, intent signature, target-basis digest)>`.

The evaluator recomputes all three and requires both `intentSignature` and `targetBasisDigest` to be unique within each repository. Repeated, numbered, case-labelled, reordered, case-varied, punctuation-varied, or token-equivalent questions therefore fail the intent gate. Alphabetic labels or cosmetic intent variation cannot turn one truth target set into multiple cases because the target-basis gate rejects the duplicate independently. Reordering an identical truth set yields the same canonical digest and also fails. Each repository must supply at least 10 cases with distinct intent signatures and distinct truth target sets.

This is a deliberately conservative automated anti-duplication gate, not proof that the questions or targets are semantically independent. Synonyms, closely related target sets, benchmark construction choices, and shared causal mechanisms can still create dependence. Independent review of case quality and replication claims remains required.

## Deterministic selection

Question tokens for lexical scoring are distinct lowercase ASCII alphanumerics of length at least three after removing `and,the,for,its,with,change,focused,test,tests,behavior`.

- Path score: two points for each exact path token.
- Metadata score: one point for each exact token in a `present` source-list summary/read-when field.
- Source-list order: higher path-plus-metadata, metadata, then path score, then UTF-8 path bytes.
- Structural order: more direct evidence identities, more graph-related evidence, fixed per-kind counts `definition, reference, match, graph_node, graph_edge`, then UTF-8 path bytes.
- Fusion: structural order followed by source-list order.

The current accepted SCI Phase-B grammar emits only `match` evidence, so current structural ordering effectively uses match counts and paths. The wider kind order is a context-packer policy for contract validation/rollback clarity, not a claim that current Phase B produces those kinds. Receipt order, snippets, symbols, provenance, completeness, hashes, and truth never become relevance.

Graph edges whose source path/symbol equals their related path/symbol are rejected by the generic v1 receipt consumer and defensively blocked from structural counts. A self-edge therefore cannot inflate ranking.

## SCI receipt and exact Phase-B grammar

The consumer validates the closed SCI v1 envelope, canonical request/receipt digests, repository fingerprints, candidate ids, operation/kind compatibility, provenance, snippets/bytes, unique ids, ranges, counts/caps, backend outcome, limitations, and completeness.

`stableAcrossExecution: true` is rejected whenever base and observed fingerprints differ, regardless of the claimed `complete` value, matching the SCI owner validator. The ablation additionally requires exact `git:<frozen commit>` snapshot/base/observed fingerprints and a complete successful receipt.

The accepted experimental producer request is exactly:

- one operation: `structural_search`;
- exactly one `seed:language` text seed;
- exactly one `seed:pattern` text seed; and
- zero or more other repository-relative path seeds.

Additional text seeds, symbol seeds, reserved seed ids with wrong kinds, missing required seeds, duplicate operations, or any other operation fail structural and fusion closed.

## Raw structural execution evidence

A closed `pi-context-packer.structural_evidence_execution_observation.v2` retains and hashes:

- exact raw request JSON and parsed equality with the validated request;
- exact raw receipt JSON and parsed equality with the validated receipt;
- exact stdout (the retained receipt JSON), empty stderr, and their raw hashes;
- raw process and target-state JSON matching the structured process/state fields;
- a raw transcript binding command plus every raw evidence hash;
- exact SCI/backend paths, versions, SCI revision, and artifact hashes;
- target clean/commit state, no index read/build, absent `.ontology`, process-group termination, exactly one receipt, and cleanup; and
- the whole observation digest bound to `receiptDigest`.

Exporter argv must be exactly:

```text
<pinned-sci> experimental structural-evidence-receipt --request-file <pinned-request-artifact>
```

The request artifact hash must equal the retained raw request hash. `--version`, alternate subcommands/flags, unrelated hashes, parsed-value mismatches, extra stdout, dirty state, unconfirmed termination, or incomplete cleanup make structural and fusion unavailable.

SCI/backend pins and observations remain external evidence, not signatures or authentication.

## Metrics and populations

Unavailable structural/fusion arms have null metrics and never fall back. Results report eligible/available/unavailable counts; each `paths ∩ treatment` population; and a separate true all-four eligible-and-available intersection. Both include explicit repository/case denominators, case ids, per-repository summaries, equal-repository macro, and treatment-minus-paths deltas. Unnecessary/omission quantities are normalized per case before equal-repository averaging.

A treatment is never compared over a silently different population. One repository's questions are not independent repository replications.

## Prepared-file-only reproduction

The runner verifies the caller-supplied SHA-256 of one prepared JSON file before parsing. It does not invoke source-list or SCI, inspect a target, index code, create `.ontology`, or discover candidates.

```bash
INPUT=prepared-source-selection-ablation-v2.json
HASH=$(sha256sum "$INPUT" | cut -d' ' -f1)
node scripts/run-source-selection-experiment.mjs \
  --input "$INPUT" \
  --input-sha256 "$HASH" \
  --output source-selection-ablation-results.json
```

The output must not exist. Retain the prepared input, raw artifacts/evidence, output, hashes, commits, pins, and review notes together. Changed input is a new experiment.

## Non-authorizations and limits

This protocol by itself authorizes no provider registration, production wiring, metadata campaign, source-list or SCI behavior change, owner invocation, indexing, `.ontology` creation, repository discovery, AK mutation, external mutation, merge, push, PR, authentication claim, or adoption decision. A concrete experiment run requires separate operator and AK/source-owner authority; that authority remains bounded to its frozen preparation, execution, evidence, and review artifacts.

The experiment remains a file-selection proxy. Metadata may be stale or benchmark-aware; contract completeness is not whole-program semantic accuracy; and metrics do not price latency, tokens, review, or maintenance. These limits preserve the conservative **REJECT** posture.
