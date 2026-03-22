---
summary: "Session log for AK task #243: bridge vault execution receipts and live trigger telemetry into the shared runtime registry without widening broader /vault runtime ownership."
read_when:
  - "Reviewing how pi-vault-client first exposed receipt and telemetry accessors through the shared runtime registry."
  - "Checking why this slice intentionally excluded broader prompt-template/runtime ownership registration."
system4d:
  container: "Repo-local diary capture for the receipt/telemetry runtime-registry bridge slice."
  compass: "Keep the bridge narrow, discoverable, and truthful to task scope."
  engine: "Claim task -> add scoped registry bridges -> validate package + root gates -> complete AK task."
  fog: "Main risk is accidentally folding prompt-template runtime ownership into the receipt/telemetry bridge and overlapping the next task."
---

# 2026-03-22 — Bridge vault receipts and live telemetry into the shared runtime registry

## What I changed
- Added `src/vaultRuntimeRegistry.ts` and generated `src/vaultRuntimeRegistry.js`
- Registered two `pi-vault-client` capability bridges in the shared global runtime registry:
  - `vault:receipts`
  - `vault:telemetry`
- Kept this slice intentionally narrow so it does **not** register broader template/runtime ownership
- Added `getLiveTriggerTelemetryStats()` to the picker runtime so telemetry can be exposed through the registry without leaking internal state
- Wired the bridge into `extensions/vault.ts` during extension startup
- Added regression coverage for the scoped bridge behavior and a focused runtime-registry integration test
- Added `@tryinget/pi-runtime-registry` as a local package dependency

## Scope decision
This task only bridges vault receipts and live trigger telemetry into the shared registry.
It deliberately does **not** register broader `/vault` template/runtime ownership, because that belongs to the separate runtime-ownership task.

## Validation
- `node --test tests/vault-runtime-registry.test.mjs tests/vault-query-regression.test.mjs` ✅
- `npm run typecheck` ✅
- `npm run check` ✅
- root `npm run quality:pre-commit` ✅
- root `npm run quality:pre-push` ✅ after diary frontmatter fix

## Notes
- The bridge registers under owner `pi-vault-client`
- Consumers can discover accessors by capability without importing vault-client internals directly
- The receipt and telemetry bridges are registered before schema-gated command/tool setup, keeping the bridge local and independent of widening `/vault` ownership

## Related
- AK task: #243 — Bridge vault receipts and live telemetry into the shared runtime registry without widening /vault ownership
