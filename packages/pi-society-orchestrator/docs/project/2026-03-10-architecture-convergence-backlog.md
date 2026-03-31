---
summary: "Scored backlog and HTN for converging pi-society-orchestrator toward canonical package boundaries."
read_when:
  - "Starting the architecture-convergence slice for pi-society-orchestrator."
  - "Need the ranked backlog, HTN, and immediate safe next steps for cross-package alignment."
system4d:
  container: "Focused planning artifact for package-level architecture work."
  compass: "Reduce boundary drift by clarifying ownership before code movement."
  engine: "score backlog -> choose Q1/Q2 -> express HTN -> execute safe leaves -> validate."
  fog: "Without an explicit backlog, code changes will duplicate existing package capabilities."
---

# Architecture backlog — 2026-03-10

## Goal

Converge `packages/pi-society-orchestrator` toward a clean layered architecture where:

- `ak` owns society-state access
- `rocs-cli` owns ontology access
- `pi-vault-client` owns prompt-vault access
- `pi-autonomous-session-control` owns execution-plane / subagent runtime concerns
- `pi-society-orchestrator` owns coordination intelligence only

## Sequencing update

Prompt-plane finalization is intentionally **deferred** until the upstream `pi-vault-client` NEXUS slice lands its explicit Vault execution boundary. Work that does **not** depend on that boundary should proceed now.

## Packet map

If you are here specifically for the subagent/runtime boundary, do **not** start by rereading this file in isolation.
Start with [subagent-execution-boundary-map.md](subagent-execution-boundary-map.md), then move outward to the evidence note, ADR, RFC, and finally this backlog.

## Phase A completion snapshot — 2026-03-10

Phase A is now explicit in package docs and architecture notes:

- upstream Pi / `pi-mono` already owns generic extension UI primitives (`setWidget`, `setFooter`, overlays, custom editors)
- `pi-interaction` owns interaction-runtime concerns (editor mounting, trigger broker, picker/selection flows), not all extension UI
- ASC remains the strongest execution-plane owner
- `pi-vs-claude-code` is a pattern repo, not a canonical runtime owner
- no dedicated UI-helper extraction is justified yet

Status update:

- `B1` complete in substance via `docs/project/2026-03-10-ui-capability-discovery.md`
- `B2` complete in substance via the discovery matrix + ADR update path
- `B5` complete in substance via the README/control-plane charter refresh

## Scored backlog

| ID | Task | I | U | D | Quadrant | Notes |
|---|---|---:|---:|---:|---|---|
| B1 | Run Phase A capability discovery across `pi-mono`, `pi-interaction`, ASC, and `pi-vs-claude-code` | 5 | 5 | 2 | Q1 | Needed before any confident UI/extraction decision |
| B2 | Publish a UI/runtime ownership matrix separating generic UI, interaction runtime, execution runtime, and control plane | 5 | 5 | 3 | Q1 | Converts discovery into durable architecture truth |
| B3 | Implement the chosen execution-plane path: ASC-owned public execution contract first, extraction only as fallback | 5 | 4 | 3 | Q1 | Still the right execution-plane direction; after packet reconciliation it now decomposes cleanly into AK tasks `#604` -> `#605` -> `#606` |
| B4 | Replace local raw society/ontology access with canonical adapters (`ak`, `rocs-cli`) | 5 | 4 | 4 | Q1 | Can proceed without prompt-plane finalization |
| B5 | Re-scope orchestrator charter/README to coordination-only and reference generic upstream UI primitives instead of implying local ownership | 4 | 4 | 2 | Q1 | Prevents new drift while discovery/contract work proceeds |
| B6 | Review the upstream `pi-vault-client` Vault execution boundary after it lands, then choose the prompt-plane seam | 5 | 2 | 4 | Q2 | Intentionally blocked on upstream implementation |
| B7 | Add orchestrator boundary-hardening layer inspired by ASC ECK | 4 | 3 | 4 | Q2 | Valuable after ownership/seam decisions |
| B8 | Build cross-package contract harness (`vault-client -> ASC -> orchestrator`) | 4 | 3 | 4 | Q2 | Best proof once seams are fixed |
| B9 | Plan strangler rollout with seam-level feature flags + rollback points | 4 | 3 | 3 | Q2 | Needed before code migration lands |
| B10 | Decide whether any reusable presentation helpers belong in `pi-interaction`, a dedicated UI helper package, or should stay local for now | 4 | 2 | 3 | Q2 | Must follow Phase A; likely no extraction yet |
| B11 | Centralize prompt-vault compatibility truth after the upstream boundary becomes canonical | 4 | 2 | 3 | Q2 | Should follow upstream implementation instead of preempting it |
| B12 | Remove or rename `society_query` diagnostic escape hatch after canonical adapters exist | 3 | 2 | 3 | Q4 | Depends on adapter migration |

## HTN

### G0 — Align `pi-society-orchestrator` to canonical layered package boundaries with Phase A evidence first

#### T1 — Gather capability evidence before new extraction decisions (`B1`, `B2`)
- **Depends on:** none
- **Validation:** discovery covers upstream generic UI, interaction runtime, execution runtime, and pattern repos separately
- Leaf actions:
  1. **Create Phase A discovery artifact**
     - File change: `docs/project/2026-03-10-ui-capability-discovery.md`
  2. **Read and compare canonical sources**
     - Commands:
       - `read ../pi-interaction/pi-interaction/README.md`
       - `read ../pi-autonomous-session-control/README.md`
       - `read /home/tryinget/ai-society/softwareco/contrib/pi-mono/packages/coding-agent/docs/extensions.md`
       - `read /home/tryinget/ai-society/softwareco/contrib/pi-mono/packages/tui/README.md`
       - `read /home/tryinget/ai-society/softwareco/contrib/pi-vs-claude-code/README.md`
  3. **Convert evidence into a UI/runtime ownership matrix**
     - File change: append matrix findings to `docs/adr/2026-03-11-control-plane-boundaries.md`

#### T2 — Lock execution-plane direction after Phase A (`B3`, `B10`)
- **Depends on:** T1
- **Validation:** execution seam avoids private source imports, keeps dependency graph acyclic, and does not confuse UI helpers with runtime lifecycle ownership
- Leaf actions:
  1. **Record execution-plane decision and criteria**
     - File change: upkeep `docs/adr/2026-03-11-control-plane-boundaries.md`
  2. **Draft ASC public execution contract proposal**
     - File change: `docs/project/2026-03-10-rfc-asc-public-execution-contract.md`
  3. **Record the rule for presentation helpers**
     - File change: append to `docs/adr/2026-03-11-control-plane-boundaries.md`

#### T3 — Canonicalize backend adapters not blocked on upstream vault work (`B4`, `B5`)
- **Depends on:** T1, T2
- **Validation:** local raw society/ontology access points mapped one-for-one to canonical adapter boundaries; prompt-plane paths isolated into an explicit deferred bucket
- Leaf actions:
  1. **Inventory current local access points**
     - Command: `rg -n "sqlite3|dolt sql|society.db|ontology WHERE|queryVaultJson|querySociety|execSociety" extensions src -g '!node_modules'`
  2. **Map each access point to a canonical replacement or deferred upstream review**
     - File change: add migration ledger to `docs/project/2026-03-10-architecture-convergence-backlog.md`
  3. **Open code slice to route one boundary at a time**
     - File changes: `extensions/society-orchestrator.ts`, `src/loops/engine.ts`

#### T4 — Prepare migration safety nets (`B6`, `B7`, `B8`, `B9`, `B11`)
- **Depends on:** T2, T3
- **Validation:** rollout path has rollback instructions; harness plan proves chosen seams without private imports
- Leaf actions:
  1. **Record prompt-plane deferral and review gate**
     - File change: upkeep seam section in `docs/adr/2026-03-11-control-plane-boundaries.md`
  2. **Draft seam-level rollout plan**
     - File change: append rollout section to `docs/project/2026-03-10-architecture-convergence-backlog.md`
  3. **Draft contract harness design**
     - File change: append harness section to `docs/project/2026-03-10-architecture-convergence-backlog.md`
  4. **Run package validation after doc/code changes**
     - Command: `npm run check`

## Immediate safe leaves executed in this planning slice

1. Created this planning artifact.
2. Drafted the first version of the control-plane boundaries ADR.
3. Updated `next_session_prompt.md` to point the next session at the new architecture artifacts.
4. Ran `npm run check` after doc updates.
5. Inventoried current local raw access points in `extensions/society-orchestrator.ts`.
6. Added a dedicated Phase A discovery artifact for UI/runtime capability mapping.
7. Updated the backlog + HTN to make information gathering explicit before new UI/extraction decisions.
8. Updated `next_session_prompt.md` again so the next session starts with Phase A capability discovery.
9. Validated Phase A against upstream Pi docs/examples, `pi-interaction` package boundaries/runtime code, ASC status, and `pi-vs-claude-code` pattern extensions.
10. Published an explicit ownership matrix separating generic UI, interaction runtime, execution runtime, pattern reuse, and control-plane ownership.
11. Re-scoped package docs toward a coordination/control-plane charter.
12. Updated the session handoff so the next slice starts from the completed Phase A picture instead of rediscovering it.
13. Drafted an ASC-owned public execution contract proposal at `docs/project/2026-03-10-rfc-asc-public-execution-contract.md`.
14. Routed `cognitive_dispatch` evidence recording through a shared `ak`-first helper instead of a direct raw SQL insert, while keeping an explicit SQL fallback path.
15. Aligned `runAk(...)` to the extension's configured society DB (`SOCIETY_DB`/`AK_DB`) so canonical-path evidence writes do not silently target a different database than the remaining raw paths.
16. Moved `/evidence` onto `ak evidence search` and isolated `society_query` behind a dedicated bounded diagnostic-exception helper in `src/runtime/society.ts`.

## Immediate next leaves after packet reconciliation

1. Treat `#604`, `#605`, and `#606` as complete execution-plane history:
   - ASC public execution seam published
   - parity harness landed
   - orchestrator cut over and retired the duplicate spawn/runtime path
2. Continue the narrower remaining society/evidence cleanup separately; do not let it reopen the execution-plane ownership question.
3. If execution-seam work resumes, constrain it to the remaining bundled publish/install bridge or a newly proven consumer gap.
4. Keep presentation helpers local unless a second real consumer proves extraction pressure.
5. Continue to defer prompt-plane seam selection until the upstream `pi-vault-client` boundary lands.

## Current execution-plane packet after docs reconciliation

AK is the execution authority for the subagent/runtime wave, and that core packet is now complete:

1. `#604` — exposed the ASC public execution contract for non-tool consumers
2. `#605` — added the parity harness proving the new runtime path matches `dispatch_subagent`
3. `#606` — adopted the ASC runtime in orchestrator and retired the duplicate path

Dependency order that landed:

```text
#604 -> #605 -> #606
```

That was the smallest truthful execution-plane wave implied by the ADR + RFC packet.
Follow-up work should stay constrained to post-cutover packaging/runtime hygiene rather than reopening ownership or starting with dashboard polish.

## Post-cutover seam stewardship backlog — 2026-03-31

Goal for this wave:
- keep the new ASC public execution seam justified, minimal, and removable
- prevent drift back to duplicated runtime logic or private-source consumer imports
- separate package-local contract truth from installed-package truth

### Scored backlog

| ID | Task | I | U | D | Quadrant | Notes |
|---|---|---:|---:|---:|---|---|
| SB1 | Publish an explicit execution seam charter with removal criteria | 5 | 5 | 2 | Q1 | Answers why the seam exists and prevents abstraction creep |
| SB2 | Add a real consumer capability map for the seam | 4 | 4 | 2 | Q1 | Keeps the public surface tied to actual callers instead of imagined ones |
| SB3 | Promote transport-safety invariants to named contract truth | 5 | 4 | 3 | Q1 | Prevents parity-only testing from hiding shared defects |
| SB4 | Add seam-change guardrails against private ASC imports and orchestrator-local runtime revival | 4 | 4 | 2 | Q1 | Stops architectural backsliding |
| SB5 | Split verification policy into package-local contract checks vs installed-package smoke | 5 | 3 | 2 | Q2 | Same seam, different truth layers |
| SB6 | Decide how long the bundled ASC publish/install bridge should remain | 5 | 3 | 3 | Q2 | Important, but not a same-day blocker |
| SB7 | Add a negative-path checklist for future seam changes | 4 | 3 | 1 | Q2 | Implemented via [execution contract change checklist](../../pi-autonomous-session-control/docs/project/execution-contract-change-checklist.md) |
| SB8 | Normalize failure taxonomy exposed through execution results | 4 | 3 | 3 | Q2 | Improves operator/debug truth without reopening ownership |
| SB9 | Schedule a time-boxed seam review after release evidence accumulates | 4 | 2 | 1 | Q2 | Keeps the seam evidence-driven instead of permanent-by-default |
| SB10 | Expand consumer inventory only if a second real external caller appears | 3 | 1 | 2 | Q4 | Useful later, not now |

### Immediate safe leaves executed in this stewardship slice

1. Created [execution seam charter](2026-03-31-execution-seam-charter.md).
2. Linked the charter from [subagent-execution-boundary-map.md](subagent-execution-boundary-map.md).
3. Updated [ASC public execution contract](../../pi-autonomous-session-control/docs/project/public-execution-contract.md) to state why the seam exists and which transport-safety invariants it carries.
4. Recorded this scored post-cutover backlog so future work starts from stewardship rather than re-litigating seam existence.
5. Added the companion [execution contract change checklist](../../pi-autonomous-session-control/docs/project/execution-contract-change-checklist.md) so future seam edits stay tied to real failure modes and the current proof obligations.

## Execution-plane implementation checklist

- [x] Define the ASC public execution contract surface (runtime primitives only; no `self`-specific consumer imports)
- [x] Decide whether ASC can expose that surface via package exports without leaking extension bootstrapping concerns
- [x] Plan and land orchestrator adoption against that contract
- [ ] Keep the temporary bundled publish/install bridge only until a more durable release story exists
- [x] Deprecate orchestrator-local duplicate dispatch paths after the replacement seam is proven

## Current raw access inventory and migration ledger

| Current location | Current behavior | Intended canonical replacement | Status |
|---|---|---|---|
| `extensions/society-orchestrator.ts` + `src/runtime/society.ts` (`society_query`, `/evidence`) | `/evidence` now uses `ak evidence search`; `society_query` remains a dedicated raw sqlite diagnostic exception helper | canonical AK read/query surface when it exists; until then keep only the bounded diagnostic exception | partial |
| `src/runtime/cognitive-tools.ts` | local prompt-vault lookup via `dolt sql` | deferred prompt-plane review against upstream `pi-vault-client` Vault execution boundary | deferred-upstream |
| `src/runtime/evidence.ts` | evidence writes now route through shared `recordEvidence(...)` with `ak` first and explicit SQL fallback | canonical `ak` evidence path only (or explicit audited fallback) | partial |
| `extensions/society-orchestrator.ts` + `src/runtime/ontology.ts` | ontology reads now resolve through shared ROCS build/id-index artifacts instead of local SQL table assumptions | `rocs-cli`-backed ontology adapter | complete |

### Inventory command used

```bash
rg -n "sqlite3|dolt sql|society\.db|querySociety|queryDoltJson|recordEvidence\(|ontology_context|registerCommand\(\"ontology\"" extensions src -g '!node_modules'
```
