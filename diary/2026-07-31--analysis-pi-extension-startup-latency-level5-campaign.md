---
summary: "AK-4368 Level-5 startup portfolio campaign from launch through measured unmet-target closeout and residual admission repair."
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

## AR2 — accepted session-effect fence

The corrected AR2 candidate was admitted from owner base `31fec4772687973f67d279878a883632e23554c8` and completed as the four-commit series ending at `d7d9e66d0dad0ac02a417b66f6b128cdd13c6b94`. It retained eager schemas, names, registrations, and read-profile guards while moving runtime/domain implementations behind session-local cached dynamic imports.

The first implementation was not accepted merely because its dedicated suite passed. Independent production dogfood repeatedly found wider lifecycle defects: already-open editor and retained picker effects, real tool execution after delayed imports, sticky import rejection across replacement sessions, bounded-loop persistence after abort, governed-decision cancellation converted into an ordinary blocked result, setup persistence after host abort, and goal-control mutation after host abort. Each blocker was reproduced, fixed at both extension and core persistence boundaries, regression-tested with exact abort-reason identity, and reviewed again.

The final design combines revocable session effects, cache reset at replacement, in-session first-use coalescing, composed host/session abort signals, post-import checks on all 16 lazy tool callbacks, and exact checks before scripts, receipts, event ledgers, goal ledgers, runtime snapshots, and completion progress. A final independent adversarial matrix exercised all 16 callbacks with delayed imports, unique abort reasons including `null`, zero implementation calls or post-abort artifacts, and functional replacement calls. Deep eager-schema parity against exact base bytes and concurrent receipt isolation also passed.

Controller verification ran the complete package gate: 260 deterministic local tests passed, one live Prompt Vault integration was skipped because its optional TUI dependency was unavailable, and no test failed. Two fresh ten-trial isolated candidate runs measured 20 ms entrypoint medians; a same-time unchanged owner run measured 65 ms. Whole-process medians of 744 and 720 ms versus 725 ms remained noisy, so the accepted candidate-specific claim is the repeatable 45 ms entrypoint reduction, not a whole-process delta.

Lifecycle-v2 captured the exact reviewed head, accepted all four commits, verified fast-forward commit inclusion into the campaign owner branch, and published a restoration-verified archive. The owner-path package was installed after coordinating with the concurrent Pi 0.83 lane; the stale duplicate managed entry was removed without deleting its live-worktree directory. A fresh configured RPC process registered `/autoresearch`, executed the command before and after `new_session`, emitted the autoresearch ready status both times, produced no extension error, and exited zero. Its stderr contained only an unrelated configured-model warning; RPC-mode theme-switch notifications were unrelated host behavior.

Three fresh five-trial configured-set invocations then measured 2219, 2227, and 2234 ms. Their median is 2227 ms, 41 ms below the original 2268 ms campaign baseline. Because managed Pi 0.83 package contents changed between those observations, the whole configured difference is not attributed solely to AR2; the isolated same-time 45 ms result is the controlled attribution. The 1800 ms target remains unmet by 427 ms.

Finally, exact cleanup authorization removed the candidate worktree and branch only after the visible worker exited and the archive was verified. The lifecycle resource reached `cleaned`, the admission was released through the hardened ordinary verifier, and active resource/admission pressure returned to zero. AR2 is an accepted portfolio slice; AK-4368 remains active for the next independent candidate rather than being falsely closed at the first accepted improvement.

## 2026-08-03 — final I1 wave, topology falsification, and unmet-target closeout

A fresh continuation re-established the configured baseline before another mutation: three five-trial RPC invocations measured `2293`, `2290`, and `2279 ms`, for a `2290 ms` median of medians under `openai-codex/gpt-5.6-sol`. Fifteen timing traces refreshed the inventory to 33 enabled owned entrypoints and about `805.2 ms` aggregate mean attribution. Interaction remained first at `362.2 ms`, followed by society orchestrator `82.5`, SCI `60.7`, evidence review `55.7`, and session compaction `48.1 ms`.

Read-only scouts dispositioned four remaining cells before mutation. I1 recommended interaction activation/facade separation. E1 remained a viable 45–55 ms evidence-review first-use hypothesis. C1 was explicitly rejected as a standalone session-compaction candidate because its expected 3–5 ms effect was below noise. O1 was split into deferred orchestrator subcells rather than presented as one additive promise.

The admitted I1 candidate started from `b33732cf` and produced clean commit `c89d058c`. It retained static `TriggerEditor` construction, added a narrow registration entrypoint and governed broker subpath, and kept the compatibility facade. Five package gates and 82 tests passed. Peer and controller ten-trial comparisons repeatedly observed about 80–93 ms isolated wall improvement and 88–91 ms interaction-entrypoint improvement. Fresh RPC dogfood exercised all six commands, both built-in pickers, broker identity, editor mount diagnostics, `!! git status`, and `!! cat README.md`, with no model/error events or settings/model digest change. Two independent reviews accepted the bounded isolated claim and rejected any additive configured claim.

The exact candidate was fast-forwarded, archive-verified, and lifecycle-cleaned. Its branch and worktree were removed only after the visible candidate process exited. The first post-integration configured sandbox comparison then measured old-path medians `2242/2245/2242 ms` against owner-path I1 medians `2609/2634/2616 ms`. An independent tester initially recommended rollback, and main recorded the exact revert as `d9d2aa5e`.

That configured comparison was later falsified as a code-attribution experiment. It changed not only I1 bytes but the package's physical dependency topology: the active governed live-worktree package uses one shared peer layer, while the owner checkout held hundreds of megabytes of package-local dependency copies. Replaying the restored **base** interaction tree at the owner path still measured `2702/2694/2704 ms` versus active-path `2265/2219/2249 ms`. The same ontology-workflow, PTX, and interaction costs shifted. Therefore neither the earlier `+374 ms` nor the rollback replay's `+453 ms` penalty is attributable to I1 code.

A corrected historical replay held one package source path, one settings hash, and one governed shared-peer generation constant while alternating the exact base and candidate commits. Base medians were `2249/2253/2246 ms` (median `2249`); candidate medians were `2228/2238/2225 ms` (median `2228`). The observed `-21 ms` difference is inside the declared `±50.3 ms` noise band. Independent metric review concluded that I1 proves neither configured regression nor a meaningful configured reduction. Because the portfolio gate accepts only validated reductions, the rollback remains. Commit `1a93f9b4` retained only an adapted interaction RPC dogfood probe and harness assertions.

Rollback verification passed the five-package interaction gate with 76/76 tests, the startup harness, and fresh command/editor dogfood. Final effective configured medians are `2265`, `2219`, and `2249 ms`, for a `2249 ms` median and a `449 ms` miss against the `1800 ms` target. AR2 remains the campaign's retained validated slice. I1 contributes zero retained configured savings, and no isolated deltas were summed into the final result.

The I1 lifecycle resource `cpr-95a8476f3081a9023d83ac3e` is genuinely `cleaned`, with verified archive digest `6c5a69fa156c616cfb0506d987d10fba18ae603a14d71264f089fb35d377e64e` and absent branch/worktree. Its admission `cadm-0165dc3c-fdcb-4add-b78e-4a9edcdadabd` nevertheless remains `reserved`. The 139,837,394-byte event ledger's final relevant `cleaned` event is 24,666,609 bytes, exceeding the verifier's 16 MiB bounded read. Ordinary release and retention paths fail through the same verifier. The controller did not edit the permit, rewrite event history, relax thresholds, or bypass lifecycle ownership. A bounded owner repair or exact anomaly reconciliation is required, and the residual 805,306,368-byte reservation is stated rather than hidden. P0 AK-4628 now owns that verifier repair and exact once-only reconciliation.

Package-owned autoresearch control is now explicitly `stop`. Its ledger projection still says `running_checks`, but no further bounded run can start under the stop overlay. AK-4368 therefore closes as a fully measured **unmet-target** portfolio campaign with explicit residual infrastructure debt, not as a latency success or a clean admission release.
