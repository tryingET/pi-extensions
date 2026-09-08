---
summary: "AK5550: first request revalidates cached negative health; installed-Pi injected timeout recovery and fail-closed regressions."
read_when:
  - "Diagnosing first-use baseline-text health timeout errors that disappear on resubmission."
  - "Changing negative health caching, body-timeout handling, or probe invalidation."
system4d:
  container: "Pi workstation provider health-recovery implementation record."
  compass: "Recover within the first request without hiding genuine endpoint failure."
  engine: "Singleflight negative revalidation, adversarial tests, and installed-Pi probes."
  fog: "Injected timeout verification does not reproduce the original natural latency source."
---

# First-request health recovery — AK5550

## Diagnosis and implementation

The operator reported `health timed out after 1500ms` on first baseline-text use,
then success after submitting again. The cache reproduced that mechanism:
fresh negative entries denied immediately; expired negative entries triggered a
background recovery probe but still returned the old failure to the caller.
Only the following prompt benefited from recovery.

`EndpointHealthCache.check` now awaits one shared revalidation for a cached
negative verdict, even inside its TTL. Healthy or unknown ordinary endpoints
retain the existing nonblocking hot path. A fresh failure still denies dispatch.
No provider request is retried. Concurrent waiters share one probe; cancellation
of one waiter is isolated. Default health timeout remains 1,500 ms. No server
restart, model warm-up, DNS change, or lifecycle operation was added.

Independent review found two pre-existing fail-closed holes on this recovery
path, also repaired here:

- A health body timeout/transport failure after HTTP 200 headers was swallowed as
  a non-JSON success. Now only a complete body's `SyntaxError` falls back to
  HTTP-only health; abort and other body failures remain unhealthy.
- Clearing a cache during an awaited probe discarded lane truth but let the old
  waiter proceed. Epoch-invalidated waiters now receive an explicit error and
  cannot authorize inference without the discarded observation.

Test health stubs now return real `Response.json` objects instead of incomplete
response-shaped objects. The previous AK5540 diary also received the package's
required `system4d` frontmatter after the full structure gate exposed its omission.
The prior alias fix remains intact.

## Verification

- New negative-cache tests failed before the fix and passed afterward.
- `node --experimental-strip-types --test tests/*.test.mjs`: **96/96 passed**.
- `npm run check`: passed structure, typecheck, lint, budget, 96 tests and packaging.
  The published-version rejection from `npm publish --dry-run` was handled by
  the existing declared gate; nothing was published.
- Independent re-review: both findings resolved; **30/30 focused tests passed**,
  plus independent body-timeout and replacement-probe/clear reproductions.
- Tests cover fresh/stale negatives, 100 concurrent recovery waiters, cancellation,
  persistent HTTP failure, timeout before/after headers, body transport error,
  dead selected lane, clear-during-probe denial, and non-JSON success.

## Installed-Pi verification

Private scratch: `/home/tryinget/.local/state/pi-quests/tmp/ak5550-verifier-pi.arxdVx`.
Installed Pi **0.84.4**, actual provider module and canonical contract, synthetic
text-only prompt, no tools, no provider retries, bounded output. A diagnostic
wrapper and provider share one import graph so the negative-cache assertions
refer to the actual provider instance. Separate `-e` module graphs did not share
state; that initial harness attempt stopped before dispatch and is not counted.

The initial health request was deliberately held until its actual 1,500 ms
AbortSignal fired. Subsequent recovery health and successful model requests used
the real local adapter/Aeon. Negative cases injected a fresh health failure only.

After `pi install` of the local package, the controller reran all five cases on
final sources using `bash "$D/run.sh" <label> <kind> <ttl-ms>`:

| Label / kind / TTL | One prompt's outcome | Provider POST count |
|---|---|---:|
| final-fresh / fresh / 5000 | `AEON_HEALTH_RECOVERED` | 1 |
| final-stale / stale / 1 | `AEON_HEALTH_RECOVERED` | 1 |
| final-http503 / http503 / 5000 | fresh HTTP503 health error | 0 |
| final-timeout / timeout / 5000 | fresh 1500ms health timeout | 0 |
| final-normal / normal / 5000 | `AEON_HEALTH_RECOVERED` | 1 |

Successful requests retained `baseline-text` and thinking off. Every case had
exactly one prompt/assistant turn; success was checked from actual events/raw SSE,
not CLI exit status (Pi can exit zero for assistant error events).

The uninjected endpoint was healthy at inspection (~5–6 ms for adapter health).
Thus the old cache bug was reproduced deterministically, not the natural source
of the operator's original 1,500 ms latency. Side-lane degradation remained
visible without blocking the healthy baseline lane.

## Evidence and activation boundaries

- Tester dispatch: `dispatch-1788823377416`.
- Reviewer dispatch, initial and re-review: `dispatch-1788823377417`.
- Scratch `run.sh`, `wrapper.ts`, `probe.ts`, `verified-matrix.json`, per-case
  observations/request/SSE/events, and `final-*` post-install cases.
- Final hot-path source SHA256:
  `f73e8a170818ab2509d8be01a22549432e2c07fd1e92fa23862e988dca4abf61`.
- Final contract source SHA256:
  `e49d72693a3afa11ccb9a18387c7a007950addfff1531edaa8b47d51a5cfdf5e`.

Existing Pi processes require `/reload` or restart; fresh installed-Pi proof does
not claim controller/TUI hot reload. The tests do not establish sustained-load,
live-audio, or every ambient-extension behavior. No claim is made here about the
separate original empty-tool-argument investigation (AK5542). Work remains
uncommitted in the pre-existing shared feature checkout, not merged or released.
