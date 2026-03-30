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
| B3 | Implement the chosen execution-plane path: ASC-owned public execution contract first, extraction only as fallback | 5 | 4 | 3 | Q1 | Still the right execution-plane direction, but after Phase A evidence is explicit |
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
     - File change: append matrix findings to `docs/adr/0001-control-plane-boundaries.md`

#### T2 — Lock execution-plane direction after Phase A (`B3`, `B10`)
- **Depends on:** T1
- **Validation:** execution seam avoids private source imports, keeps dependency graph acyclic, and does not confuse UI helpers with runtime lifecycle ownership
- Leaf actions:
  1. **Record execution-plane decision and criteria**
     - File change: upkeep `docs/adr/0001-control-plane-boundaries.md`
  2. **Draft ASC public execution contract proposal**
     - File change: `docs/project/2026-03-10-rfc-asc-public-execution-contract.md`
  3. **Record the rule for presentation helpers**
     - File change: append to `docs/adr/0001-control-plane-boundaries.md`

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
     - File change: upkeep seam section in `docs/adr/0001-control-plane-boundaries.md`
  2. **Draft seam-level rollout plan**
     - File change: append rollout section to `docs/project/2026-03-10-architecture-convergence-backlog.md`
  3. **Draft contract harness design**
     - File change: append harness section to `docs/project/2026-03-10-architecture-convergence-backlog.md`
  4. **Run package validation after doc/code changes**
     - Command: `npm run check`

## Immediate safe leaves executed in this planning slice

1. Created this planning artifact.
2. Drafted a proposed ADR for control-plane boundaries.
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

## Immediate next leaves after Phase A

1. Review/socialize the drafted ASC-owned public execution contract proposal and turn it into either an ASC implementation slice or an upstream/internal issue.
2. Continue with the **remaining raw society read/query family** (`society_query`, `/evidence`) now that ontology reads are on the `rocs-cli` adapter path.
3. Keep presentation helpers local unless a second real consumer proves extraction pressure.
4. Continue to defer prompt-plane seam selection until the upstream `pi-vault-client` boundary lands.

## Execution-plane implementation checklist

- [ ] Define the ASC public execution contract surface (runtime primitives only; no `self`-specific consumer imports)
- [ ] Decide whether ASC can expose that surface via package exports without leaking extension bootstrapping concerns
- [ ] If yes, plan orchestrator adoption against that contract
- [ ] If no, open extraction follow-up for a smaller shared execution runtime derived from ASC
- [ ] Deprecate orchestrator-local duplicate dispatch paths only after replacement seam is proven

## Current raw access inventory and migration ledger

| Current location | Current behavior | Intended canonical replacement | Status |
|---|---|---|---|
| `extensions/society-orchestrator.ts` (`society_query`, `/evidence`) | `SOCIETY_DB` + `querySociety` against raw sqlite for read-side diagnostics and evidence listing | `ak`-backed society-state adapter / explicit diagnostic exception if truly needed | pending |
| `src/runtime/cognitive-tools.ts` | local prompt-vault lookup via `dolt sql` | deferred prompt-plane review against upstream `pi-vault-client` Vault execution boundary | deferred-upstream |
| `src/runtime/evidence.ts` | evidence writes now route through shared `recordEvidence(...)` with `ak` first and explicit SQL fallback | canonical `ak` evidence path only (or explicit audited fallback) | partial |
| `extensions/society-orchestrator.ts` + `src/runtime/ontology.ts` | ontology reads now resolve through shared ROCS build/id-index artifacts instead of local SQL table assumptions | `rocs-cli`-backed ontology adapter | complete |

### Inventory command used

```bash
rg -n "sqlite3|dolt sql|society\.db|querySociety|queryDoltJson|recordEvidence\(|ontology_context|registerCommand\(\"ontology\"" extensions src -g '!node_modules'
```
