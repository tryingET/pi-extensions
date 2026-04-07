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

That module owns the shared descriptor and snapshot/report helpers for:
- orchestration owner vs execution owner
- the `orchestrator→ASC` seam label
- routing label and current routing scope
- live DB/vault status summary for `/runtime-status`
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

1. `/runtime-status`
   - opens an editor-backed report with the runtime truth, live routing state, DB/vault status, and footer contract
2. `session_start`
   - announces DB/vault status plus the current routing scope
   - advertises `/agents-team` as a routing selector and `/runtime-status` as the direct inspector
3. footer
   - primary left slots: `<model> · orchestrator→ASC`
   - optional health slots: `DB✓|DB✗ · Vault✓|Vault✗` when width allows
   - right side: `Routing: <team>`
   - compact widths should drop optional health slots first, then the seam, before sacrificing routing visibility
   - footer health badges may refresh after startup if Vault health changes during the session
4. `/agents-team`
   - treats the choice as routing scope selection, not generic "team" wording
   - reports the current routing scope after selection using the shared routing label
5. installed-package release smoke
   - validates the routing wording against the same user-visible contract

## Wording constraints

- Do **not** imply that `pi-society-orchestrator` owns the execution runtime.
- Do **not** regress to stale footer/status wording such as `orchestra` or `Team: ...` for the operator-facing runtime surfaces covered here.
- Prefer `Routing` when describing the active agent-scope selection.
- Keep footer/status wording short; put richer explanation in `/runtime-status` and docs.
- Protect routing visibility before optional health badges, model, and finally the seam when compacting the footer.

## Change rule

If you change operator-visible runtime wording in this package, update all of:
- `src/runtime/status-semantics.ts`
- `extensions/society-orchestrator.ts`
- `tests/runtime-shared-paths.test.mjs`
- `scripts/release-smoke.mjs` when installed-package wording assertions change
- this document and `README.md` when the human-facing contract changes
