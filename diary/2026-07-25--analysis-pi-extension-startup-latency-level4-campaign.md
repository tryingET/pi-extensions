---
summary: "AK-4140 startup-latency campaign: Vault candidate accepted/integrated/cleaned, fresh RPC dogfood passed, target unmet, interaction residual split to AK-4362."
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
- Candidate-admission policy allowed one active admission, so the 2×2 matrix was initially stopped after one verified cell rather than falsely reported as fully executed.

## Main diagnosis

The initial 2026-07-25 full extension startup was about `3.2 s` in RPC/UI-capable mode versus about `0.55 s` without extensions. About `1.9 s` was serial extension module import/factory time.

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

## 2026-07-31 reconciliation and closeout

The initial handoff became stale. Later owner work had already accepted, integrated, archived, and cleaned the Vault candidate:

- local accepted patch: `34e3c14f`;
- reconciled-origin/task-4287 patch: `472eab81`;
- stable patch id shared with candidate `b97550c3`: `3a085eec9d49af3935c0ce669e3ced0fe60226e0`;
- lifecycle-v2 resource: `cpr-8474172f0580eba73fa89ea5`, terminal state `cleaned`.

AK task `4140` was resumed, given an explicit measured-campaign done contract, and rebaselined. Final five-trial RPC runs had zero `enabledModels`/model-scope warnings; configured-set trials still emitted the unrelated RPC notification that theme switching is unsupported. Medians were:

- no extensions: `538 ms`;
- configured extensions: `2242 ms`;
- repo-local Vault: `724 ms`;
- repo-local interaction: `1039 ms`;
- repo-local Vault + interaction: `1088 ms`.

The `1800 ms` configured-set target remains unmet by `442 ms`. `pi-interaction/input-triggers.ts` still spends roughly `475–599 ms` in module import while its factory costs only `0–1 ms`. The factory-deferral hypothesis is therefore falsified; the lazy-import hypothesis remains useful.

A visible interaction candidate was requested but `candidate_peer_spawn` failed closed on the lifecycle backlog hold. The controller did not bypass that hold with a manual worktree. Residual optimization is now explicit AK task `4362` rather than hidden unfinished matrix state.

The reusable dogfood path is implemented as `scripts/startup-latency/dogfood-vault-rpc.mjs`. A fresh offline RPC process verified Vault commands, schema v9, company context `software`, 71 visible templates, and an exact `inversion` read without invoking a model or changing settings. `npm --prefix packages/pi-vault-client run check` passed 251 tests plus packaging and clean-room checks.

The 2026-07-31 closeout measurements pinned `openai-codex/gpt-5.4`, eliminating unrelated startup warnings. After closeout, the startup-probe default was corrected to the operator's active `openai-codex/gpt-5.6-sol`; the historical medians remain labeled with the model scope actually used. With explicit operator direction, obsolete `openai-codex-2` and `openai-codex2` entries were removed from user model configuration while canonical `openai-codex` remained.

Campaign control is `stop`. This is a truthful partial closeout: accepted Vault improvement, verified cleanup and live/fresh-process behavior, target not met, and one visible residual task.
