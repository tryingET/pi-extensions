---
summary: "Inspectable execution and dogfood plan for AK6391/AK6392 Society context reliability."
system4d:
  container: "Separate consumer, producer and publication execution obligations."
  compass: "Bind each claim to its exact owner and actual proof."
  engine: "Implement -> inspect -> dogfood -> separately authorize publication."
  fog: "Local candidate checks do not complete the rollout plan."
read_when:
  - "Executing or inspecting the Society context reliability rollout."
---
# Implementation plan

Status: independently inspected and adopted under AK decision 169; Step 1 completed with operator approval. Steps 2–5 remain pending until exact execution evidence is recorded. RFC: [design packet](2026-10-01-context-reliability-design.md). AK6391 owns Pi work; AK6392 owns AK source work; AK6396 owns separately scoped AK runtime pin/policy deployment.

## Step 1 — Architecture inspection and adoption

- Independent work-product inspection of the RFC and this plan against reproduced behavior, source-owner boundaries, multi-order effects and cancellation semantics.
- Record findings and dispositions in a dated inspection artifact and AK evidence. Resolve blockers, then ask the operator to approve the concrete architecture (not just the workstream).
- Adopt through an AK cross-repo decision with problem brief, evidence note, review memo, implementation plan, rollout/rollback artifacts and ADR projection. Re-evaluate linked execution tasks before production implementation.
- Acceptance: exact architecture and publication boundaries are explicit; no unknown source-admission or scope gap is treated as permission.

## Step 2 — Producer implementation and inspection (AK6392)

- Add startup-only transaction-scoped successful-admission caching without changing budget accounting, strict fact collection, complete queue evaluation, sample semantics, ordering or generic task readers.
- Add differential tests against the unchanged path, transaction/cache isolation, non-admitted/error behavior and deterministic admission observation counts. Keep fixtures/query instrumentation test-owned.
- Benchmark candidate parent and implementation on equivalent isolated AK data. Do not compare unrelated candidate-main changes directly to the installed binary and call that the optimization's speedup.
- Independently inspect code and tests before publication. Fix every in-scope finding and rerun relevant checks.
- Run owner fast/full validation, build the immutable release candidate using `scripts/build-ak-pin.sh --commit X`, then exact-commit `ak-dev prove --task 6392 --candidate <clean-X> --binary <immutable-X/ak-bin> --scenario <actual-scenario>` with observed rollback rehearsal. Record binary/source identity; never accept the default old installed pin as Rust candidate proof. Coordinate existing shared ak-dev custody before any seed/reset. Build/cache scratch belongs under TMPDIR and heavy-job; do not install a dev binary against the live DB.
- Acceptance: matching results and authority/budget semantics, demonstrably less repeated work, no gate bypass; exact publication proof exists.

## Step 3 — Pi implementation and inspection (AK6391)

- Extract bounded command transport and single-flight lifecycle modules; preserve public imports and valid-payload projections; intentionally tighten malformed/rejected-payload handling according to the RFC.
- Implement serial AK collection, explicit refresh wall budget and per-command timeout, distinguish timeout/abort/exit/launch/schema failure and prevent later-stage launches after cancellation.
- Implement generation-safe publication AND consumption; demand-driven degraded recovery, healthy TTL, jitter/backoff, cwd/config invalidation and manual-refresh coalescing.
- Add health/freshness/refresh diagnostics to rendered packet and truthful status; unavailable direction check must not imply drift. Include passport failures in health/warning accounting.
- Add imports to the packed files allowlist; update README/contract and examples as applicable. Tests must import packed outputs as well as the source registration. Load and register the extension from an extracted tarball without repository import fallback or development dependencies.
- Deterministic tests: healthy/degraded/not-checked, every failure kind, zero/short configured budgets, stale-to-refresh, failed-to-recovered, manual concurrency, supersession during bounded wait, shutdown, cwd/config races, no idle polling, multi-controller jitter and subprocess descendant cleanup.
- Independently inspect implementation, then resolve findings. Run package `npm ci`, `npm test`/`npm run check`, tracked file-budget audit and task-focused docs checks.
- Acceptance: no stale/superseded authority is presented as fresh and no timeout-bearing packet is permanently treated as ready.

## Step 4 — Dogfood protocol inspection

Inspect the live protocol BEFORE running it. It must not change live DB facts to simulate failures, weaken runtime admission, interfere with other sessions, or delete shared scratch. Use private process fixtures/proxies only for transport failure injection; preserve installed `ak` as the source of real facts.

Protocol:
1. BEFORE publication, measure the old installed AK snapshot and context baseline, then candidate parent/optimized binaries on equivalent isolated data. Save timings and semantic health; distinguish total wall time from admission/internal SQL time. Optimized INSTALLED proof belongs only after publication.
2. Candidate extension in a fresh REAL Ghostty TUI (not `pi -p`) using a private `PI_CODING_AGENT_DIR` with private settings/auth provisioning and exactly ONE startup-context extension. Keep HOME unchanged and session cwd at the registered canonical Pi repo under ai-society; load the candidate extension by absolute worktree path with other extensions disabled. Project applicable owner instructions explicitly. Record loaded resource path/hash, effective cwd, one registered controller, and actual AK probe call counts. Confirm prompt wait remains bounded while background collection proceeds. Do not globally install the candidate or accidentally run with the not-applicable external worktree cwd.
3. Private AK proxy fails one bounded read once, then delegates unchanged to installed `ak`; prove degraded presentation, due retry on subsequent activity and healthy recovery. Proxy effects/call counts are recorded and it is never installed globally.
4. Controlled barriers exercise simultaneous refresh requests and supersession without overlapping refresh publication. Fixture clocks cover TTL/backoff boundaries; real TUI confirms visible labels and current generation.
5. AFTER Step 5 publication/promotion (not before it), start a separate fresh real TUI and run `/reload`; repeat real-source collection with no proxy/config timeout override. Confirm exact installed extension generation and AK runtime pin, zero source warnings when reads succeed, correct failure labels when they do not, and no owned subprocess/driver left running after completion.
6. Record limitations explicitly: fixture backoff tests are not proof of arbitrary multi-session capacity; source health is not authority to mutate tasks; process launch status is not visual placement proof.

Acceptance: candidate and promoted runtime proof are distinct, failure-to-recovery is observed, and every report refers to exact commits/generations. Any discovered in-scope bug returns to Steps 2/3 and receives another inspection and dogfood pass.

## Step 5 — Publication, landing, closeout

- AK: follow owner ak-dev, publication state machine and runtime-publish docs. Record exact source commit proof and separately authorized policy/pin deployment proof. Never merge a live-served change without its exact proof note; never mutate canonical policy by hand or rotate DB engines.
- Pi: install every locked package in the isolated worktree; commit after inspection; push exact SHA through `heavy-job run` with selected gate Node and prepared builds; wait for ALL CI runs; land canonical only with `scripts/land-canonical.sh origin/main`. Leave other sessions' files unchanged.
- Run post-promotion live dogfood before claiming completion. Record architecture, plan, implementation inspections; tests, CI, ak-dev/rollback receipts; live proof; and all finding dispositions in AK.
- Use task close-check; satisfy missing contracts or obtain an explicit owner deferral, never convert partial publication into success.
- Release claims if work stops. Remove only clean owned worktrees with no active readers.

## Finding disposition policy

The first independent inspection identified six blocking design/plan gaps: payload-semantic health, startup-only per-attempt cache seam, group settlement beyond child exit, explicit candidate binary proof, candidate TUI isolation/applicability, and publication ordering. The revised RFC and this plan address each before implementation. Inspection artifacts and AK decision/evidence carry their final closure; this paragraph is not a passing verdict.


Fix all defects causal to this workstream. Re-inspect the changed slice and rerun affected proofs. An unrelated defect, source-owner authorization gap, or failed publication admission is a blocker/follow-up in AK, not permission to bypass a gate. The task remains unfinished when a required outcome lacks proof.

## Rollback

Pi rollback is a gated revert and `land-canonical.sh`, not manual canonical reset. AK rollback uses the retained immutable approved binary and runtime publication procedures proven on ak-dev; no live DB family replacement is part of this change. Preserve prior source/policy/runtime identifiers and exact proof notes before publication. A failed extension load must roll back through the canonical landing script. Failed AK admission/publication remains fail-closed until its owner procedure is satisfied.
