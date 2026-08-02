---
summary: "Pi provider adapter for workstation inference with lifecycle-read-only text paths and scheduler-claimed one-shot audio dispatch."
read_when:
  - "Starting work in this package workspace."
  - "Wiring Pi to workstation baseline-text inference without giving Pi runtime authority."
system4d:
  container: "Monorepo package for a Pi-side provider over workstation-owned inference."
  compass: "Expose workstation inference to Pi while preserving lane-op as runtime authority."
  engine: "Read lane-op-exported contract -> register provider -> health-check read-only -> forward requests."
  fog: "Main risk is accidentally recreating a runtime control plane inside Pi."
---

# @tryinget/pi-workstation-inference-provider

Pi provider adapter for workstation-owned inference endpoints. Ordinary text/provider discovery remains lifecycle-read-only; the explicitly invoked audio path consumes one externally issued scheduler claim.

This package is intentionally **not** a llama.cpp manager. It does not download models, build
runtimes, start services, stop services, warm models, or decide promotion. Workstation `lane-op`
remains the runtime authority for baseline/canary/experiment state, GPU/coexistence gates, receipts,
and rollback.

The audio path is not globally read-only: it mutates only the externally owned scheduler claim through bounded `pre-effect`, `post-effect`, `complete`, or `quarantine` consumer operations. It cannot issue claims, reserve resources, start or stop runtimes, reconcile indeterminate outcomes, or authorize retries.

## What it does

- Reads a small lane-op/workstation-exported provider contract JSON.
- Registers a Pi provider, default id `workstation-inference`, with a provider-local API id `workstation-inference`.
- Delegates internally to Pi's OpenAI-compatible transport for workstation requests only, without owning the shared `openai-completions` transport.
- Maps contract models into Pi model entries.
- Performs read-only health checks before provider requests.
- Provides `/workstation-inference status` and `/workstation-inference contract`.
- Implements the Pi 0.83 one-shot Inkling `audio-send` payload membrane; it requires and consumes an exact externally issued scheduler handoff before one provider dispatch.

## What it must not do

- No model download/build/convert.
- No `llama-server` process ownership.
- No watchdog or runtime lease manager.
- No `lane-op apply/start/stop/switch/reserve/run/compare/report` calls.
- No canonical model/catalog authority inside Pi.

## Contract source

An explicit inline or path contract is loaded alone:

1. `PI_WORKSTATION_INFERENCE_CONTRACT_JSON` — inline JSON for tests/manual smoke.
2. `PI_WORKSTATION_INFERENCE_CONTRACT` — path to one contract JSON.

Without either override, the extension loads and merges distinct workstation-owned files by model id:

1. canonical baseline: `phasee/state/workstation-inference-provider.json`;
2. optional baseline canary: `phasee/state/workstation-inference-provider.canary.json`;
3. optional Inkling canary: `phasee/state/workstation-inference-provider.inkling-canary.json`.

The canonical default path is:

```text
~/ai-society/softwareco/infra/workstation/phasee/state/workstation-inference-provider.json
```

Example contract:

- [`examples/workstation-inference-provider.contract.example.json`](examples/workstation-inference-provider.contract.example.json)

Minimal shape:

```json
{
  "schema_version": 1,
  "authority": "workstation/lane-op",
  "family": "baseline-text",
  "surface": "canonical",
  "base_url": "http://127.0.0.1:1234/v1",
  "health_url": "http://127.0.0.1:1234/health",
  "models": [
    {
      "pi_model_id": "baseline-text",
      "name": "Baseline text (lane-op canonical)",
      "context_window": 131072,
      "max_tokens": 16384,
      "reasoning": true,
      "thinking_format": "qwen-chat-template"
    }
  ]
}
```

Contracts must use credential-free loopback HTTP and a recognized workstation authority. If a contract has `generated_at` plus `refresh_after_seconds` (or the legacy `stale_after_seconds`), `/workstation-inference status` reports the refresh warning. Ordinary runtime requests fail closed on missing/invalid/unhealthy contracts through the package's custom stream handler; audio is stricter and rejects stale contract authority.

Transport ownership membrane: this package must never register its custom `streamSimple` under shared built-in API ids such as `openai-completions`. Workstation models use `api: "workstation-inference"`; the stream handler then delegates internally to OpenAI-compatible transport after it has resolved the selected workstation contract and model.

Current workstation exporter command:

```bash
cd /home/tryinget/ai-society/softwareco/infra/workstation
python3 scripts/phasee/lane-op.py provider-contract baseline-text --surface canonical --write
python3 scripts/phasee/lane-op.py provider-contract inkling --surface canary --write
```

The exporter is a bounded write to `phasee/state/workstation-inference-provider.json`; runtime service lifecycle still belongs to lane-op's existing plan/apply surfaces.

## Commands

```text
/workstation-inference status
/workstation-inference refresh
/workstation-inference lane-status
/workstation-inference contract
/workstation-inference audio-send --handoff <claim.json> --scheduler-db <scheduler.sqlite3> <audio> -- <prompt>
/workstation-inference help
```

`status` reads the contract and probes the configured health URL. `refresh` explicitly asks workstation `lane-op` to rewrite canonical and baseline-canary contracts; it attempts the distinct Inkling export as an optional add-on that cannot block baseline recovery. `lane-status` delegates to read-only `lane-op status baseline-text --surface canonical`.

### Inkling audio input

The model is discoverable as `workstation-inference/inkling-small-iq2m-canary`. Invocation requires a fresh handoff created by the external scheduler owner; Pi cannot issue one:

```text
/workstation-inference audio-send \
  --handoff /private/one-turn-handoff.json \
  --scheduler-db /private/scheduler.sqlite3 \
  /absolute/or/relative/question.wav \
  -- What is the pupil asking?
```

**Current execution status:** implemented and claim-gated. Model visibility, a healthy endpoint, and a fresh contract are still not invocation authorization. Before reading audio, the extension validates that the bounded no-follow handoff binds exactly:

```text
workstation-capability-graph
-> inkling-tts-canary
-> inkling-small:0
-> workstation-inference/inkling-small-iq2m-canary
```

It then validates the contract-listed `wav`, `mp3`, or `flac` regular file. Immediately before creating the Pi turn, it invokes only the local-ai-control-plane consumer surface for one `pre-effect` consumption. The extension never invokes `external-claim`, reservation, release, reconciliation, retry, lifecycle, or model-load commands.

The adapter opens the final audio path without following a symlink, verifies format magic and owner-exported raw/encoded size bounds, and keeps bytes only in expiring process memory. A nonce identifies the exact user turn. Inside the provider transport, Pi's inherited payload hook runs first; final validation rejects tools or pre-existing audio and then replaces that nonce with exactly one llama.cpp `input_audio` block immediately before HTTP dispatch.

The audio turn sends no tools and forces provider retries to zero. A successful stream is withheld from terminal completion until `post-effect` revalidation and repository-issued causal completion succeed. The content-free completion result binds one dispatch, the exact handoff digest/attempt, provider/model, and completed stream; its private temporary file is removed immediately. A provider error or interrupted result is quarantined once as outcome unknown. If completion itself becomes indeterminate, Pi does not retry, quarantine, release, or reconcile automatically.

A second session attempt fails before another HTTP request because the one-shot pre-effect consumption and attachment are already consumed. Audio bytes/base64, prompt, transcript, and response content are not written to handoffs, scheduler results, contracts, or AK evidence.

This command never starts the Inkling canary. The external owner must first establish the fresh scheduler reservation/claim and start the runtime through its accepted owner path. Keep the handoff file available until the turn reaches completion or quarantine because each bounded consumer command revalidates it against the scheduler repository.

For the accepted Workbench design, `extensions/workstation-authority-channel.ts` provides the separate child-side authority membrane for `workbench-inkling-canary`; the legacy handoff path above deliberately rejects that profile so it cannot inherit Pi-side completion or quarantine authority. The broker-owned Pi child supplies its non-reconnectable inherited descriptor through `PI_WORKSTATION_INFERENCE_AUTHORITY_FD`, and the broker invokes `/workstation-inference workbench-audio-send <staged-wav> -- <prompt>`. The extension receives one exact `arm_turn`, verifies the staged audio digest, and sends `authorize_dispatch` only after final payload validation. A successful owner response is a distinct, exact `dispatch_permit` bound to the turn, provider/model, durable scheduler intent, and reservation/lease identity. The permit is valid for at most 1000 ms. The dedicated Workbench HTTP transport acquires one unpooled loopback connection without flushing headers or body. Only after the socket is connected does one synchronous write-boundary callback recheck the audio attachment, recheck both absolute and monotonic permit expiry, consume the permit, increment dispatch count, and call `request.end()` with the exact request bytes. Expiry while connection acquisition is pending destroys the connection with zero provider bytes; any failure after `request.end()` is ambiguous and never retried. It never calls the legacy scheduler consumer from this path.

Authority schema `workbench-inkling-authority/v2` and digest `b78278b0ae541b25274f930adf5c977b5a4df9742a7ebe38f129129966247421` are byte-aligned with the canonical local-ai-control-plane contract at commits `af506f0` and `45b12cf`. The package also pins broker schema digest `b1b50956002df6ed65fd7891ab4a218eedcc80970a678c3bbf1059ba87139fc5`. Arm and disposition use exact canonical echoes; authorization never accepts an echo and requires the canonical recomputable permit. Duplicate keys and any missing, malformed, mismatched, future-dated, expired, replayed, or lost frame permanently block further dispatch. Caller-supplied fetch transports are rejected on this governed path, and provider retries remain zero. The membrane exposes no scheduler path and no release, completion, reconciliation, retry, or quarantine operation. The governed transport accepts only the exact credential-free `http://127.0.0.1:<port>/v1/chat/completions` target, creates no pooled or redirecting alternate path, and marks a possible dispatch in the same connected-socket callback immediately before admitting bytes with `request.end()`. Hermetic tests hold a connected socket before that callback, cross permit expiry, and prove the provider receives zero bytes; installation, reload, profile activation, model invocation, and end-to-end runtime behavior remain separately owner-gated and are not claimed here.

These commands may call the workstation-owned `lane-op` CLI, but they do not start/stop/switch/warm services or apply lane changes. Runtime lifecycle remains behind lane-op's existing plan/apply surfaces.

## Runtime dependencies

This audio path requires Pi 0.83.x host payload callbacks. The package expects Pi host runtime APIs and declares them as peer dependencies:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-ai`

When using UI APIs (`ctx.ui`), guard interactive-only behavior with `ctx.hasUI` so `pi -p`
non-interactive runs stay stable.

## Package checks

Run from package directory:

```bash
npm install
npm run check
```

Run from monorepo root through the canonical package gate:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-workstation-inference-provider
```

### Provider module split

Provider registration/commands, contract loading, streaming, audio turns, scheduler parsing,
inherited authority, and governed HTTP transport are split into bounded modules. The unchanged
`workstation-scheduler-json.ts` scanner remains the sole exact-lexeme handoff canonicalizer.

## Live package activation

Install the package into Pi from the package directory containing this package's `package.json`:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-workstation-inference-provider
```

Then in Pi:

1. run `/reload`
2. run `/workstation-inference status`
3. select a `workstation-inference/...` model only after the contract is healthy

## Copier lifecycle policy

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo.
- After recopy, re-apply local deltas intentionally and run `npm run check`.
