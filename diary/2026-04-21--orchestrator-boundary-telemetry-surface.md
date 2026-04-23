---
summary: "Added repo-owned lower-plane boundary telemetry to pi-society-orchestrator so sqlite3/ak/rocs execution paths have useful local observability without depending on upstream vendor telemetry."
read_when:
  - "Reviewing how pi-society-orchestrator now exposes lower-plane command telemetry."
  - "Investigating orchestrator sqlite3/ak/rocs boundary latency or failures."
---

# 2026-04-21 — orchestrator boundary telemetry surface

## What changed
- Added session-local boundary telemetry capture to `packages/pi-society-orchestrator/src/runtime/boundaries.ts`.
- Instrumented both synchronous and async lower-plane execution helpers.
- Added command + tool surfaces:
  - `/runtime-boundary-telemetry`
  - `orchestrator_boundary_telemetry({ limit })`
- Extended `/runtime-status` so the shared runtime report includes a concise lower-plane telemetry summary, the latest failing boundary-event preview, and a pointer to the dedicated inspector command.
- Aligned the detailed orchestrator telemetry summary field names with the vault telemetry contract where semantically shared (`command_mix`, `latest_failure`, etc.).
- Added focused tests in:
  - `packages/pi-society-orchestrator/tests/nexus-boundaries.test.mjs`
  - `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
- Updated `packages/pi-society-orchestrator/README.md`.

## Why this changed
Unlike `pi-vault-client`, the orchestrator no longer owns a direct Dolt query path. So adding “Dolt telemetry” inside the orchestrator would have been misleading. The truthful repo-owned observability seam here is broader: lower-plane boundary execution telemetry for the command helpers the orchestrator really does use.

That gives useful local metrics for:
- sqlite3 diagnostic paths
- AK command paths
- ROCS command paths
- any future boundary command routed through the shared helpers

## Metrics captured
- command classification
- argument preview
- latency
- success/failure
- exit code when present
- recent event history

## Validation
```bash
cd packages/pi-society-orchestrator
node --test tests/nexus-boundaries.test.mjs tests/runtime-shared-paths.test.mjs
```

Result:
- pass
