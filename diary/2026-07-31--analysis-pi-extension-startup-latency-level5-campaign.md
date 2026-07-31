---
summary: "AK-4368 Level-5 startup portfolio campaign launch, repeated baseline, owned-entrypoint inventory, candidate plan, and lifecycle admission block."
read_when:
  - "Continuing or reviewing the AK-4368 startup-latency portfolio campaign."
type: "diary"
---

# 2026-07-31 — Pi extension startup Level-5 portfolio campaign

## Why the campaign broadened

The operator rejected a single-hotspot interpretation. The campaign now evaluates cumulative behavior-preserving reductions across every enabled repo-owned extension. Large slices remain useful, but neither `pi-interaction` nor any other package can by itself establish portfolio completion.

AK task `4368` was created and claimed with a measured-portfolio done contract. It requires an inventory of all enabled owned entrypoints, candidate evaluation across at least two packages, repeated candidate measurements, combined configured-set remeasurement, live dogfood, lifecycle reconciliation, and independent review. Guardrails prohibit controller-inline candidate implementation, lifecycle-v2 bypass, arithmetic addition of unremeasured micro-deltas, user-config changes, host/third-party source mutation, and hidden promotion or cleanup.

## What was measured

The new `pi-autoresearch` segment uses `openai-codex/gpt-5.6-sol`, invokes no model, and targets `startup_elapsed_ms_median <= 1800 ms`.

Three unchanged five-trial configured-set invocations produced medians of `2268`, `2265`, and `2277 ms`; the median of medians is `2268 ms`, the invocation-median spread is `12 ms`, and the target gap is `468 ms`. `pi-autoresearch` correctly reports `possible_noise` and a conservative `±113.4 ms` noise band rather than candidate evidence.

A new reusable `scripts/startup-latency/summarize-timings.mjs` parses Pi timing traces, combines import/factory cost per entrypoint and trial, classifies repo/live-worktree/installed-`@tryinget` entries as owned, and emits a human table plus JSON. The first portfolio contains 32 owned enabled entrypoints with about `917 ms` aggregate mean timing; ten entries at or above 10 ms account for about `849 ms`, while 22 smaller entries total about `68 ms`.

The benchmark gained a generic repeated `--extension PATH` custom profile. Ten-trial isolated base medians are:

- interaction: `1049 ms`, entrypoint timing median `497 ms`;
- evidence review: `618 ms`, entrypoint timing median `67 ms`;
- session compaction: `602 ms`, entrypoint timing median `53 ms`.

These are unchanged baselines, not wins.

## Discovery and candidate posture

Read-only scouts selected a first portfolio wave:

- I1: interaction lightweight governed subpaths/narrow runtime imports while preserving package-root exports and immediate editor/trigger behavior;
- E1: evidence-review cached first-use reader/validator/Ajv/schema/render loader after eager lexical/headless gates;
- C1: session-compaction cached default handler load on first actual compaction while preserving injected handlers and exactly-one hook semantics.

A later micro-bundle may group several mechanically safe sub-10 ms seams, but it receives no individual saving claims and must be measured as a combined candidate.

All three candidate launches failed closed with `candidate_peer_spawn is temporarily blocked by the candidate lifecycle backlog hold.` No worktree or candidate resource was created. The controller did not create a manual worktree, patch target packages inline, use a forked peer as a substitute, merge, install, promote, or clean anything.

## Current next legal move

Preserve the active campaign receipts, commit the campaign tooling/narrative independently from target candidates, and retry admitted I1/E1/C1 lanes only after lifecycle-v2 admission is available. Candidate checks and live dogfood remain package-specific, and the final target can be assessed only from a combined configured-set measurement.

The checkpoint landed as `b734587c`. Performance-baseline evidence `5653` and failed candidate-admission evidence `5654` are attached to AK-4368. The task was then released and placed under until-event deferral `194` with trigger `candidate_peer_spawn:lifecycle-v2-admission-available`; the autoresearch runtime remains ready with no hidden continuation.

## Scout startup authentication incident

One concurrently started scout session (`019fb8c3-cf94-780e-b736-e14c3142d4c3`) emitted `Failed to extract accountId from token` twice and never ACKed. Session JSONL shows `openai-codex/gpt-5.6-sol`; `auth.json` was rewritten between that process's session creation and first failed model turn. The failed process retained its bad in-memory credential, while the current stored Codex access JWT and stored account id validate and match without exposing their values. A replacement scout (`019fb8d3-a2a6-7330-99bd-e373c1f62e96`) started after that validation and completed multiple model/tool turns without the account-id error.

Observed source risk: the active host's `openai-codex-responses.ts` decodes the JWT payload with raw `atob(parts[1])`, while JWT payloads use base64url; credential storage also keeps an in-memory snapshot per process. The exact contribution of base64url decoding versus cross-process token rotation remains a hypothesis until a synthetic regression test reproduces it. No auth/model/settings file was edited during diagnosis. Durable owner work is routed to contrib Pi task `4375`; the obsolete failed peer tab can be closed, and it should not be reused.

## Operator-directed Level-5 resumption

The operator correctly challenged the apparent stop: `pi-autoresearch` was already the measurement substrate, while the blocked operation was candidate mutation through lifecycle-v2. Two fresh SCI1/AR1 candidate requests through the currently loaded tool repeated the old hold-file error. Inspection then established that this message was stale: the hold artifact is marked `superseded_by_admission_v2`, AK decision 63 is accepted/unblocked, task 4029 is done, and the admission-v2 configuration is active.

Admission still cannot allocate a candidate. Its one repository slot is occupied by AK-4152 admission `cadm-27369981-8c40-448b-9136-78f7a4b29228`. The corresponding lifecycle resource `cpr-22e7419e0a7c799d665f77b6` is terminally `cleaned`; the rejected candidate has a verified archive and terminal receipt, and its branch/worktree are absent. However, the permit remains `reserved`. The source-owned release operation checked the exact lifecycle record and failed closed with `candidate terminal receipt schema mismatch`: this legacy terminal receipt predates the hardened schema fields now required for release verification. The controller did not hand-edit the permit, relax Decision 63 thresholds, recreate the worktree, or use raw Git cleanup. AK evidence `5666` records the campaign admission failure and `5667` routes the exact reconciliation defect to AK-4152. Independent read-only review found no lawful existing command and rejected relaxing the normal verifier; P0 task `4378` now owns a separate exact legacy-anomaly reconciliation operation with once-only pressure release and adversarial identity/digest/fragment tests.

The campaign nevertheless advanced lawfully through `pi-autoresearch`. Two predeclared calibration segments each ran ten fresh RPC trials under `openai-codex/gpt-5.6-sol` and passed `scripts/startup-latency/check.sh`:

- SCI1 unchanged baseline: 602 ms wall-clock median; 67 ms entrypoint import/factory median;
- AR1 unchanged baseline: 605 ms wall-clock median; 64.5 ms entrypoint import/factory median.

These are isolated baselines, not candidate wins. The next mutation remains sequential SCI1 then AR1 after exact once-only stale-terminal admission reconciliation. Each candidate still needs its own lifecycle binding, at least ten trials, package checks, first-use/concurrency/fail-closed dogfood, and a combined configured-set remeasurement before any savings claim.

## Sequential SCI1 and AR1 outcomes

AK-4378 completed the exact legacy-terminal reconciliation and returned admission pressure to zero without changing the ordinary hardened verifier. The campaign then exercised two sequential admitted candidates.

SCI1 reached clean commit `e09912a2978166bcf056a3de0b126cbe954a5211` and passed its package check, but two ten-trial measurements did not improve the 602 ms wall / 67 ms entrypoint baseline. Inspection confirmed that `mcp-bridge.ts` and the MCP SDK imports remained statically eager. The controller rejected, restoration-archived, lifecycle-cleaned, and released SCI1 without integration.

AR1 reached clean commit `f2d7d0f14c3ebb7358f8a2dc3ae5fb015cd51267`. Its 23 changed files stayed under `packages/pi-autoresearch`; eager schemas, names, registrations, guards, and receipt isolation remained at the registration boundary while runtime/domain implementations moved behind cached dynamic imports. Package checks, strict dogfood contracts, and the dedicated lazy-runtime suite passed.

Two independent ten-trial candidate runs each produced an 18 ms autoresearch entrypoint median. A same-time unchanged run produced 64 ms, so the import/factory reduction was repeatable and 46 ms larger than the declared 35 ms candidate floor. Whole-process medians remained noisy at 703–709 ms for the candidate and 707 ms for the unchanged owner, so no process-level saving or configured-set result was claimed.

Independent adversarial review then reproduced a correctness blocker: commands with already-open editor flows and retained picker callbacks could still notify through the old extension context after `session_shutdown`. Existing tests covered delayed imports/widgets, but not a UI await that began before shutdown and resolved afterward. The reviewer also found the new schema regression assertions structurally shallow, although no concrete schema drift was found.

The controller rejected AR1 as-is and did not cherry-pick, merge, push, install, or otherwise integrate it. Lifecycle-v2 captured the exact reviewed head, discarded only the measured ignored `node_modules` paths, published a restoration-verified archive, authorized exact worktree/branch removal, and reached terminal `cleaned`. Cleanup first failed before effects while the visible candidate Pi still leased the worktree; after that process exited, compound invocations whose own shell command line named the worktree also correctly triggered the lease guard. A minimal source-owned cleanup invocation without that path in its parent command line succeeded. The candidate branch and worktree are absent, the owner branch does not contain the candidate commit, and admission pressure is back to zero.

No candidate delta is counted toward portfolio savings. The next AR attempt, if selected, must be a new admitted candidate with post-await and retained-callback liveness guards plus already-open-editor shutdown regressions. The configured-set portfolio remains unchanged until a slice passes both measurement and behavior review.
