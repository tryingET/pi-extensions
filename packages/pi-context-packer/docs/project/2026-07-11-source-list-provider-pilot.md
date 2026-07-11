---
summary: "Bounded cross-repository pilot deciding whether source-list merits automatic context-packer adoption."
read_when:
  - "Evaluating source-list as a pi-context-packer provider or revisiting automatic source inventory wiring."
  - "Comparing path-only, authored-purpose metadata, and SCI-assisted source selection evidence."
type: "evidence"
system4d:
  container: "Bounded adoption evidence for a candidate context-packer source inventory provider."
  compass: "Prefer measured selection value over provider breadth or metadata promotion."
  engine: "Freeze questions and truth -> compare identical candidate arms -> report coverage and omissions -> decide before wiring."
  fog: "Metadata coverage or deterministic output can be mistaken for automatic-provider usefulness."
---

# Source-list automatic-provider pilot — 2026-07-11

## Decision

**REJECT automatic provider adoption now.** Do not implement or register a `source-list` adapter in `pi-context-packer` from this evidence.

The deterministic pilot found a small improvement only in `agent-scripts`, the sole repository with metadata coverage: mean correct-target precision across its two cases rose from `0.25` to `0.50`, unnecessary selections fell from three to two, and one correct implementation file moved from second to first. Metadata did not recover the focused test target in either `agent-scripts` case. The other two repositories had zero valid metadata and therefore provide **no positive metadata evidence**. Across all six cases, macro precision moved only from `0.3333` to `0.4167` and unnecessary selections from 11 to 10. These six deterministic selection cases are qualitative/product-direction evidence, not a statistically meaningful benchmark.

Reconsider only after all of these conditions hold:

1. at least three independently owned, representative repositories each have at least 60% `present` metadata coverage without a workspace mandate;
2. a preregistered repeated evaluation has at least 10 maintenance questions per eligible repository, target truth fixed before ranking, and paths-only/source-list evaluators receive identical questions and candidate sets;
3. metadata assistance improves macro correct-target precision by at least 0.10 and reduces unnecessary-read proxy by at least 20% without increasing target omissions;
4. authored metadata staleness is sampled and reported, and zero/near-zero-coverage repositories remain non-evidence rather than being pooled as successes;
5. SCI structural comparison is run separately wherever its read-only safety and executable identity are proven, without letting source-list absorb SCI semantics; and
6. an independent review still concludes that automatic invocation is worth its subprocess, context, trust, and maintenance cost versus caller-requested/manual use.

A future result that clears those conditions should open a new scoped adoption task. This task authorizes neither production wiring nor source metadata changes.

## Boundary and question

Pilot question:

> Does automatic source-list metadata intake select correct implementation/test targets more precisely than the same Git-tracked paths alone, enough to justify a default context-packer provider call?

Owner boundaries were held constant:

- `source-list` supplied factual Git-tracked candidates and optional authored `summary` / `read_when` prose;
- `pi-context-packer` owned the deterministic task selection, cut-off, and evaluation budget;
- SCI remained the owner of structural/symbol intelligence;
- authored metadata was treated as untrusted descriptive evidence, not authority or mandatory scope;
- no source file, adapter, provider registry, package manifest, AK state, or parent checkout was mutated.

This pilot evaluates selection before wiring. It does not evaluate metadata authoring policy and does not propose one.

## Repository sample

All three repositories were clean at their recorded commits when inventories were generated.

| Repository | Selection reason | Commit | Supported candidates | `present` | Coverage | Evidence posture |
|---|---|---:|---:|---:|---:|---|
| `agent-scripts` | Required high-coverage source owner and source-list v1 implementation repo | `00142cd6c7067bac678ce22167a67449523b31ee` | 43 | 43 | 100% | eligible metadata evidence |
| `pi-extensions` | Required owner of `pi-context-packer`; package subset is reported separately | `cdb4207e549f58c3ab9c36a3d1579f963a21d1a8` | 957 | 0 | 0% | non-evidence for metadata benefit |
| `engineering-core` | Deterministic extra-repo criterion: lexicographically first non-hidden sibling Git repo under `/home/tryinget/ai-society/core`, excluding `agent-scripts`, with at least 20 supported source-list candidates | `af9e1d4ed6dcdc313520fb3a6c4484f6274185fb` | 32 | 0 | 0% | non-evidence for metadata benefit |

The `packages/pi-context-packer/` subset had 31 candidates: 0 `present`, 31 `absent`. Its known negligible coverage is therefore explicit rather than counted as successful augmentation.

Untracked files are outside source-list v1 by contract. No repository had source-list `invalid`, `unreadable`, or `not_applicable` items in these snapshots.

## Evaluator contract

The comparison used one deterministic evaluator rather than variable model sessions. This isolates the metadata field's contribution and is reproducible from the recorded snapshots and script, but it does not model semantic reasoning or end-to-end task completion.

For each case:

1. The evaluator receives the identical task question and identical source-list `items` candidate array.
2. It lowercases and tokenizes ASCII alphanumerics, removes tokens shorter than three characters and this fixed stop set: `and,the,a,an,to,for,its,with,change,focused,test,tests,behavior`.
3. **Paths-only score:** two points for each distinct query token that is an exact normalized path token.
4. **Metadata-assisted score:** paths-only score plus one point for each distinct query token in `summary` plus `readWhen`.
5. Candidates sort by descending score, then UTF-8 path byte order.
6. Selection budget `K` equals the target-truth set size fixed before evaluator scoring for that case. No evaluator sees source contents, imports, or the truth set while scoring. This run has no independent preregistration receipt; future reconsideration requires one.
7. Precision is `correct selected / K`; recall is `correct selected / truth count` (equal here because `K` equals truth count).
8. Every selected candidate is treated as a packet-read proxy. Thus unnecessary-read proxy equals unnecessary selections. Actual source-content reads by the evaluator are zero.

This is intentionally a weak lexical baseline. It can expose whether authored purpose text disambiguates paths, but it cannot establish whether an agent would complete a change correctly.

## Target truth basis and prompts

Target sets were fixed from direct imports/consumers, focused assertions, or exact symbol ownership before evaluator scoring:

| ID | Repository | Identical question supplied to both arms | Target truth basis |
|---|---|---|---|
| A1 | agent-scripts | `Change compact docs-list JSON payload serializer and focused tests.` | `tests/docs-list.test.mjs` imports `buildCompactPathsPayload` from `scripts/lib/docs-list-output.mjs` and contains serializer/schema assertions. |
| A2 | agent-scripts | `Change Git branch and provenance notes push partial-effect recovery and focused tests.` | `scripts/git-push-with-notes.sh` owns branch/notes ordering and recovery; `tests/git-notes.test.mjs` has exact partial/indeterminate recovery cases. |
| P1 | pi-extensions | `Change context pack provider capability execution summary and focused tests.` | `provider-capabilities.js` defines `buildContextPackExecutionSummary`; `context-plan.js` consumes it; `context-plan.test.js` and `tool-result.test.js` assert execution-summary behavior and projection. |
| P2 | pi-extensions | `Change context pack structured docs-list discovery intake and focused tests.` | `docs-provider.js` owns discovery, `context-pack.js` consumes it, and `context-pack.test.js` contains structured intake coverage. |
| E1 | engineering-core | `Change adoption scan repository budget behavior and focused tests.` | `adoption_scan.py` defines the scan/budget behavior and `test_adoption_scan.py` directly imports and tests it. |
| E2 | engineering-core | `Change evidence reconciliation behavior and focused tests.` | `evidence_reconcile.py` defines reconciliation and `test_evidence_reconcile.py` directly imports/tests it. |

## Results

Ordered selections below are the complete `K`-bounded outputs. A dagger (`†`) marks a target-truth hit. Every non-dagger selection is both an unnecessary selection and an unnecessary-read proxy. `Omitted` names target files excluded by the cut-off.

| ID | Arm | Ordered selection | Precision | Unnecessary/read proxy | Omitted target count |
|---|---|---|---:|---:|---:|
| A1 | paths | `scripts/docs-list.mjs`; `scripts/lib/docs-list-inventory.mjs` | 0.00 | 2 | 2 |
| A1 | metadata | `scripts/lib/docs-list-output.mjs`†; `scripts/docs-list.mjs` | 0.50 | 1 | 1 |
| A2 | paths | `scripts/git-notes-push.sh`; `scripts/git-push-with-notes.sh`† | 0.50 | 1 | 1 |
| A2 | metadata | `scripts/git-push-with-notes.sh`†; `scripts/git-notes-push.sh` | 0.50 | 1 | 1 |
| P1 | paths | `extensions/context-pack.ts`; `src/context-pack-result.js`; `src/context-pack.js`; `src/docs-provider.js` (all under `packages/pi-context-packer/`) | 0.00 | 4 | 4 |
| P1 | metadata | identical to paths (coverage 0%) | 0.00 | 4 | 4 |
| P2 | paths | `packages/pi-context-overlay/scripts/docs-list.sh`; `packages/pi-context-packer/scripts/docs-list.sh`; `packages/pi-context-packer/scripts/dogfood-docs-list-json-smoke.mjs` | 0.00 | 3 | 3 |
| P2 | metadata | identical to paths (coverage 0%) | 0.00 | 3 | 3 |
| E1 | paths | `src/engineering_core/adoption_scan.py`†; `tests/test_adoption_scan.py`† | 1.00 | 0 | 0 |
| E1 | metadata | identical to paths (coverage 0%) | 1.00 | 0 | 0 |
| E2 | paths | `scripts/dogfood-evidence-reconcile.py`; `src/engineering_core/evidence_reconcile.py`† | 0.50 | 1 | 1 |
| E2 | metadata | identical to paths (coverage 0%) | 0.50 | 1 | 1 |

Omitted targets by case:

- A1 paths: `scripts/lib/docs-list-output.mjs`, `tests/docs-list.test.mjs`; metadata: `tests/docs-list.test.mjs`.
- A2 both arms: `tests/git-notes.test.mjs`.
- P1 both arms: all four declared targets.
- P2 both arms: all three declared targets.
- E1: none.
- E2 both arms: `tests/test_evidence_reconcile.py`.

Aggregate summaries:

| Slice | Paths precision/recall | Metadata precision/recall | Paths unnecessary/read proxy | Metadata unnecessary/read proxy |
|---|---:|---:|---:|---:|
| agent-scripts only (2 cases) | 0.25 | 0.50 | 3 | 2 |
| all six cases, macro | 0.3333 | 0.4167 | 11 | 10 |

The all-repository delta must not be presented as broad positive evidence: four cases came from repositories with zero metadata, so those arms were mechanically identical. The eligible evidence is the two-case `agent-scripts` slice: one precision improvement and one ordering-only improvement, with both cases still omitting the focused test target.

## SCI comparison posture

SCI was not scored. The runtime had no executable at any context-packer fixed trusted path:

```text
/usr/local/bin/sci
/usr/bin/sci
/bin/sci
/usr/local/bin/semantic-code-intelligence
/usr/bin/semantic-code-intelligence
/bin/semantic-code-intelligence
```

No tested repository contained `.ontology`, but artifact absence alone does not prove executable read-only safety. The package contract requires both explicit read-only confirmation and a trusted executable, then runs only seeded code in a temporary sandbox. Supplying an ad hoc executable override or broad indexing solely to complete this table would weaken the safety comparison. The truthful result is therefore **SCI unavailable / not evidence**, not a zero score and not a source-list win.

A reconsideration pilot should add an SCI arm only after those preconditions are independently proven. It must use the same questions and truth sets, report sandbox/artifact receipts, and keep SCI results separate because SCI provides structural intelligence rather than authored-purpose metadata.

## Reproduction

Run with Python 3, Node.js, `jq`, and clean checkouts at the three exact commits. Set these three paths for the local layout; `source-list` is invoked from the recorded `agent-scripts` commit. The assertions fail before inventory generation on commit or dirty-state drift:

```bash
AS=/home/tryinget/ai-society/core/agent-scripts
PE=/home/tryinget/ai-society/softwareco/owned/pi-extensions
EC=/home/tryinget/ai-society/core/engineering-core

test "$(git -C "$AS" rev-parse HEAD)" = 00142cd6c7067bac678ce22167a67449523b31ee
test "$(git -C "$PE" rev-parse HEAD)" = cdb4207e549f58c3ab9c36a3d1579f963a21d1a8
test "$(git -C "$EC" rev-parse HEAD)" = af9e1d4ed6dcdc313520fb3a6c4484f6274185fb
test -z "$(git -C "$AS" status --porcelain)"
test -z "$(git -C "$PE" status --porcelain)"
test -z "$(git -C "$EC" status --porcelain)"

SL="$AS/scripts/source-list.mjs"
node "$SL" --repo "$AS" --full-list --json > /tmp/sl-agent-scripts.json
node "$SL" --repo "$PE" --full-list --json > /tmp/sl-pi-extensions.json
node "$SL" --repo "$EC" --full-list --json > /tmp/sl-engineering-core.json
jq '{totalCount,returnedCount,statuses:([.items[].metadataStatus]|group_by(.)|map({key:.[0],value:length})|from_entries)}' /tmp/sl-*.json
jq '[.items[]|select(.path|startswith("packages/pi-context-packer/"))]|{total:length,present:map(select(.metadataStatus=="present"))|length,absent:map(select(.metadataStatus=="absent"))|length}' /tmp/sl-pi-extensions.json
```

Inventory SHA-256 receipts from this run:

```text
ffd945069a3f00939127257551cab509bf2cef0c446e492c6b16d097435493f1  /tmp/sl-agent-scripts.json
058ba72e496de23ff575734586cefbb1b41cf78bdc977c2d9bd2357291448c60  /tmp/sl-pi-extensions.json
d29c9ccdcb8edcf85b557bf98db08947bc73dae090e9ad62b1ae5a0f3af3930a  /tmp/sl-engineering-core.json
```

Save and run this evaluator as `/tmp/source-list-pilot-eval.py`; its JSONL output SHA-256 for the recorded inputs was `fc35ec8b34b34069de68d17985384f61d8f0e27a91007827f2da44b626537c2c`:

```python
import json, re

STOP = {"and", "the", "a", "an", "to", "for", "its", "with", "change", "focused", "test", "tests", "behavior"}
CASES = [
    ("/tmp/sl-agent-scripts.json", "A1", "Change compact docs-list JSON payload serializer and focused tests.", ["scripts/lib/docs-list-output.mjs", "tests/docs-list.test.mjs"]),
    ("/tmp/sl-agent-scripts.json", "A2", "Change Git branch and provenance notes push partial-effect recovery and focused tests.", ["scripts/git-push-with-notes.sh", "tests/git-notes.test.mjs"]),
    ("/tmp/sl-pi-extensions.json", "P1", "Change context pack provider capability execution summary and focused tests.", ["packages/pi-context-packer/src/provider-capabilities.js", "packages/pi-context-packer/src/context-plan.js", "packages/pi-context-packer/tests/context-plan.test.js", "packages/pi-context-packer/tests/tool-result.test.js"]),
    ("/tmp/sl-pi-extensions.json", "P2", "Change context pack structured docs-list discovery intake and focused tests.", ["packages/pi-context-packer/src/docs-provider.js", "packages/pi-context-packer/src/context-pack.js", "packages/pi-context-packer/tests/context-pack.test.js"]),
    ("/tmp/sl-engineering-core.json", "E1", "Change adoption scan repository budget behavior and focused tests.", ["src/engineering_core/adoption_scan.py", "tests/test_adoption_scan.py"]),
    ("/tmp/sl-engineering-core.json", "E2", "Change evidence reconciliation behavior and focused tests.", ["src/engineering_core/evidence_reconcile.py", "tests/test_evidence_reconcile.py"]),
]

def tokens(text):
    return sorted({token for token in re.findall(r"[a-z0-9]+", text.lower()) if len(token) >= 3 and token not in STOP})

def score(text, query_tokens):
    words = set(re.findall(r"[a-z0-9]+", text.lower()))
    return sum(token in words for token in query_tokens)

def evaluate(document, question, truth, use_metadata):
    query_tokens = tokens(question)
    rows = []
    for item in document["items"]:
        path_score = score(item["path"], query_tokens) * 2
        metadata_text = " ".join([item.get("summary") or "", *item.get("readWhen", [])])
        metadata_score = score(metadata_text, query_tokens) if use_metadata else 0
        rows.append((-(path_score + metadata_score), item["path"], path_score, metadata_score))
    rows.sort(key=lambda row: (row[0], row[1].encode()))
    selected = [row[1] for row in rows[:len(truth)]]
    hits = [path for path in selected if path in truth]
    return {
        "selected": selected,
        "precision": len(hits) / len(selected),
        "recall": len(hits) / len(truth),
        "unnecessary": [path for path in selected if path not in truth],
        "omitted_truth": [path for path in truth if path not in selected],
        "scores": [{"path": row[1], "pathScore": row[2], "metadataScore": row[3]} for row in rows[:len(truth)]],
    }

for inventory, case_id, question, truth in CASES:
    with open(inventory, encoding="utf-8") as handle:
        document = json.load(handle)
    print(json.dumps({
        "case": case_id,
        "question": question,
        "truth": truth,
        "paths": evaluate(document, question, truth, False),
        "metadata": evaluate(document, question, truth, True),
    }, separators=(",", ":")))
```

```bash
python3 /tmp/source-list-pilot-eval.py | tee /tmp/source-list-pilot-results.jsonl
sha256sum /tmp/sl-agent-scripts.json /tmp/sl-pi-extensions.json /tmp/sl-engineering-core.json /tmp/source-list-pilot-results.jsonl
```

## Interpretation limits

- Six cases across three repositories are too small and too deliberately focused for inference about general task success.
- Only two cases had nonzero metadata coverage; only those can measure metadata augmentation.
- Target truth is file-selection truth, not proof that no transitive file could ever be useful during implementation.
- The lexical evaluator is reproducible but weaker than an agent. It penalizes ambiguous naming and cannot inspect imports or symbols.
- Setting `K` to target-set size makes precision/recall comparable but does not test adaptive packet budgets.
- The unnecessary-read measure is a proxy assuming every selected candidate would be read. The evaluator itself read no source contents.
- Metadata freshness was not independently audited in this pilot; source-list v1 does not prove freshness.
- SCI was unavailable under the package's actual trusted-executable/read-only gate, so no structural arm exists.
- Source-list subprocess latency and packet token overhead were not benchmarked because selection quality failed the adoption threshold first.
- The pilot compares automatic metadata-assisted ranking with paths-only ranking; it does not measure the usefulness or cost of a human/agent manually requesting source-list. Manual use is retained as an available fallback, not proven superior by this experiment.

These limits favor a conservative no-wire decision. Manual, caller-requested source-list use remains available at its source owner; rejection here applies only to automatic provider adoption in `pi-context-packer`.
