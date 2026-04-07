---
summary: "Completed pi-society-orchestrator task #950 by throttling footer health retries and making PI_ORCH_FOOTER_HEALTH_REFRESH_MS=0 a real immediate-refresh configuration instead of falling back to the default interval."
read_when:
  - "You are resuming after AK task #950 on pi-society-orchestrator footer refresh throttling."
  - "You need the exact implementation/validation summary for the footer retry-throttle and zero-config repair."
---

# 2026-04-07 — pi-society-orchestrator footer retry throttle + zero-config repair (task #950)

## Scope
- Claimed `#950` after a follow-up inspection surfaced one remaining issue in the footer health-refresh repair:
  - failed footer health checks retried on every render instead of respecting the configured refresh interval
  - `PI_ORCH_FOOTER_HEALTH_REFRESH_MS=0` was not a real zero-delay config because the env parsing used `||` fallback semantics
- Package: `packages/pi-society-orchestrator`
- Goal: finish the footer health-refresh path atomically instead of leaving a hidden retry-storm edge case behind.

## What changed
- `packages/pi-society-orchestrator/extensions/society-orchestrator.ts`
  - changed footer refresh-interval parsing so `0` is treated as a valid explicit value
  - changed footer health retry gating so failed startup checks also respect the configured refresh interval instead of probing on every render
  - preserved immediate-retry behavior when the operator explicitly sets the interval to `0`
- `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
  - kept the startup-drift recovery regression proving that `PI_ORCH_FOOTER_HEALTH_REFRESH_MS=0` refreshes immediately
  - added a new regression proving failed footer health retries stay throttled when the interval is non-zero

## Validation
Passed:
- `cd packages/pi-society-orchestrator && npm run check`
- `cd packages/pi-society-orchestrator && npm run release:check`

## Result
- Footer health refresh now has both correctness and bounded retry behavior.
- The remaining surfaced footer-health debt from this pass is resolved rather than deferred.
