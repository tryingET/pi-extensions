---
summary: "Stopped Prompt Vault Dolt subprocesses from leaking zero-byte UUID temp files by synthesizing metrics-disabled Dolt HOME state, then added repo-owned Dolt execution telemetry for useful local observability." 
read_when:
  - "Investigating /tmp inode exhaustion caused by Prompt Vault or orchestrator Dolt queries."
  - "Reviewing why Dolt child environments now write a synthetic HOME under the chosen temp dir."
---

# 2026-04-21 — Dolt metrics-disabled temp home for vault surfaces

## What changed
- Updated `packages/pi-vault-client/src/vaultDb.ts` so every Dolt child process now:
  - keeps the existing temp-dir contract (`PI_VAULT_TMPDIR`, `VAULT_DIR/.dolt/tmp`, `VAULT_DIR/.tmp`, `os.tmpdir()`)
  - synthesizes a temp-scoped `HOME/.dolt/config_global.json`
  - overlays `metrics.disabled=true`
  - preserves host-global string config such as `user.name` / `user.email`
  - copies local version-check marker files when present
  - records repo-owned Dolt execution telemetry (command class, temp source, latency, success/failure, recent event preview)
- Updated `packages/pi-society-orchestrator/src/runtime/boundaries.ts` so raw Dolt metadata queries also use the same kind of metrics-disabled Dolt child environment instead of plain inherited env.
- Added operator surfaces for the new repo-owned metrics:
  - `/vault-dolt-telemetry`
  - `vault_dolt_telemetry({ limit })`
- Extended the Dolt telemetry summary so it also reports the latest failing Dolt event preview instead of only aggregate counts + recent history.
- Aligned the shared summary field names with the orchestrator boundary telemetry contract where truthful (`command_mix`, `latest_failure`, etc.), while preserving the Dolt-specific `temp_source_mix` field.
- Added focused regression tests in:
  - `packages/pi-vault-client/tests/vault-dolt-integration.test.mjs`
  - `packages/pi-society-orchestrator/tests/nexus-boundaries.test.mjs`
- Updated the `pi-vault-client` README Dolt temp-dir contract notes.

## Why this changed
Live tracing on the workstation showed that new top-level `/tmp/<uuid>` zero-byte files were being created by transient Dolt subprocesses, especially `/usr/bin/dolt send-metrics`, triggered by Prompt Vault and orchestrator queries.

The package-level temp-dir routing already kept ordinary Dolt scratch under repo-local temp dirs, but the metrics subprocess still leaked UUID files into `/tmp` and could exhaust tmpfs inodes over time.

## Resulting contract
Prompt Vault / orchestrator Dolt child processes should now stop spawning metrics uploads from the inherited machine-global Dolt state and instead run with a synthetic temp-scoped Dolt home that has metrics explicitly disabled.

This avoids a machine-global config mutation while still preserving commit identity fields needed for local Dolt commits.

At the same time, we now keep repo-owned observability for Dolt usage instead of depending on upstream Dolt telemetry. The useful local metrics are the ones we actually need for runtime operation: command mix, latency, temp-source usage, and failure history.

## Validation
```bash
cd packages/pi-vault-client
npm run build:runtime
node --test tests/vault-dolt-integration.test.mjs

cd ../pi-society-orchestrator
node --test tests/nexus-boundaries.test.mjs
```

Result:
- pass
