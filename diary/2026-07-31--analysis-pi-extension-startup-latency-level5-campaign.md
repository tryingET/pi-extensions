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
