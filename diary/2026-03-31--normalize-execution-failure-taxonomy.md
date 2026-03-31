---
summary: "Session log for AK task #626: normalizing execution failure taxonomy across ASC public results and orchestrator consumer surfaces."
read_when:
  - "Reconstructing how timeout/error classification stopped drifting between ASC and pi-society-orchestrator."
  - "Checking why `result.details.status` now uses `timed_out` and where `failureKind` came from."
---

# 2026-03-31 — Normalize execution failure taxonomy across ASC and orchestrator result surfaces

## What I did
- Claimed AK task `#626` for the `pi-extensions` repo.
- Re-entered the post-cutover execution-seam packet from both package perspectives:
  - `packages/pi-autonomous-session-control/next_session_prompt.md`
  - `packages/pi-autonomous-session-control/README.md`
  - `packages/pi-autonomous-session-control/docs/project/public-execution-contract.md`
  - `packages/pi-society-orchestrator/next_session_prompt.md`
  - `packages/pi-society-orchestrator/README.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
- Normalized the ASC public execution result surface so it now exposes one canonical execution taxonomy:
  - `result.details.status` now uses `done | aborted | timed_out | error | spawning`
  - `result.details.failureKind` now captures the specific failure branch (`timed_out`, `assistant_protocol_error`, `assistant_protocol_parse_error`, `transport_error`, `invariant_failed`, `unknown_profile`, `rate_limited`, `aborted`)
- Kept ASC internal runtime/session/dashboard status truth unchanged where it still legitimately uses package-local `timeout`; the normalization is applied at the public result surface instead of reopening internal dashboard semantics.
- Updated `pi-society-orchestrator` to preserve that normalized taxonomy instead of reconstructing it from partial booleans/string checks:
  - `src/runtime/subagent.ts` now forwards `failureKind` and recognizes canonical `timed_out`
  - `extensions/society-orchestrator.ts` now includes `failureKind` in direct-dispatch tool details
  - `src/loops/engine.ts` now preserves `failureKind` per phase in loop results
- Refreshed the cross-package docs/handoff surfaces so `#626` is treated as landed history and `#627` is the next bounded seam-stewardship slice:
  - `packages/pi-autonomous-session-control/README.md`
  - `packages/pi-autonomous-session-control/docs/project/public-execution-contract.md`
  - `packages/pi-autonomous-session-control/next_session_prompt.md`
  - `packages/pi-society-orchestrator/README.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
  - `packages/pi-society-orchestrator/next_session_prompt.md`

## What stayed intentionally out of scope
- I did not change ASC dashboard/session sidecar status names; those remain internal runtime artifacts and were not part of the public seam-normalization slice.
- I did not add automated anti-drift guardrails against private imports or orchestrator-local runtime revival; that remains `#627`.
- I did not reopen execution-plane ownership; ASC remains the runtime owner and orchestrator remains the narrow consumer.
- I did not change the bundled ASC bridge lifecycle or release topology.

## Result
- ASC and orchestrator now share one canonical execution-failure taxonomy at the public result surface instead of mixing `timeout` and `timed_out` naming.
- Consumers no longer need to reverse-engineer protocol-vs-transport-vs-guardrail failure branches from output text alone.
- The next-session prompts now move cleanly from `#626` to `#627` instead of leaving the failure-taxonomy slice implied-but-unlanded.

## Validation
- `cd packages/pi-autonomous-session-control && npm run docs:list`
- `cd packages/pi-autonomous-session-control && npm run check`
- `cd packages/pi-society-orchestrator && npm run docs:list`
- `cd packages/pi-society-orchestrator && npm run check`
- `cd packages/pi-society-orchestrator && npm run release:check`
- `cd ~/ai-society/softwareco/owned/pi-extensions && npm run quality:pre-commit`
- `cd ~/ai-society/softwareco/owned/pi-extensions && npm run quality:pre-push`
- `cd ~/ai-society/softwareco/owned/pi-extensions && npm run quality:ci`
- `cd ~/ai-society/softwareco/owned/pi-extensions && npm run check`

## Next obvious move
- Start `#627` to add automated guardrails against private ASC imports and orchestrator-local runtime revival.
- Keep later seam-review/consumer-inventory follow-up bounded to `#628` and `#629` once the guardrail slice lands.
