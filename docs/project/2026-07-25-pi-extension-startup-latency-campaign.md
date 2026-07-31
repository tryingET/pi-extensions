---
summary: "Closed historical Level-4 startup-latency campaign: Vault optimization accepted, target unmet, interaction residual split to AK-4362."
read_when:
  - "Investigating slow Pi startup or changing eager extension loading behavior."
  - "Reviewing AK task 4140 or the startup-latency matrix campaign."
type: "runbook"
---

# Pi extension startup latency — historical Level-4 autoresearch campaign

## Observed baseline

Measured on 2026-07-25 with `PI_OFFLINE=1` and an explicit extension that requests graceful shutdown on `session_start`, so no model request occurs.

| Condition | Trials | Observed elapsed |
|---|---:|---:|
| `--no-extensions`, JSON mode | 3 | median **553 ms** |
| current full extension set, JSON mode | 3 | median **2541 ms** |
| current full extension set, RPC/UI-capable mode | 1 calibration | **3176 ms** |
| current full extension set, `--help` | 3 | median **2449 ms** |

The host's `PI_TIMING=1` trace attributes about **1888–1898 ms** to serial extension module imports and factories. Pi loads enabled extension paths sequentially; each path creates a fresh Jiti instance with `moduleCache: false`, imports the complete entrypoint graph, then awaits its factory.

Largest calibrated contributors:

| Entrypoint | Import | Factory | Approx. total |
|---|---:|---:|---:|
| `pi-interaction/.../input-triggers.ts` | 474–480 ms | 1 ms | **~475–481 ms** |
| `pi-vault-client/extensions/vault.js` | 141–149 ms | 329–335 ms | **~470–478 ms** |
| third-party `@marckrenn/pi-sub-core` | 302–310 ms | 0 ms | **~302–310 ms** |
| third-party `@marckrenn/pi-sub-bar` | 143–148 ms | 1 ms | **~144–149 ms** |
| full society orchestrator entries | ~83 ms | ~7 ms | **~90 ms** |

The top four paths account for roughly three quarters of measured extension-load time. The first two are repo-owned campaign targets. Third-party packages remain measurement context, not mutation scope.

## Campaign anchor

- AK task: `4140`
- campaign artifact: `.autoresearch/startup-latency/level4-campaign.json`
- benchmark: `scripts/startup-latency/benchmark.sh`
- check: `scripts/startup-latency/check.sh`
- fresh Vault RPC dogfood: `scripts/startup-latency/dogfood-vault-rpc.mjs`
- autonomy at launch: Level 4 visible candidate peers, bounded parallelism, controller verification, owner gates preserved
- current taxonomy note: ASC now classifies measured campaigns as Level 5; the Level-4 label is retained as historical campaign identity

## Scenario × hypothesis matrix

| Scenario | Hypothesis A | Hypothesis B |
|---|---|---|
| pi-interaction isolated startup hotspot | shrink eager transitive import graph; lazy-load first-use implementation | defer non-registration initialization out of factory/blocking startup hooks |
| pi-vault-client isolated startup hotspot | shrink eager transitive import graph; lazy-load first-use implementation | defer runtime construction and non-registration work out of factory/blocking startup hooks |

The plan assigned one visible candidate worktree per cell. Candidate mutation was required; controller-inline implementation was disallowed. One Vault candidate ran and was accepted. At closeout, the other cells were dispositioned explicitly rather than falsely claimed complete: the second Vault cell was waived because the integrated entrypoint now imports in about 8 ms and its isolated median is below the 1000 ms segment threshold; the interaction factory-deferral cell was falsified because the factory is only 0–1 ms; and the still-relevant interaction lazy-import cell was split to AK task `4362` after `candidate_peer_spawn` failed closed on the lifecycle backlog hold.

## Measurement contract

Primary metric:

```text
startup_elapsed_ms_median (ms, lower is better)
```

Candidate command:

```bash
bash scripts/startup-latency/benchmark.sh --profile auto --mode rpc --trials 5
```

`auto` selects the isolated `interaction` or `vault` profile from the candidate diff. This prevents the installed global package path from hiding candidate effects. Run histories and `PI_TIMING=1` traces are retained under `.autoresearch/startup-latency/runs/`.

Acceptance requirements:

1. at least five trials per candidate condition;
2. behavior-preserving package checks pass;
3. benchmark and dogfood scripts do not mutate Pi settings, Pi host source, or third-party package source; the later operator-directed removal of obsolete numeric Codex aliases from user model config was a separately recorded closeout correction;
4. no overlap with unrelated dirty parent-worktree changes;
5. controller verifies candidate lineage and changed-file scope;
6. improvements must exceed ordinary run noise; small deltas require more samples;
7. finalizer, cleanup, AK evidence/completion, merge, release, and promotion remain explicit owner gates.

## Accepted Vault candidate and lifecycle

The first admitted Level-4 lane was `cell-02-02` (`pi-vault-client` × deferred initialization).

- peer run: `candidatepeer-mrzpur03-40e7f9b9`
- branch: `candidatepeer/ar-4140-candidate-01-0281ddb7`
- base: `ffbfadf2c5df903b721d7ab47d97b310789ec041`
- candidate commit: `b97550c3d87fd3ea6e235c81e5aa966ddfa3c4f2`
- scope: nine files, all under `packages/pi-vault-client/`
- intervention: registration-only extension factory, lazy fail-closed schema checks on explicit vault operations, and removal of the blocking startup inventory read

Controller-run, apples-to-apples vault-only RPC measurements:

| Segment | Trials per sample | Median samples | Result |
|---|---:|---|---:|
| base-HEAD vault-only baseline | 5 | `1432 ms` autoresearch baseline (`1488 ms` independent calibration) | baseline |
| candidate replicate 1 | 5 | `597 ms` | -58.3% vs 1432 ms |
| candidate replicate 2 | 5 | `618 ms` | -56.8% vs 1432 ms |

`pi-autoresearch` classified the segment `threshold_satisfied`, with a `±71.6 ms` noise band and `39.76×` confidence. Host timing traces show the vault factory falling from roughly `335–339 ms` to `2 ms`, while total vault entrypoint timing falls from roughly `533–599 ms` to `110–115 ms` in the bounded harness.

Controller validation passed:

```text
NODE_OPTIONS=--preserve-symlinks npm --prefix packages/pi-vault-client run check
```

The original full check reported 251 passing tests plus packaging/release checks. The accepted patch was integrated on local history as `34e3c14f` and on the reconciled origin history as task-4287 commit `472eab81`; both are patch-equivalent to candidate `b97550c3` with stable patch id `3a085eec9d49af3935c0ce669e3ced0fe60226e0`. Candidate lifecycle-v2 resource `cpr-8474172f0580eba73fa89ea5` records accepted disposition, verified archive, authorized worktree/branch removal, and terminal `cleaned` receipt. First explicit Vault use now pays the deferred schema-check cost.

## 2026-07-31 dogfood closeout

The resumed campaign used the checked-in harness and a fresh offline RPC process. `benchmark.sh` now pins `--models openai-codex/gpt-5.4`, a model declared by `~/.pi/agent/models.json`, so no-model startup probes do not inherit unrelated `enabledModels` warnings. The operator-directed config correction removed obsolete `openai-codex-2` and `openai-codex2` provider/selector entries while preserving canonical `openai-codex`.

| Current condition | Trials | RPC median |
|---|---:|---:|
| no extensions | 5 | **538 ms** |
| configured extension set | 5 | **2242 ms** |
| repo-local Vault only | 5 | **724 ms** |
| repo-local interaction only | 5 | **1039 ms** |
| repo-local Vault + interaction | 5 | **1088 ms** |

The configured-set target of `1800 ms` was **not met**; the final median missed by `442 ms`. The current result is lower than the historical `3176–3179 ms` baseline, but intervening extension/configuration changes prevent attributing the whole difference to the Vault patch. Final configured-set trials had zero `enabledModels`/model-scope warnings; they still emitted the unrelated RPC notification that runtime theme switching is unsupported.

Fresh-process dogfood via `scripts/startup-latency/dogfood-vault-rpc.mjs` verified:

- `vault` and `vault-check` command registration;
- Prompt Vault schema v9 compatibility;
- company context `software` and 71 visible active templates;
- an exact `inversion` template read producing prepared editor text;
- no model invocation and no settings mutation by the dogfood script.

`npm --prefix packages/pi-vault-client run check` passed with 251 tests plus packaging and clean-room checks. The campaign control overlay is now `stop`: Vault delivery is accepted and cleaned, the full target is explicitly unmet, and the remaining interaction import hotspot is owned by AK task `4362`. This is a truthful partial closeout, not a full-target success claim.

## Current explanation

Observed fact: startup is slow primarily because many enabled TypeScript/JavaScript entrypoints are eagerly loaded in series, and a few entrypoints have large import graphs or expensive factories. Lazy **tool activation** reduces provider schema/prompt cost but does not reduce startup when the owning entrypoint still eagerly imports and constructs the implementation merely to register its tools. Startup improvement therefore requires lightweight registration entrypoints, dynamic import on first command/tool use, and deferral of non-registration work out of factories and blocking startup hooks.

The Vault deferral mechanism is verified and integrated. The interaction lazy-import mechanism remains a residual hypothesis under AK task `4362`; no success is claimed until an admitted candidate is measured and behavior-checked.
