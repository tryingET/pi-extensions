---
summary: "Operator runbook for the bounded blinded snapshot-edit model screen."
read_when:
  - "Planning or executing the Phase 2 model screen."
  - "Reviewing the content-retention and fail-closed boundary."
system4d:
  container: "Consent-gated model-screen operator procedure."
  compass: "Keep the 30-call matrix blinded, bounded, and content-free."
  engine: "Dry-run plan -> explicit execute consent -> independent scoring -> aggregate only."
  fog: "Raw model content or incomplete usage would invalidate the screen."
---

# Blinded model screen runner

## Scope

`scripts/run-model-screen.mjs` implements the AK #3604 Phase 2 screening approximation. Its fixed matrix is exactly:

- two explicit models: `zai/glm-5.2` and `openai-codex/gpt-5.6-sol`;
- five protocols: A–E; and
- three hard workloads: `duplicate_targeting`, `repeated_block_targeting`, and `batched_edits`.

That is 30 calls. Other model sets and call caps are rejected rather than silently changing the experiment. This original `screening` suite remains the default.

A separate scale-crossover suite uses the same two models with protocols A and B across deterministic 20-, 100-, and 500-line duplicate-target files. Each generated file has two identical target lines at separated positions; the shared task intent names the second occurrence without supplying an oracle edit. Protocol A receives the complete numbered read and protocol B the complete raw read. This matrix is exactly 12 calls.

## Consent gate and dry run

A command without `--execute` prints the complete content-free plan and makes no model calls:

```bash
npm run model-screen -- \
  --model zai/glm-5.2 \
  --model openai-codex/gpt-5.6-sol \
  --max-calls 30 \
  --timeout-seconds 180
```

The 12-cell crossover can likewise be reviewed without execution:

```bash
npm run model-screen -- \
  --suite crossover \
  --model zai/glm-5.2 \
  --model openai-codex/gpt-5.6-sol \
  --max-calls 12
```

Only an operator-authorized invocation adding `--execute` may launch Pi. Before any provider call, execution refuses if either the suite aggregate or its suite-specific claim exists. It then exclusively creates the claim with `wx` and mode `0600`. The content-free claim records only the suite, selected models, expected cell keys/count, and `state: "running"`. This exact-once guard applies independently to screening and crossover.

A failed or interrupted run deliberately retains its running claim. There is no automatic retry, reset, or stale-claim recovery path. Deleting a claim to authorize a new attempt is a separate manual operator action requiring separate authorization; do not infer that authorization from the original execute consent.

The timeout is configurable per call with `--timeout-seconds` (default 180, range 1–3600). On expiry the runner signals the isolated Pi process group with `SIGTERM`, waits five seconds, then uses `SIGKILL` against that group even if its leader has already exited. The attempt settles with a controlled `timeout` only after this bounded escalation.

The runner invokes each cell using the arguments below, with the blinded prompt written to piped stdin and then stdin closed. The prompt is deliberately absent from process arguments and therefore from ordinary local argv/process listings. The child inherits the parent environment, including authorized provider credentials, while forcing `PI_SKIP_VERSION_CHECK=1` and `PI_TELEMETRY=0`. These settings disable incidental pi.dev version checks and telemetry; they do not disable or bypass the provider calls explicitly authorized by `--execute`.

```text
printf <blinded-prompt> | pi -p --no-tools --no-session --mode json \
  --no-extensions --no-skills --no-prompt-templates --no-context-files \
  --model provider/model --system-prompt <fixed-minimal-strict-JSON-system>
```

Removing prompt content from local argv does not control or make claims about provider-side processing, logging, or retention. Those remain governed by the selected provider and are outside this local runner's control. The implementation/test candidate must not run the execute form merely to validate code.

## Blinding and protocol C

Each workload has one task intent shared across all five protocols. A prompt contains only that protocol's instructions/schema and its initial read call/result. It never contains an oracle edit call, expected final bytes, competing protocol, fixture identifier, or prior response.

Protocol C is explicitly a **one-response screening approximation, not a real multi-turn tool loop**. The response must be:

```json
{"range":{"offset":1,"limit":3},"edit":{"path":"screen.txt","base":"amber","edits":[]}}
```

The shape above is illustrative only, not a valid workload answer. The scorer verifies that the selected range is in bounds and covers every submitted canonical coordinate target before independently simulating the edit.

## Scoring and retention

Pi JSONL is held in process memory only, capped at 2 MB per invocation. The scorer requires exactly one final assistant message, strict duplicate-key-free JSON, the exact normalized provider/model/API identity, and complete input/output/cache-read/cache-write/total usage. Reported cost is summed when present. Responses are independently applied with `executeProtocol`; their exact rendered bytes are compared with `applyCanonical` output.

Missing usage, ambiguous JSONL, model mismatch, invalid ranges, and simulator errors are failures. No raw output is accepted as evidence of correctness.

The durable execution artifacts are the suite claim plus `.autoresearch/model-screen-aggregate.json` for the default suite or `.autoresearch/model-screen-crossover-aggregate.json` for crossover. After all calls, the runner validates the exact expected plan: expected and observed counts, unique keys, no missing or extra cells, and exactly one attempt for every expected cell. The aggregate reports `matrixComplete`, `expectedCellCount`, `observedCellCount`, `usageComplete`, `observedTokenTotalsAreLowerBounds`, and `failedClosed`. An incomplete or even empty result set is written truthfully and fails closed rather than disappearing.

Cells contain model, protocol, workload, attempt/valid-JSON/correct counts, token sums, reported-cost sum/sample count, usage sample/completeness fields, and error-category counts. A process failure with no usage therefore cannot masquerade as exact zero-token evidence. Aggregates contain no prompts, source text, paths, expected calls, raw output, prose, timestamps, session/request/response IDs, or provider payloads. Aggregate publication uses a same-directory mode-`0600` temporary file, flushes it, and atomically hard-links it to the destination. Because link creation fails with `EEXIST`, a destination created at the publication boundary is never overwritten; the temporary name is removed on success and failure. Completed-claim updates use same-directory mode-`0600` temporary files and atomic rename, while the running claim itself is exclusively created at mode `0600`. Local raw/temp naming patterns are ignored as defense in depth.

## Validation

```bash
npm test
npm run check
```

Tests use fake Pi JSON streams and do not contact providers.
