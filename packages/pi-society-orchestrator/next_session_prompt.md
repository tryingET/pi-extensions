---
summary: "Handoff prompt for pi-society-orchestrator after the fail-closed routing, session-identity, execution-status, resource/lifecycle hardening, headless installed-runtime smoke, unified execution/evidence, rocs-backed ontology-adapter, lower-plane boundary hardening, and docs/AGENTS monorepo-alignment passes. The next bounded work is the remaining architecture convergence."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep package runtime behavior truthful, bounded, and release-safe while continuing convergence toward clearer control-plane boundaries."
  engine: "Re-establish current package truth -> attack the next bounded pack atomically -> validate -> update docs/handoff."
  fog: "Biggest risk is resuming from stale pre-hardening assumptions or scattering effort across old architecture threads and new runtime-contract cleanup at the same time."
---

# Next session prompt for pi-society-orchestrator

## Session objective

Resume after the **fail-closed routing + session-identity + execution-status + resource/lifecycle hardening + headless installed-runtime smoke + unified execution/evidence + rocs-backed ontology adapter + lower-plane boundary hardening** passes.

The next bounded work is:
1. continue the remaining architecture-convergence backlog from the now-completed ontology slice

## What is now true

### Shared runtime hardening landed
- `cognitive_dispatch` and loop execution share package-local runtime helpers for:
  - agent/team routing
  - subagent prompt composition
  - Pi subagent spawning
  - `ak` execution
- runtime `sqlite3`, `dolt`, and `rocs-cli` reads now flow through async, timeout-bound supervised helper boundaries instead of synchronous runtime `execFileSync` calls.
- `society_query` is now a read-only diagnostic surface; mutating SQL and mutating `PRAGMA` forms are rejected, and valid read-only `WITH ... SELECT ...` diagnostics are now accepted.
- `ontology_context` and `/ontology` now resolve through a shared `rocs-cli` adapter path that consumes ROCS build/index artifacts instead of querying the local `society.db` ontology table directly.
- deterministic ROCS adapter coverage now exists in `tests/ontology-adapter.test.mjs` for concept-id, label, definition-text, failure-path, and timeout behavior.
- prompt-vault lookup still uses package-local Dolt access, but through shared helper boundaries instead of ad hoc call sites, and cognitive-tool lookup by name is now cognitive-only.
- explicit `societyDb` targeting now outranks ambient `AK_DB` for `ak`-backed runtime paths.

### Agent/team policy is now fail-closed
- `AGENT_TEAMS.full` includes every registered agent profile.
- invalid team names fail closed instead of broadening to `full`.
- direct dispatch and loop execution now enforce team compatibility explicitly.
- loop/team incompatibilities fail before execution with a concrete mismatch report.

### Team state is now session-identity-scoped
- `/agents-team` persists by session identity rather than process-global mutable state.
- session identity precedence is now:
  1. `ctx.sessionKey`
  2. `ctx.sessionId`
  3. `ctx.sessionManager.sessionKey`
  4. `ctx.sessionManager.sessionId`
  5. `ctx.sessionManager.id`
  6. fallback to `sessionManager` object identity
- session-key-backed storage is capacity-bounded with oldest-key eviction.
- `/agents-team` now fails clearly when no session identity is available.

### Execution/evidence semantics are now explicit and shared
- execution outcome classification is centralized in `src/runtime/execution-status.ts`.
- execution/effect policy is centralized in `src/runtime/evidence.ts`.
- direct dispatch and loops now share one policy for:
  - abort => execution failure + skip evidence write
  - timeout => execution failure + fail evidence write
  - protocol/non-zero failure => execution failure + fail evidence write
  - non-abort, non-timeout `ak` evidence failure => SQL fallback eligible
  - aborted/timed-out evidence-write attempts => fail closed without SQL fallback
- loops now carry semantic per-phase status instead of inferring success from raw `exitCode` alone.
- malformed Pi event streams now surface as failures instead of success-shaped output.

### Process lifecycle hardening landed
- `ak` execution is abortable and timeout-bound.
- Pi subagent execution is abortable and timeout-bound.
- child-process stdout/stderr capture is bounded.
- subagent assistant-output capture is bounded.
- oversized unterminated Pi event buffers now fail explicitly instead of growing forever.

### Docs/AGENTS shape now matches monorepo reality better
- package-local docs now use `docs/project/` for dated RFCs/runbooks/notes and `docs/adr/` for adopted decisions instead of a package-local `docs/dev/` tree.
- package AGENTS/README now state explicitly that AK task/work-item operations for this package must go through the monorepo-root wrapper (`./scripts/ak.sh` from repo root, `../../scripts/ak.sh` from this package).
- the package template was updated in parallel so new monorepo package scaffolds inherit the same docs placement and AK-wrapper guidance.

### Release/runtime verification is now more hermetic
Package-local validation rerun for the current state:

```bash
npm run docs:list
npm run quality:ci
npm run release:check
```

That now covers:
- lint / typecheck / package tests
- package tarball file whitelist validation
- `npm publish --dry-run`
- isolated tarball install into Pi
- installed-package headless timeout smoke
- installed-package headless truncation smoke
- installed-package headless team-mismatch smoke

The installed-package smoke harness now:
- binds to the exact `PACKAGE_SPEC` recorded in isolated Pi settings
- installs into an isolated `NPM_CONFIG_PREFIX` instead of the default global npm package space
- verifies the installed package contents still match that tarball before execution
- loads the installed extension package instead of local source files
- drives registered tools/commands directly through a small Pi stub
- uses deterministic fake subagent / `ak` dependencies plus a temporary vault fixture
- asserts expected direct-dispatch evidence-write argv in the fake `ak` path
- no longer depends on `~/.pi/agent/auth.json` or a live provider-backed prompt execution host

Monorepo/root release-component validation was not rerun for this ontology-only slice; rerun it if the next session touches root release wiring:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
node ./scripts/release-components.mjs validate
node --test ./scripts/release-components.test.mjs
```

## Primary artifacts to read first

Read these first before choosing the next change:
- `AGENTS.md`
- `README.md`
- `docs/project/2026-03-11-hermetic-installed-release-smoke.md`
- `docs/project/2026-03-11-rfc-unified-execution-evidence-contract.md`
- `docs/project/2026-03-11-rfc-rocs-ontology-adapter.md`
- `src/runtime/execution-status.ts`
- `docs/project/2026-03-12-lower-plane-boundary-hardening.md`
- `src/runtime/evidence.ts`
- `src/runtime/ak.ts`
- `src/runtime/boundaries.ts`
- `src/runtime/ontology.ts`
- `src/runtime/process-supervisor.ts`
- `src/runtime/subagent.ts`
- `src/runtime/team-state.ts`
- `extensions/society-orchestrator.ts`
- `src/loops/engine.ts`
- `tests/runtime-shared-paths.test.mjs`
- `tests/cognitive-tools.test.mjs`
- `tests/ontology-adapter.test.mjs`
- `scripts/release-check.sh`
- `scripts/release-smoke.mjs`

Then re-open the broader architecture artifacts if the next session finishes the bounded cleanup pack:
- `docs/project/2026-03-10-architecture-convergence-backlog.md`
- `docs/project/2026-03-10-ui-capability-discovery.md`
- `docs/project/2026-03-10-rfc-asc-public-execution-contract.md`
- `docs/adr/0001-control-plane-boundaries.md`

## Immediate focus order

1. **Resume broader architecture convergence**
   - continue with the remaining raw society read/query family (`society_query`, `/evidence`) toward a sanctioned `ak`-backed path or an explicitly bounded diagnostic exception
   - revisit whether `recordEvidence(...)` can drop SQL fallback after broader confidence in `ak`-only behavior
   - keep prompt-plane seam finalization deferred until the upstream `pi-vault-client` execution boundary is reviewed
2. **Optional parity hardening after architecture work is scoped**
   - decide whether to add a separate live-host `/reload` parity check beyond the deterministic release-smoke harness

## Deferred contracts currently in force

| Finding | Rationale | Owner | Trigger | Deadline | Blast Radius |
|---|---|---|---|---|---|
| Installed-package release-check smoke is now headless and isolated from the default global npm package space, but routine release validation still does not prove interactive `/reload` parity in a normal Pi host session | The installed-package harness now verifies installed extension behavior without auth/provider drift or default-global npm mutation, but it intentionally drives tools/commands through a stub instead of exercising full interactive host lifecycle behavior | `pi-society-orchestrator` package maintainer | decision to add a separate live-host parity check or accept the current split between deterministic release smoke and manual interactive verification | before `0.2.0` behavior freeze | release-check can still miss host-only integration drift around reload/session wiring even when installed-package smoke is green |
| `recordEvidence(...)` still has SQL fallback | Package hardening is much stronger, but removing fallback now still exceeds risk tolerance before a broader confidence pass on `ak`-only evidence writes | `pi-society-orchestrator` package maintainer | successful broader live/runtime proof of `ak evidence record` sufficiency | 2026-03-17 | evidence semantics can still drift from the canonical adapter path |
| `society_query` and `/evidence` still use raw society DB reads | Injection/mutation hardening and async supervised sqlite boundaries are now in place, but the package still owns a temporary sqlite read surface until a canonical read/query boundary exists | `pi-society-orchestrator` package maintainer with `agent-kernel` maintainer review | decision on canonical society read/query boundary | 2026-03-24 | read-side schema drift and continued raw DB coupling |
| ROCS adapter defaults currently assume the local SoftwareCo ontology repo and `--workspace-ref-mode loose` | The sanctioned adapter is now in place, but the runtime still carries a local usability/default-policy choice that has not yet been ratified as the long-term canonical ROCS resolution contract for orchestrator | `pi-society-orchestrator` package maintainer with `rocs-cli` maintainer review | decision on strict-vs-loose ROCS workspace resolution policy for orchestrator | 2026-03-24 | ontology lookups can drift from tagged refs in mixed local worktrees even though they no longer depend on raw SQL shape |
| Prompt-vault access still uses local Dolt queries | Shared helper boundaries now exist, but canonical prompt-plane ownership still depends on the upstream `pi-vault-client` execution boundary | `pi-society-orchestrator` package maintainer with `pi-vault-client` maintainer review | reviewed upstream `pi-vault-client` Vault execution boundary | 2026-03-24 | prompt-plane ownership drift and future schema/behavior drift risk |
| `src/runtime/boundaries.ts` now centralizes more async boundary logic and the read-only SQL classifier in one file | The file is coherent after the boundary-hardening slice, but further growth will make runtime command supervision, sqlite/dolt adapters, and SQL classification harder to reason about in one place | `pi-society-orchestrator` package maintainer | next boundary-family addition or the `society_query` / `/evidence` canonical-adapter migration | before the next lower-plane boundary slice after 2026-03-24 | future boundary changes become slower and more error-prone if command runner + backend adapters + SQL classifier keep accreting together |
| Default DB behavior still depends on local env/default-path policy | Explicit per-call `societyDb` targeting now outranks ambient `AK_DB`, but package default DB-target discovery still remains a transitional policy while raw-read paths still exist | `pi-society-orchestrator` package maintainer | decision to fully adopt the newer canonical default path / env contract | 2026-03-24 | confusing DB-target behavior in mixed environments |

## Package context

- workspace path: `packages/pi-society-orchestrator`
- release component key: `pi-society-orchestrator`
- primary extension entry: `extensions/society-orchestrator.ts`

## Quick start

```bash
# from package directory
npm run docs:list
npm run check
npm run release:check

# when task/work-item state matters, use the monorepo-root AK wrapper
../../scripts/ak.sh --doctor
```

## Session checklist

1. Read `AGENTS.md`, `README.md`, this handoff, and the runtime helpers listed above.
2. Pick one bounded pack only.
3. If you surface a new finding, either resolve it in the same pass or add a full deferral contract.
4. Run `npm run docs:list` if docs changed.
5. Run `npm run check`.
6. If release/runtime surface changed, run `npm run release:check`.
7. Update `README.md` and this handoff prompt before stopping.
