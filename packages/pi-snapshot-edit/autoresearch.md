---
summary: "Deterministic protocol-token benchmark and model-trial plan for snapshot editing."
read_when:
  - "Comparing model-visible file-read and edit protocol encodings."
  - "Running pi-snapshot-edit autoresearch."
system4d:
  container: "A deterministic Phase 1 protocol benchmark plus a Phase 2 model-trial plan."
  compass: "Compare cost only after every protocol passes the correctness gate."
  engine: "Generate envelopes -> tokenize -> simulate -> aggregate content-free."
  fog: "Exact encoding counts do not establish provider usage or model success rates."
---

# Snapshot edit protocol autoresearch

## Confrontation: MANY OF THE GREATS

This benchmark preserves five competing schools rather than assuming the package's current protocol wins:

| ID | School | Model-visible contract |
| --- | --- | --- |
| A | Explicit coordinates | The live snapshot protocol, represented here with `revision:amber`, fully numbered `N│text` output, and snapshot-bound ranges. `insert_after` uses `startLine`; deletion is `replace` with empty `newText`. |
| B | Raw/exact occurrence | A raw snapshot read; mutation selects exact text, omitting `occurrence` only when unique and requiring it when duplicates exist. |
| C | Two-stage adaptive read | A raw snapshot read followed by a separate numbered range-read tool call and result around the target; mutation then uses snapshot-bound coordinates. |
| D | Hashline identity | Each displayed line receives a compact snapshot-derived hash ID; mutations select unique IDs rather than line numbers or copied text. |
| E | Patch/context | A raw snapshot read followed by a snapshot-bound patch in the benchmark's narrow validated hunk grammar. |

Correctness is a hard gate: a cheaper envelope that changes the wrong target, produces the wrong output, accepts stale state, or accepts malformed selectors is a failed protocol, not a token win.

## Phase 1: deterministic encoding benchmark

Run:

```bash
./autoresearch.sh
./autoresearch.checks.sh
```

The harness uses locally installed `js-tiktoken@1.0.21` with `o200k_base`. Phase 1 measures only the encoding cost of **oracle-authored, canonical-correct transcripts for every protocol, including C**. For each protocol and case it serializes one canonical compact-JSON envelope containing:

1. an explicit `oracle-authored canonical-correct transcript cost` benchmark-semantics marker;
2. that protocol's instructions;
3. that protocol's tool schemas; and
4. ordered, separate `tool_call` and `tool_result` events.

The oracle supplies the correct target and call; Phase 1 does not measure model selection, selector discovery, model usability, or information leakage. Protocol C's oracle-authored range request and range result are explicit second events; no numbered reread is hidden inside the first result. The envelope also includes the canonical edit request and its success or stale-error result. The reported `o200k_base` value is exactly the encoding count of this serialized envelope only. It is **not** provider-reported input, output, cache, total-token, billing, or context-window usage.

Every Phase 1 protocol uses the same representative one-word base alias, `amber`, so alias spelling cannot skew the comparison. Live collision handling may issue suffixed variants; suffix variants and their frequency are runtime concerns outside Phase 1.

All protocols receive the same in-code fixture corpus: ordinary read-only, unique replacement, duplicate-line targeting, repeated-block targeting, blank lines, insertion, deletion, batched edits, and stale-base rejection. Adversarial checks reject ambiguous occurrence selectors, invalid coordinate ranges and operations, hash-ID collisions and reversed ranges, malformed patch headers/counts/context, wrong bases, wrong targets, and wrong outputs.

Protocol E deliberately implements only this documented grammar, not general unified diff:

- one or more hunk headers exactly matching `@@ -start,count +start,count @@`;
- the old and new start must match and be positive;
- every body row starts with exactly one of space (context), `-` (removal), or `+` (addition);
- header counts must equal body consumption/production;
- each hunk contains exactly one contiguous change group (context may surround it but cannot separate multiple change groups);
- context and removals must equal the base text; and
- resulting target ranges must be valid and non-overlapping.

File headers and other patch syntax are rejected.

The primary metric is the mean envelope tokens across the seven successful mutation **cases** for protocol A. Its denominator is cases, not individual edit operations (the batched case remains one case):

```text
METRIC tokens_per_correct_mutation_case=<number>
```

The durable result is [`.autoresearch/protocol-token-aggregate.json`](.autoresearch/protocol-token-aggregate.json). It contains only tokenizer identity/scope, envelope description, counts, token aggregates, and workload-class labels—never fixture source text, fixture IDs, paths, envelope bodies, timestamps, or session identifiers. Exact envelopes remain ephemeral in-process values.

## Phase 2: actual model selection trials

Deterministic oracle-transcript encoding costs are Phase 1, not a substitute for model success or provider usage data. Phase 2 measures actual model selection: the model must choose and emit the selector/edit call. Run blinded, repeated trials through the actual Pi prompt path:

```bash
pi -p --no-tools --mode json
```

For each protocol and fixture, provide the same task intent and only that protocol's model-visible read interaction, ask the model to produce the edit call, then independently simulate and score it. Randomize protocol order and repeat across the selected model set. Do not permit a model to see fixture IDs, expected output, competing encodings, or earlier attempts.

The Phase 2 collector should extract Pi JSON usage fields (input, output, cache, and total tokens when supplied by the provider) and aggregate them content-free by protocol, workload class, model identity, correctness outcome, and stale-rejection outcome. Persist no prompts, fixture source, paths, model prose, raw calls, session IDs, or provider request IDs in the aggregate. Report success confidence intervals and tokens per correct mutation case; retain correctness as the gate before comparing cost.

Phase 2 is intentionally not automated here because model/provider selection, trial budget, and external-call consent belong to the controller/operator. A future runner must fail closed when usage fields are absent or when an emitted edit cannot be simulated unambiguously.
