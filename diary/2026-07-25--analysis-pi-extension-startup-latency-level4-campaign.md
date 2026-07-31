---
summary: "Measured Pi extension startup latency, created AK-4140 Level-4 matrix campaign, and verified the first isolated vault candidate."
read_when:
  - "Reviewing startup-latency evidence or continuing AK task 4140."
type: "diary"
---

# 2026-07-25 — Pi extension startup latency Level-4 campaign

## What happened

- Restored this checkout's local Git worktree interpretation from an accidental `core.bare=true` state; the previously hidden parent worktree is heavily dirty with unrelated operator changes, which were not absorbed.
- Created and claimed AK task `4140` with bounded scope, then explicitly removed `packages/pi-toolbox-discovery/**` from active authority after another controller requested that owner lane.
- Calibrated startup with a no-model graceful-shutdown probe and `PI_TIMING=1`.
- Created the startup benchmark/check harness and a 2×2 scenario × hypothesis campaign.
- Configured `pi-autoresearch`, recorded a full-set RPC baseline, prepared the Level-4 runner, and launched one owner-admitted visible candidate lane.
- Candidate-admission policy allows one active admission, so the 2×2 matrix remains active/incomplete rather than falsely reported as fully executed.

## Main diagnosis

Current full extension startup is about `3.2 s` in RPC/UI-capable mode versus about `0.55 s` without extensions. About `1.9 s` is serial extension module import/factory time.

Largest calibrated entrypoints:

- `pi-interaction/input-triggers.ts`: about `475–481 ms`;
- `pi-vault-client/vault.js`: about `470–478 ms`;
- third-party `pi-sub-core` + `pi-sub-bar`: about `450 ms` combined.

The host serially imports enabled entrypoints through fresh Jiti instances with `moduleCache: false`, then awaits each factory. Toolbox activation can reduce provider tool-schema load, but it cannot reduce startup when owner entrypoints eagerly import/construct their full implementation.

## First candidate

- peer: `candidatepeer-mrzpur03-40e7f9b9`
- branch: `candidatepeer/ar-4140-candidate-01-0281ddb7`
- commit: `b97550c3d87fd3ea6e235c81e5aa966ddfa3c4f2`
- changed scope: nine `packages/pi-vault-client/**` files only
- intervention: registration-only factory plus lazy schema/read work on explicit vault use

Autoresearch vault-only segment:

- base baseline: `1432 ms` median;
- candidate replicate 1: `597 ms` median;
- candidate replicate 2: `618 ms` median;
- decision: `threshold_satisfied`;
- noise band: `±71.6 ms`;
- confidence: `39.76×`.

Controller validation passed `NODE_OPTIONS=--preserve-symlinks npm --prefix packages/pi-vault-client run check` with 251 passing tests and package/release gates.

## Boundaries / next step

The candidate remains isolated and unpromoted. Do not claim live behavior yet. Review the diff, then either request the exact finalizer/promotion path or continue the remaining matrix cells after lifecycle-v2 closeout frees candidate-admission capacity. Live install, `/reload`, and real vault command/tool dogfood remain separate proof tiers.
