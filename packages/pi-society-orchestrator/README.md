---
summary: "Overview and quickstart for the converging pi-society-orchestrator coordination package."
read_when:
  - "Starting work in packages/pi-society-orchestrator."
  - "You need the current control-plane charter for the imported society-orchestrator package."
system4d:
  container: "Monorepo package for the society-orchestrator Pi extension."
  compass: "Keep the imported brownfield extension runnable while converging on clean package boundaries."
  engine: "Understand charter -> inspect imported layout -> run checks -> install/test in Pi."
  fog: "The main risk is letting imported brownfield code imply long-term ownership of lower-plane concerns."
---

# pi-society-orchestrator

Coordination/control-plane orchestration for society workflows in Pi.

## Current charter

The target architecture for this package is:

- `pi-society-orchestrator` owns **coordination intelligence only**
- `ak` owns society-state access
- `rocs-cli` owns ontology access
- `pi-vault-client` owns prompt-vault access and governance
- `pi-autonomous-session-control` owns subagent execution/runtime behavior

Current-truth note:
- this package should still be treated as the **current package-local coordination/control-plane owner**, not the already-complete final runtime
- the broader target shape is now described in `~/ai-society/softwareco/owned/agent-kernel/docs/project/2026-03-21-rfc-governed-delegated-cognition-runtime.md`
- that RFC treats today's ASC + orchestrator split as a truthful precursor to a future Pi-native governed delegated cognition runtime, while keeping AK as canonical lineage/runtime authority and `society.v2.db` as the durable substrate
- in that target shape, Pi remains the outer governed execution host while DSPy programs may act as inner cognition runtimes inside selected governed run phases, with DSPx providing the engineering/optimization/replay layer around them

This package was scaffolded from [`../pi-extensions-template`](../pi-extensions-template/) and then populated from the existing live extension at:

- `~/.pi/agent/extensions/society-orchestrator/`

That means the package is still carrying some brownfield transition code while it converges toward the layered architecture above.

## Workspace placement

For workspace-level placement and source hierarchy, read:
- `~/ai-society/holdingco/governance-kernel/docs/core/definitions/ai-society-stack-map.md`
- `~/ai-society/holdingco/governance-kernel/docs/core/definitions/s3-governance-semantics.md`
- `~/ai-society/holdingco/governance-kernel/docs/dev/loops-plugin-system.md`
- `~/ai-society/softwareco/owned/agent-kernel/docs/project/ai-society-convergence-architecture.md`

Important distinction:
- this package owns **package-local coordination/control-plane behavior** in the current split
- `pi-autonomous-session-control` owns the stronger **execution-plane runtime** in the current split
- FCOS/loops registry docs in governance-kernel own the **workspace-wide loop/control-board model**
- MITO/S3.0 semantics live in governance-kernel definitions and source-linked docs, not in this package by itself
- the future governed delegated cognition runtime target should not be read back into this package as already-landed ownership before the successor architecture and runtime substrate actually exist

## Phase A architecture findings

Before any new UI or extraction moves, Phase A capability discovery established that:

- upstream Pi / `pi-mono` already owns generic extension UI primitives such as widgets, footers, overlays, and custom editors
- `pi-interaction` owns interaction-runtime concerns such as editor mounting, trigger brokering, and picker/selection flows
- `pi-vs-claude-code` is best treated as a UX/pattern repo, not a canonical runtime owner
- ASC remains the strongest execution-plane owner for subagent lifecycle/runtime concerns
- user-visible footer/statusline copy should describe the orchestrator coordination role, the ASC execution seam, and routing scope without implying that orchestrator owns the execution runtime

Primary execution-boundary packet:

- [Subagent execution-boundary map](docs/project/subagent-execution-boundary-map.md) — central entrypoint for what is evidence vs decision vs seam proposal vs backlog
- [Execution seam charter](docs/project/2026-03-31-execution-seam-charter.md) — why the seam exists and how small it should stay
- [Execution seam review](docs/project/2026-03-31-execution-seam-review.md) — latest time-boxed answer on whether the seam still earns its keep and how many real consumers exist today
- [Phase A UI capability discovery](docs/project/2026-03-10-ui-capability-discovery.md) — evidence for package placement
- [Control-plane boundaries ADR](docs/adr/2026-03-11-control-plane-boundaries.md) — adopted boundary decision
- [ASC public execution contract proposal](docs/project/2026-03-10-rfc-asc-public-execution-contract.md) — preferred first seam under the ADR
- [Architecture backlog](docs/project/2026-03-10-architecture-convergence-backlog.md) — migration order and HTN

Current package-local direction for operator-visible runtime semantics:

- [Strategic goals](docs/project/strategic_goals.md)
- [Tactical goals](docs/project/tactical_goals.md)
- [Operating plan](docs/project/operating_plan.md)
- [Runtime status semantics](docs/project/runtime-status-semantics.md)

## Imported source layout

Imported files were mapped into the package scaffold like this:

- `~/.pi/agent/extensions/society-orchestrator/index.ts`
  -> [extensions/society-orchestrator.ts](extensions/society-orchestrator.ts)
- `~/.pi/agent/extensions/society-orchestrator/loops/engine.ts`
  -> [src/loops/engine.ts](src/loops/engine.ts)
- `~/.pi/agent/extensions/society-orchestrator/chains.yaml`
  -> [src/chains.yaml](src/chains.yaml)
- empty `kes/` directory preserved as [src/kes/](src/kes/)

## Package identity

- package folder: `packages/pi-society-orchestrator`
- npm package name: `pi-society-orchestrator`
- release component: `pi-society-orchestrator`
- primary extension entry: `extensions/society-orchestrator.ts`

The runtime extension surface still uses the existing `society-orchestrator` identity where that avoids unnecessary command/session churn.

## Tool surface

Primary tools and commands exposed by the imported extension include:

- `society_query` (explicit bounded diagnostic SQL exception only; read-only `WITH ... SELECT ...`, `SELECT`, `EXPLAIN`, and non-mutating `PRAGMA` forms are allowed)
- `cognitive_dispatch`
- `evidence_record`
- `ontology_context` (now resolved through the sanctioned `rocs-cli` adapter path instead of the local `society.db` ontology table)
- `loop_execute`
- `/cognitive`
- `/agents-team` (session-identity-scoped routing-scope selection for direct-dispatch and loop agents; incompatible loop/team combinations now fail explicitly instead of silently swapping roles)
- `/runtime-status` (editor-backed inspector for the shared runtime-truth surface, including routing, footer/status contract, and live DB/vault status)
- `/evidence` (recent evidence preview via `ak evidence search`)
- `/ontology <query>`
- `/loops`
- `/loop <type> <objective>`

## Current runtime reality

- Runtime hardening is in place for agent/team routing, shared execution/evidence policy, timeout-bound supervised lower-plane calls, `rocs-cli`-backed ontology resolution, and a dedicated society runtime helper for the residual read-side boundary.
- Operator-visible runtime truth now has a shared package-local surface in `src/runtime/status-semantics.ts`; `/runtime-status`, `session_start`, footer/statusline wording, routing-selection notices, and installed-package smoke assertions now derive from that shared contract instead of scattered literals.
- `cognitive_dispatch` and `loop_execute` now route subagent execution through ASC's public execution contract via `src/runtime/subagent.ts` instead of carrying a second local spawn/runtime implementation.
- The orchestrator-side adapter still preserves package-local timeout/output policy (`PI_ORCH_SUBAGENT_TIMEOUT_MS`, `PI_ORCH_SUBAGENT_OUTPUT_CHARS`) around the ASC-owned seam so installed-package behavior stays truthful during the cutover.
- The adapter now also preserves ASC execution truth needed for orchestration decisions: canonical execution status, normalized `failureKind`, assistant stop reasons, protocol parse failures, abort propagation, and truncation metadata are forwarded instead of being collapsed into transport-only success.
- Package-local seam guardrails now fail closed if source code drifts back to private ASC `extensions/self/*` imports or revives an orchestrator-local execution runtime path.
- `/evidence` now reads through the sanctioned `ak evidence search` path instead of raw sqlite evidence queries.
- Installed-package `release:check` now proves guarded-bootstrap, timeout, truncation, and team-mismatch behavior through a deterministic headless harness against the installed tarball, including the current bundled `pi-autonomous-session-control` publish bridge.
- That bridge is now explicitly temporary: keep it only until ASC has registry-backed release evidence and orchestrator can cut over to a normal dependency without bundle lifting; see [bundled ASC bridge lifecycle](docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md).
- The first time-boxed [execution seam review](docs/project/2026-03-31-execution-seam-review.md) now records that this package remains the only real external runtime consumer and that installed-package smoke is verification evidence rather than a second consumer.
- Remaining uncertainty is narrow: `recordEvidence(...)` still retains SQL fallback, `society_query` remains a bounded raw sqlite diagnostic exception until a truthful canonical read boundary exists, and full interactive `/reload` parity is still outside the routine release-check harness even though guarded-bootstrap live-host proof now exists in [2026-04-01 guarded bootstrap verification](docs/project/2026-04-01-guarded-bootstrap-verification.md).
- Keep this package's current truth in `README.md` + `next_session_prompt.md`, not a separate `status.md` mirror.

## Quickstart

Run directly from the package during development:

```bash
pi -e ./extensions/society-orchestrator.ts
```

Or install the package into Pi from its local package path:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-society-orchestrator
```

Then in Pi:

1. run `/reload`
2. verify with a real command or tool call from this package

## Package checks

From the package directory:

```bash
npm install
npm run docs:list
npm run check
```

`npm run check` now exercises package-local typechecking and regression tests in addition to lint/structure/package validation.

## AK task/work-item operations

This package is a monorepo member, not a git root.
Use the monorepo-root AK wrapper for task/work-item operations:

```bash
# from the pi-extensions repo root
./scripts/ak.sh --doctor
./scripts/ak.sh task ready

# from this package directory
../../scripts/ak.sh --doctor
../../scripts/ak.sh task show <id> -F json
```

For package-local architecture/process docs, prefer:
- `docs/project/` for dated RFCs, runbooks, and evidence/progress notes
- `docs/adr/` for adopted architecture decisions
- avoid new `docs/dev/` trees

The runtime now also shares package-local helpers for:
- no-shell lower-plane command execution (`sqlite3`, `dolt`, `ak`, `rocs-cli`)
- async, timeout-bound lower-plane runtime calls for `sqlite3`, `dolt`, and `rocs-cli` instead of synchronous runtime `execFileSync` reads
- cognitive-tool schema-aware vault access with cognitive-only lookup by name
- `rocs-cli`-backed ontology resolution via ROCS build/index artifacts instead of raw ontology SQL reads
- fail-closed agent/team routing plus session-identity-scoped, capacity-bounded team state for direct dispatch and loop execution
- shared execution/evidence policy across direct dispatch and loop execution (abort skips evidence, timeout/protocol failure records fail evidence, SQL fallback eligibility is consistent)
- abortable, timeout-bound, capture-bounded child-process supervision for `ak` and Pi subagents
- explicit `societyDb` targeting for `ak`-backed runtime paths so ambient `AK_DB` does not silently override the configured package DB target
- repo-local `scripts/ak.sh` discovery for runtime `ak` calls when available, so live sessions prefer the same wrapper/runner lineage used by repo operators before falling back to explicit `AGENT_KERNEL`, the built agent-kernel binary, or `ak` on PATH
- evidence writes now preflight for a registered repo ancestor in `society.db`; when none exists, they consume the AK-owned `ak repo bootstrap --path <cwd>` surface before deciding whether to use the canonical `ak` evidence path or the bounded direct-SQL fallback for explicit-only, excluded, or otherwise unavailable repo contexts
- subagent prompt composition + spawn behavior across direct dispatch and loop execution
- explicit society-read boundary helpers: `society_query` goes through a dedicated diagnostic exception helper, while `/evidence` now previews recent entries through `ak evidence search`

Session team identity precedence is now explicit:
1. `ctx.sessionKey`
2. `ctx.sessionId`
3. `ctx.sessionManager.sessionKey`
4. `ctx.sessionManager.sessionId`
5. `ctx.sessionManager.id`
6. fallback to `sessionManager` object identity

Additional runtime knobs:
- `PI_ORCH_DEFAULT_AGENT_TEAM` — default team for sessions without explicit selection (validated; invalid values fall back to `full`)
- `PI_ORCH_MAX_SESSION_KEYS` — max retained session-key entries before oldest-key eviction
- `PI_ORCH_PROCESS_CAPTURE_BYTES` — bounded stdout/stderr capture limit for supervised child processes
- `PI_ORCH_SUBAGENT_TIMEOUT_MS` — default timeout forwarded through the ASC public execution request when orchestrator dispatch does not set an explicit timeout
- `PI_ORCH_SUBAGENT_OUTPUT_CHARS` — bounded subagent output preserved on the orchestrator side after ASC runtime execution completes
- `PI_ORCH_ONTOLOGY_REPO` — ontology repo passed to `rocs build` (defaults to `~/ai-society/softwareco/ontology`)
- `PI_ORCH_ROCS_PROJECT` — local `rocs-cli` project used when invoking `uv --project ... run rocs`
- `PI_ORCH_ROCS_BIN` — direct `rocs`/wrapper executable override for ontology resolution
- `PI_ORCH_ROCS_WORKSPACE_ROOT` — workspace root passed to `rocs` for ref resolution (defaults to `~/ai-society`)
- `PI_ORCH_ROCS_WORKSPACE_REF_MODE` — ROCS workspace ref mode for ontology resolution (defaults to `loose`)

`npm run release:check` now also exercises installed-package guarded-bootstrap, timeout, truncation, and team-mismatch smoke through a headless harness that binds to the exact `PACKAGE_SPEC` recorded in the isolated Pi agent settings, verifies the installed package contents still match that tarball, and then drives the installed extension's registered tools/commands directly. The harness uses deterministic fake subagent/`ak` dependencies plus a temporary vault fixture, asserts the expected `ak repo bootstrap` plus evidence-write argv for the guarded-bootstrap case, and installs through an isolated `NPM_CONFIG_PREFIX` so routine release validation does not mutate the user's default global npm package space. That keeps the installed-package proof while removing the old dependency on `~/.pi/agent/auth.json` and a live provider-backed Pi host for routine release checks. For the complementary live-host proof, see [2026-04-01 guarded bootstrap verification](docs/project/2026-04-01-guarded-bootstrap-verification.md).

Treat that harness as **installed-package / packaging truth**, not as the primary source of seam semantics. The seam contract itself is anchored by ASC package-local tests plus `tests/runtime-shared-paths.test.mjs`; `npm run release:check` proves the packaged import graph and installed extension behavior still work after install.

From the monorepo root:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-society-orchestrator
```

## Notes

- The package ships `src/` because the extension entrypoint imports runtime modules from there.
- `session_start` guards UI-only behavior with `ctx.hasUI` so non-UI runs stay safer.
- The package was renamed early to the `pi-society-orchestrator` canonical package identity to avoid later naming churn.
- The execution-plane/public-contract cutover is now landed; the current convergence priority is the remaining society/prompt adapter migration plus the post-cutover stewardship queue (`#626` onward) while the bundled ASC bridge remains governed by the documented lifecycle note rather than open-ended cleanup.
