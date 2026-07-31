---
summary: "Level-4 autoresearch campaign for measured Pi extension startup latency."
read_when:
  - "Investigating slow Pi startup or changing eager extension loading behavior."
  - "Reviewing AK task 4140 or the startup-latency matrix campaign."
type: "runbook"
---

# Pi extension startup latency — Level-4 autoresearch campaign

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
- autonomy: Level 4 visible candidate peers, bounded parallelism, controller verification, owner gates preserved

## Scenario × hypothesis matrix

| Scenario | Hypothesis A | Hypothesis B |
|---|---|---|
| pi-interaction isolated startup hotspot | shrink eager transitive import graph; lazy-load first-use implementation | defer non-registration initialization out of factory/blocking startup hooks |
| pi-vault-client isolated startup hotspot | shrink eager transitive import graph; lazy-load first-use implementation | defer runtime construction and non-registration work out of factory/blocking startup hooks |

The plan assigns one visible candidate worktree per cell. Candidate mutation is required; controller-inline implementation is disallowed. The controller verifies branch/worktree/base/diff facts before measurement and fan-in. Candidate-admission owner policy currently permits only one active admission, so execution is sequential and the full 2×2 matrix is not claimed complete.

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
3. no mutation of `~/.pi/agent/settings.json`, Pi host source, or third-party package source;
4. no overlap with unrelated dirty parent-worktree changes;
5. controller verifies candidate lineage and changed-file scope;
6. improvements must exceed ordinary run noise; small deltas require more samples;
7. finalizer, cleanup, AK evidence/completion, merge, release, and promotion remain explicit owner gates.

## First verified candidate result

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

The full check reported 251 passing tests plus packaging/release checks. The candidate remains isolated and unpromoted. First explicit vault use now pays the deferred schema-check cost; installed-package `/reload` and live command/tool dogfood remain separate proof tiers before promotion.

## Current explanation

Observed fact: startup is slow primarily because many enabled TypeScript/JavaScript entrypoints are eagerly loaded in series, and a few entrypoints have large import graphs or expensive factories. Lazy **tool activation** reduces provider schema/prompt cost but does not reduce startup when the owning entrypoint still eagerly imports and constructs the implementation merely to register its tools. Startup improvement therefore requires lightweight registration entrypoints, dynamic import on first command/tool use, and deferral of non-registration work out of factories and blocking startup hooks.

This is a campaign hypothesis until candidate measurements and behavior checks verify a specific implementation.
