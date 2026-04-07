---
summary: "Handoff prompt for pi-society-orchestrator after the fail-closed routing, session-identity, execution-status, resource/lifecycle hardening, headless installed-runtime smoke, unified execution/evidence, rocs-backed ontology-adapter, lower-plane boundary hardening, docs/AGENTS monorepo-alignment, and society-read boundary-exception passes. The next bounded work is the narrower remaining architecture convergence."
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

Resume after the **fail-closed routing + session-identity + execution-status + resource/lifecycle hardening + headless installed-runtime smoke + unified execution/evidence + rocs-backed ontology adapter + lower-plane boundary hardening + society-read boundary exception + ASC public-runtime cutover** passes.

The next bounded work is:
1. continue the narrower remaining architecture-convergence backlog now that `/evidence` is on AK and only the `society_query` diagnostic exception remains on raw sqlite
2. if the operator explicitly revisits the execution seam, treat the main cutover plus the first post-cutover review as landed history and only open the remaining follow-up if new evidence justifies it (`#629` after `#628`, not by default) instead of reopening runtime ownership

## What is now true

### Shared runtime hardening landed
- `cognitive_dispatch` and loop execution share package-local runtime helpers for:
  - agent/team routing
  - subagent prompt composition
  - ASC public execution-runtime dispatch
  - `ak` execution
- orchestrator no longer carries a second local Pi-subagent spawn/runtime implementation; `src/runtime/subagent.ts` is now a consumer-side adapter over `pi-autonomous-session-control/execution`.
- the adapter still preserves package-local timeout/output policy (`PI_ORCH_SUBAGENT_TIMEOUT_MS`, `PI_ORCH_SUBAGENT_OUTPUT_CHARS`) around the ASC-owned seam so release smoke and operator-visible behavior stay truthful during the cutover.
- the adapter now also preserves ASC's normalized failure taxonomy (`result.details.status` + `failureKind`) so direct dispatch and loop consumers can distinguish timeout, abort, assistant-protocol, parse, transport, and pre-execution guardrail failures without recreating ASC-local classification logic.
- runtime `sqlite3`, `dolt`, and `rocs-cli` reads now flow through async, timeout-bound supervised helper boundaries instead of synchronous runtime `execFileSync` calls.
- `society_query` is now an explicit bounded diagnostic surface routed through `src/runtime/society.ts`; mutating SQL and mutating `PRAGMA` forms are rejected, and valid read-only `WITH ... SELECT ...` diagnostics are now accepted.
- `ontology_context` and `/ontology` now resolve through a shared `rocs-cli` adapter path that consumes ROCS build/index artifacts instead of querying the local `society.db` ontology table directly.
- deterministic ROCS adapter coverage now exists in `tests/ontology-adapter.test.mjs` for concept-id, label, definition-text, failure-path, and timeout behavior.
- `/evidence` now reads through `ak evidence search` instead of raw sqlite evidence queries.
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

### Operator-visible runtime truth follow-through landed
- user-facing routing now presents the internal `full` scope as `all agents` across `/agents-team`, `/runtime-status`, startup copy, footer text, and installed-package smoke
- the session footer now renders prioritized slots: compact `DB`/`Vault` health badges are optional, narrow widths drop badges first and then the seam before sacrificing routing visibility, and extremely narrow widths fall back to routing-only rendering
- footer health badges are no longer frozen at startup; rerenders can refresh Vault health after startup drift so the footer converges back toward `/runtime-status` truth
- `tests/runtime-shared-paths.test.mjs` now covers wide, compact, narrow, and startup-drift footer behavior while `npm run release:check` still proves the installed-package footer contract

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

### Execution-boundary cutover landed
- `cognitive_dispatch` and `loop_execute` now consume ASC's public execution contract instead of the old orchestrator-local spawn/process path.
- installed-package release validation now bundles `pi-autonomous-session-control` into the orchestrator tarball so the public seam remains installable before a registry-backed dependency cutover exists.
- `scripts/release-check.sh` and `scripts/release-smoke.mjs` now account for that bundled-package bridge while proving guarded-bootstrap, timeout, truncation, and team-mismatch behavior against the installed tarball.
- the bridge lifecycle, exit criteria, and review trigger are now explicit in `docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md`; bundling remains temporary rather than open-ended.
- seam verification layers are now explicit: ASC package-local tests prove contract semantics, `tests/runtime-shared-paths.test.mjs` proves the narrow consumer-side adapter, and `npm run release:check` proves packaged/imported install behavior.

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
- installed-package headless guarded-bootstrap smoke
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
- asserts the guarded-bootstrap `ak repo bootstrap` call plus the expected evidence-write argv in the fake `ak` path
- no longer depends on `~/.pi/agent/auth.json` or a live provider-backed prompt execution host
- is complemented by a separate live Pi-host proof note in `docs/project/2026-04-01-guarded-bootstrap-verification.md`

Treat this as packaged-install proof, not the primary source of seam semantics; the contract truth still lives in ASC's package-local tests plus `tests/runtime-shared-paths.test.mjs`.

Monorepo/root release-component validation was not rerun for this package-only society-read slice; rerun it if the next session touches root release wiring:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
node ./scripts/release-components.mjs validate
node --test ./scripts/release-components.test.mjs
```

## Primary artifacts to read first

Read these first before choosing the next change:
- `AGENTS.md`
- `README.md`
- `docs/project/subagent-execution-boundary-map.md` (when the operator is asking about subagent/runtime ownership or the ASC public execution seam)
- `docs/project/2026-03-31-execution-seam-charter.md` (when the question is why the seam exists, how small it should stay, or what follow-up is still legitimate)
- `docs/project/2026-03-31-execution-seam-review.md` (when the question is whether the seam still earns its keep and how many real consumers it has today)
- `docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md` (when the question is how long bundling may remain or what evidence retires it)
- `docs/project/2026-03-11-hermetic-installed-release-smoke.md`
- `docs/project/2026-03-11-rfc-unified-execution-evidence-contract.md`
- `docs/project/2026-03-11-rfc-rocs-ontology-adapter.md`
- `src/runtime/execution-status.ts`
- `docs/project/2026-03-12-lower-plane-boundary-hardening.md`
- `docs/project/2026-03-30-society-read-boundary-exception.md`
- `src/runtime/evidence.ts`
- `src/runtime/ak.ts`
- `src/runtime/boundaries.ts`
- `src/runtime/ontology.ts`
- `src/runtime/society.ts`
- `src/runtime/process-supervisor.ts`
- `src/runtime/subagent.ts`
- `src/runtime/team-state.ts`
- `extensions/society-orchestrator.ts`
- `src/loops/engine.ts`
- `tests/runtime-shared-paths.test.mjs`
- `tests/cognitive-tools.test.mjs`
- `tests/ontology-adapter.test.mjs`
- `tests/society-runtime.test.mjs`
- `scripts/release-check.sh`
- `scripts/release-smoke.mjs`

Then re-open the broader architecture artifacts if the next session finishes the bounded cleanup pack or the operator explicitly pivots to the execution-plane seam:
- `docs/project/subagent-execution-boundary-map.md`
- `docs/project/2026-03-10-architecture-convergence-backlog.md`
- `docs/project/2026-03-10-ui-capability-discovery.md`
- `docs/project/2026-03-10-rfc-asc-public-execution-contract.md`
- `docs/adr/2026-03-11-control-plane-boundaries.md`

## Immediate focus order

1. **Resume broader architecture convergence**
   - decide whether the remaining `society_query` raw sqlite path should survive as a bounded diagnostic exception until AK grows a truthful canonical read/query surface, or be tightened further
   - revisit whether `recordEvidence(...)` can drop SQL fallback after broader confidence in `ak`-only behavior
   - keep prompt-plane seam finalization deferred until the upstream `pi-vault-client` execution boundary is reviewed
2. **If the operator explicitly chooses the subagent/runtime seam, switch to the post-cutover stewardship packet**
   - start from `docs/project/subagent-execution-boundary-map.md`, `docs/project/2026-03-31-execution-seam-charter.md`, `docs/project/2026-03-31-execution-seam-review.md`, and `docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md`
   - treat `#604 -> #605 -> #606`, `#622`, `#623`, `#624`, `#625`, `#627`, and `#628` as landed history, not active backlog
   - open the later consumer-inventory pass (`#629`) only if a second real external runtime consumer or another evidence-backed seam gap appears
3. **Optional parity hardening after architecture work is scoped**
   - decide whether to add broader live-host `/reload` parity checks beyond the deterministic release-smoke harness and the already-captured guarded-bootstrap live smoke in `docs/project/2026-04-01-guarded-bootstrap-verification.md`

## Deferred contracts currently in force

| Finding | Rationale | Owner | Trigger | Deadline | Blast Radius |
|---|---|---|---|---|---|
| Installed-package release-check smoke is now headless and isolated from the default global npm package space, and guarded-bootstrap has one captured live Pi-host proof, but routine release validation still does not prove broad interactive `/reload` parity in a normal Pi host session | The installed-package harness now verifies installed extension behavior without auth/provider drift or default-global npm mutation, and the guarded-bootstrap path has one separate live-host evidence note, but routine validation still intentionally drives tools/commands through a stub instead of exercising full interactive host lifecycle behavior | `pi-society-orchestrator` package maintainer | decision to add a broader live-host parity check or accept the current split between deterministic release smoke plus the bounded guarded-bootstrap live proof | before `0.2.0` behavior freeze | release-check can still miss host-only integration drift around reload/session wiring even when installed-package smoke is green |
| Orchestrator tarballs currently bundle `pi-autonomous-session-control` | The bridge lifecycle is now decided: keep bundling only as a temporary installability shim until ASC has registry-backed release evidence and orchestrator can remove bundle lifting in one truthful cutover; see `docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md` | `pi-society-orchestrator` package maintainer with `pi-autonomous-session-control` maintainer review | first ASC publish evidence, any packaging change that would prolong bundling, or the pre-`0.2.0` behavior-freeze review | before `0.2.0` behavior freeze | package size, install topology, and smoke-harness complexity stay higher than ideal until the cutover lands, but the bridge no longer lacks exit criteria |
| `recordEvidence(...)` still has SQL fallback | Package hardening is much stronger, but removing fallback now still exceeds risk tolerance before a broader confidence pass on `ak`-only evidence writes | `pi-society-orchestrator` package maintainer | successful broader live/runtime proof of `ak evidence record` sufficiency | 2026-03-17 | evidence semantics can still drift from the canonical adapter path |
| `society_query` still uses a bounded raw society DB read exception | `/evidence` now uses `ak evidence search`, but `society_query` still depends on a narrow raw sqlite diagnostic path until a truthful canonical read/query boundary exists | `pi-society-orchestrator` package maintainer with `agent-kernel` maintainer review | decision on canonical society read/query boundary or explicit retention/removal of the diagnostic exception | 2026-03-31 | residual read-side schema drift and continued raw DB coupling for one escape hatch |
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
