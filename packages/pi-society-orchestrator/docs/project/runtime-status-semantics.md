---
summary: "Runtime-truth contract for operator-visible status surfaces in pi-society-orchestrator."
read_when:
  - "You are changing footer/session-start/routing wording or the /runtime-status inspector."
  - "You need the canonical operator-visible status semantics for pi-society-orchestrator."
system4d:
  container: "Package-local runtime-status semantics note."
  compass: "Keep operator-visible status truthful to the current orchestrator → ASC split and derive visible copy from one shared descriptor."
  engine: "Name the truth surface -> name the derived UI surfaces -> record the wording contract."
  fog: "The main risk is reintroducing scattered literals so startup copy, footer labels, routing notices, release smoke, and docs drift apart again."
---

# Runtime status semantics — pi-society-orchestrator

## Source of truth

The canonical operator-visible runtime-truth surface lives in:
- [`src/runtime/status-semantics.ts`](../../src/runtime/status-semantics.ts)

The lightweight always-on Pi extension that renders this surface lives in:
- [`extensions/runtime-footer.ts`](../../extensions/runtime-footer.ts)

That module owns the footer/status commands and imports the shared descriptor/snapshot helpers for:
- orchestration owner vs execution owner
- the `orchestrator→ASC` seam label
- routing label and current routing scope
- live context, session-token, DB, and Vault status summaries for `/runtime-status`
- footer/status surface contracts

## Current truth contract

| Concern | Current truth |
|---|---|
| Coordination/control plane | `pi-society-orchestrator` |
| Execution/runtime plane | `pi-autonomous-session-control` |
| Seam label | `orchestrator→ASC` |
| Routing label | `Routing` |
| Routing selector command | `/agents-team` |
| Runtime inspector command | `/runtime-status` |

## Derived operator-visible surfaces

These surfaces should derive from the shared runtime-truth surface instead of carrying independent literals:

1. `/runtime-status` from `extensions/runtime-footer.ts`
   - opens an editor-backed report with the runtime truth, live routing state, DB/vault status, footer contract, and a read-only AK close-frame/readiness section when AK can detect exactly one active strategic frame and implementation wave for the current cwd
   - the AK section preserves route posture, common proceed rule, route policy/state machine, active task, closeout readiness, close-frame blockers, closeout-domain blockers, safe read commands, and lifecycle/source-owner non-authorizations without running AK lifecycle writes
2. `session_start` from `extensions/runtime-footer.ts`
   - announces DB/vault status plus the current routing scope
   - advertises `/agents-team` as a routing selector and `/runtime-status` as the direct inspector
3. footer from `extensions/runtime-footer.ts`
   - primary left slots: `<model> · orchestrator→ASC`
   - optional context slot: `ctx <tokens>` when current context usage is known
   - optional token slot: `↑<input> ↺<cache> ↓<output>` after the session records usage
   - optional health slots: `DB✓|DB✗ · Vault✓|Vault✗` when width allows
   - optional selected extension-status slots after the health badges when width allows:
     - `asc-rewind` as `rw <rewind-points>/<snapshots>`
     - `society-context` as its sanitized compact status, usually `Society ctx✓`
     - `stash` as `stash <count>`
   - right side: `Routing: <team>`
   - compact widths should drop selected extension-status slots first, then optional health slots, then the session-token slot, then the context slot, then the seam, before sacrificing routing visibility
   - footer health badges may refresh after startup if Vault health changes during the session
4. `/agents-team`
   - treats the choice as routing scope selection, not generic "team" wording
   - reports the current routing scope after selection using the shared routing label
5. installed-package release smoke
   - validates the routing wording against the same user-visible contract

## Wording constraints

- Do **not** imply that `pi-society-orchestrator` owns the execution runtime.
- Do **not** imply that Pi owns AK lifecycle state; `/runtime-status` may display AK closeout/readiness/close-frame readbacks, route policy, active task, safe commands, and non-authorizations, but it must not run AK lifecycle writes.
- Do **not** regress to stale footer/status wording such as `orchestra` or `Team: ...` for the operator-facing runtime surfaces covered here.
- Prefer `Routing` when describing the active agent-scope selection.
- Keep footer/status wording short; put richer explanation in `/runtime-status` and docs.
- Protect routing visibility before selected extension statuses, optional health badges, optional session-token summaries, optional context slots, model, and finally the seam when compacting the footer.

## Change rule

If you change operator-visible runtime wording in this package, update all of:
- `src/runtime/status-semantics.ts`
- `extensions/runtime-footer.ts`
- `src/runtime/ak-close-frame-status.ts` when AK closeout/readiness readback semantics change
- `extensions/society-orchestrator.ts` when full-extension compatibility wiring changes
- `tests/runtime-shared-paths.test.mjs`
- `scripts/release-smoke.mjs` when installed-package wording assertions change
- this document and `README.md` when the human-facing contract changes
