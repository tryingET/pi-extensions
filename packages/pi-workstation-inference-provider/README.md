---
summary: "Read-only Pi provider adapter for workstation lane-op inference endpoints."
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

Read-only Pi provider adapter for workstation-owned inference endpoints.

This package is intentionally **not** a llama.cpp manager. It does not download models, build
runtimes, start services, stop services, warm models, or decide promotion. Workstation `lane-op`
remains the runtime authority for baseline/canary/experiment state, GPU/coexistence gates, receipts,
and rollback.

## What it does

- Reads a small lane-op/workstation-exported provider contract JSON.
- Registers an OpenAI-compatible Pi provider, default id `workstation-inference`.
- Maps contract models into Pi model entries.
- Performs read-only health checks before provider requests.
- Provides `/workstation-inference status` and `/workstation-inference contract`.

## What it must not do

- No model download/build/convert.
- No `llama-server` process ownership.
- No watchdog or runtime lease manager.
- No `lane-op apply/start/stop/switch/reserve/run/compare/report` calls.
- No canonical model/catalog authority inside Pi.

## Contract source

The extension loads the first available contract source:

1. `PI_WORKSTATION_INFERENCE_CONTRACT_JSON` — inline JSON for tests/manual smoke.
2. `PI_WORKSTATION_INFERENCE_CONTRACT` — path to the contract JSON.
3. Default path:

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

If the contract has `generated_at` plus `stale_after_seconds`, stale contracts fail closed.

Current workstation exporter command:

```bash
cd /home/tryinget/ai-society/softwareco/infra/workstation
python3 scripts/phasee/lane-op.py provider-contract baseline-text --surface canonical --write
```

The exporter is a bounded write to `phasee/state/workstation-inference-provider.json`; runtime service lifecycle still belongs to lane-op's existing plan/apply surfaces.

## Commands

```text
/workstation-inference status
/workstation-inference contract
/workstation-inference help
```

`status` reads the contract and probes the configured health URL. It is intentionally read-only.

## Runtime dependencies

This package expects Pi host runtime APIs and declares them as peer dependencies:

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-ai`

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
