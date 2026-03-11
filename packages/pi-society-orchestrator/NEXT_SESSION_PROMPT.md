---
summary: "Handoff prompt for package pi-society-orchestrator inside monorepo workspace."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep package behavior stable while aligning to monorepo contracts."
  engine: "Validate package baseline -> implement focused slice -> update docs/checkpoint."
  fog: "Biggest risk is package/local fixes that diverge from monorepo conventions."
---

# Next session prompt for pi-society-orchestrator

## Session objective

Continue the architecture-convergence slice after the **atomic completion pass** on evidence writes.

What is now true:

- `cognitive_dispatch` no longer writes evidence through a bespoke direct SQL insert
- evidence writes are centralized behind shared `recordEvidence(...)`
- that helper is now **`ak`-first** with an explicit SQL fallback
- `runAk(...)`, sqlite access, and dolt access now route through a shared no-shell command boundary instead of interpolated shell strings
- `society_query` is now a **read-only** diagnostic escape hatch (`SELECT` / `EXPLAIN` / `PRAGMA` only)
- ontology lookups now escape literals/patterns instead of interpolating raw search strings
- loop dispatch now applies shared agent profiles plus real cognitive-tool loading from the vault
- package-local `tsconfig.json` + regression tests are present, so `npm run check` now exercises real typecheck/test lanes
- final prompt-plane seam decisions are **still deferred** until the upstream `pi-vault-client` Vault execution boundary lands and can be reviewed

## Primary artifacts to read first

- `docs/dev/plans/2026-03-10-architecture-backlog.md`
- `docs/dev/plans/2026-03-10-ui-capability-discovery.md`
- `docs/dev/plans/2026-03-10-asc-public-execution-contract.md`
- `docs/decisions/2026-03-10-control-plane-boundaries.md`
- `README.md`

## Immediate focus order

1. review/socialize the drafted **ASC-owned public execution contract** proposal and turn it into either:
   - an ASC implementation slice, or
   - an upstream/internal issue with the same contract shape
2. choose the **next** raw society/ontology bypass family and map it toward the canonical adapter path
   - first candidates:
     - `society_query` + `/evidence` raw society-state reads
     - `ontology_context` + `/ontology` raw ontology SQL reads
3. keep reusable presentation helpers local unless a second real consumer proves extraction pressure; continue consuming generic Pi UI primitives directly
4. continue to defer prompt-plane seam finalization until the upstream `pi-vault-client` boundary is implemented and reviewed

## Deferred contracts currently in force

| Finding | Rationale | Owner | Trigger | Deadline | Blast Radius |
|---|---|---|---|---|---|
| `recordEvidence(...)` still has SQL fallback | Removing fallback now would exceed risk tolerance without a live smoke proving `ak evidence record` is sufficient in target runtime environments | `pi-society-orchestrator` package maintainer | successful live smoke of `ak`-only evidence writes | 2026-03-17 | evidence semantics can still drift from the canonical adapter path |
| `society_query` and `/evidence` still use raw society DB reads | Shell injection is now removed and `society_query` is read-only, but the package still owns a temporary sqlite read surface until a canonical read/query boundary exists | `pi-society-orchestrator` package maintainer with `agent-kernel` maintainer review | decision on canonical society read/query boundary | 2026-03-24 | read-side schema drift and continued raw DB coupling |
| `ontology_context` and `/ontology` still use raw SQL table assumptions | Literal/pattern injection is now hardened, but the paths still depend on the local ontology SQL shape until a sanctioned adapter exists | `pi-society-orchestrator` package maintainer | public/sanctioned ontology adapter decision for orchestrator | 2026-03-24 | ontology behavior remains tied to accidental local SQL shape |
| Default fallback DB path is still legacy `~/ai-society/society.db` when neither `SOCIETY_DB` nor `AK_DB` is set | Flipping defaults now would widen blast radius while raw-read paths still exist | `pi-society-orchestrator` package maintainer | decision to fully adopt `AK_DB`/v2 default or completion of raw-read migration | 2026-03-24 | confusing default-DB behavior in environments expecting newer AK defaults |

## Package context

- workspace path: `packages/pi-society-orchestrator`
- release component key: `pi-society-orchestrator`
- primary extension entry: `extensions/society-orchestrator.ts`

## Quick start

```bash
# from package directory
npm run docs:list
npm run check
npm run release:check:quick
```

## Session checklist

1. Read `AGENTS.md` and relevant docs.
2. Implement one scoped change.
3. If you surface a new finding, either resolve it in the same pass or add a full deferral contract.
4. Run `npm run docs:list` if docs changed.
5. Run `npm run check`.
6. If release surface changed, run `npm run release:check:quick`.
7. Update docs and this handoff prompt.
