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

## Fresh-context route adjudication

Use this package when the real question is about coordinating or presenting multiple lower-plane owners together.

Route by owner when the ask is narrower:
- `pi-society-orchestrator` — loops, routing selection, `/runtime-status`, `/evidence`, exact supervision flows, or other coordination/control-plane behavior that composes lower-plane owners
- `pi-autonomous-session-control` — subagent runtime behavior, prompt-envelope application, session artifacts, dashboard/inspection surfaces, and execution-plane invariants
- `pi-vault-client` — Prompt Vault query/retrieve/mutate/rate flows, schema diagnostics, and prompt-plane governance
- `pi-ontology-workflows` / `rocs-cli` — ontology inspection/change/context questions
- `ak` — canonical society-state authority for tasks, evidence, decisions, and repo registration truth

If overloaded cues mix several of those planes, start here only when the adjudication between owners is itself the problem.

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

- [Subagent execution-boundary map](docs/project/subagent-execution-boundary-map.md) — central entrypoint for what is evidence vs decision vs seam proposal vs backlog, and the first stop for fresh-context routing when cues overload package ownership + runtime/operator questions
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
- preserved `kes/` directory now expanded into the package-owned [src/kes/](src/kes/) contract/scaffolding layer for bounded diary + learning-candidate outputs

## Package identity

- package folder: `packages/pi-society-orchestrator`
- npm package name: `pi-society-orchestrator`
- release component: `pi-society-orchestrator`
- lightweight status/footer entry: `extensions/runtime-footer.ts`
- primary model-tool entry: `extensions/society-orchestrator.ts`

The runtime footer/status surface can be loaded by itself for lean startup. The full `society-orchestrator` entry still invokes the status surface when loaded directly, preserving existing package behavior while letting local settings disable the heavy model-tool entry and keep only the footer.

## Tool surface

Primary tools and commands exposed by the imported extension include:

- `society_query` (explicit bounded diagnostic SQL exception only; read-only `WITH ... SELECT ...`, `SELECT`, `EXPLAIN`, and non-mutating `PRAGMA` forms are allowed)
- `cognitive_dispatch`
- `evidence_record`
- `ontology_context` (now resolved through the sanctioned `rocs-cli` adapter path instead of the local `society.db` ontology table)
- `loop_execute`
- `vault_execute_template` (Prompt Vault dispatch bridge that executes known loop-bound templates through `loop_execute` and fails closed for workflow-grade/loop templates without an execution binding)
- `workflow_execute` (explicit chain/parallel workflow composition over the ASC-backed subagent executor, with optional bounded worktree isolation for eligible parallel groups)
- `autoresearch_live_supervision` (exact-task live `pi-autoresearch` status/observe/start/stop, plus `action=start_campaign` to delegate one bounded campaign start to `pi-autoresearch` and then supervise it)
- `autoresearch_manifest_campaign_supervision` (one-shot exact-manifest observation + evidence-only AK projection for manifest-driven `pi-autoresearch` campaigns)
- `autoresearch_self_hosting_supervision` (one-shot self-hosting artifact observation + evidence-only AK projection for `pi-autoresearch` supervised self-hosting campaigns)
- `ts_quality_release_workflow` (Pi Society wrapper around the `ts-quality` local release-prep leaves and GitHub Release-triggered npm Trusted Publishing path)
- `/cognitive` (registered by `extensions/runtime-footer.ts` so cognitive-tool discovery survives lazy model-tool startup)
- `/agents-team` (registered by `extensions/runtime-footer.ts`; session-identity-scoped routing-scope selection for direct-dispatch and loop agents; the internal `full` team is now presented to operators as `all agents`, and incompatible loop/team combinations fail explicitly instead of silently swapping roles)
- `/runtime-status` (registered by `extensions/runtime-footer.ts`; editor-backed inspector for the shared runtime-truth surface, including routing, footer/status contract, live DB/vault status, a lower-plane telemetry summary, and the latest failing boundary-event preview)
- `/runtime-boundary-telemetry` (registered by `extensions/runtime-footer.ts`; editor-backed inspector for session-local lower-plane command telemetry across sqlite3/ak/rocs and other orchestrator boundary calls)
- `/evidence` (recent evidence preview via `ak evidence search`; full model-tool entry)
- `/ontology <query>`
- `/workflow [objective]` (seed a thin `workflow_execute(...)` wrapper call into the editor)
- `/workflows` (show workflow wrapper usage/examples)
- `/loops`
- `/loop <type> <objective>`

## Current runtime reality

- Runtime hardening is in place for agent/team routing, shared execution/evidence policy, timeout-bound supervised lower-plane calls, `rocs-cli`-backed ontology resolution, and a dedicated society runtime helper for the residual read-side boundary.
- Operator-visible runtime truth now has a shared package-local surface in `src/runtime/status-semantics.ts`; `/runtime-status`, `session_start`, footer/statusline wording, routing-selection notices, and installed-package smoke assertions now derive from that shared contract instead of scattered literals.
- The status/footer implementation lives in `extensions/runtime-footer.ts`, a lightweight always-on entry that can be enabled while `extensions/society-orchestrator.ts` is disabled for lazy model-tool startup. The full entry imports the footer entry when loaded directly so existing package behavior remains compatible.
- `/runtime-status` now also includes a concise summary of session-local lower-plane boundary telemetry plus the latest failing boundary-event preview, while `/runtime-boundary-telemetry` remains the detailed inspector.
- The detailed boundary summary now aligns its core field names with `pi-vault-client` telemetry where that is semantically truthful: `total_calls`, `success_count`, `failure_count`, `retained_events`, `average_latency_ms`, `max_latency_ms`, `command_mix`, and `latest_failure`.
- The session footer now uses prioritized slots: model + `orchestrator→ASC` render when width allows, a compact current-context slot (`ctx 20k`) appears when context usage is known, a compact session-token summary (`↑input ↺cache ↓output`) appears once the session has usage, `DB`/`Vault` health badges remain optional, and selected lightweight extension statuses (`rw <points>/<snapshots>`, `Society ctx✓`, `stash <count>`) may appear after those badges on wide terminals. Narrow widths drop selected extension-status slots first, then health badges, then the session-token summary, then the context slot, then the seam, before sacrificing routing visibility.
- Footer health badges are no longer frozen at startup; subsequent renders can refresh Vault health after startup drift so the footer converges back toward `/runtime-status` truth.
- `cognitive_dispatch`, `loop_execute`, and `workflow_execute` now route subagent execution through ASC's public execution contract via `src/runtime/subagent.ts` instead of carrying a second local spawn/runtime implementation.
- `loop_execute` now exposes bounded loop execution controls: loop-level timeout, optional per-phase timeout forwarding, phase start/progress/complete update streaming, and compact result details containing phase statuses, failure kinds, and artifact paths rather than full phase outputs.
- The `transcendent` loop is aligned to Transcendent Iteration v3 (`Diagnose → 100x → 100x → Debt Targeting → Dissolve → Rebuild → Closure Gate`) and defaults to fail-fast after failed or timed-out phases; callers must set `continue_after_failure: true` to opt into resilient continuation.
- The orchestrator-side adapter still preserves package-local timeout/output policy (`PI_ORCH_SUBAGENT_TIMEOUT_MS`, `PI_ORCH_SUBAGENT_OUTPUT_CHARS`) around the ASC-owned seam so installed-package behavior stays truthful during the cutover.
- The adapter now also preserves ASC execution truth needed for orchestration decisions: canonical execution status, normalized `failureKind`, assistant stop reasons, protocol parse failures, abort propagation, and truncation metadata are forwarded instead of being collapsed into transport-only success.
- Package-local seam guardrails now fail closed if source code drifts back to private ASC `extensions/self/*` imports or revives an orchestrator-local execution runtime path.
- `/evidence` now reads through the sanctioned `ak evidence search` path instead of raw sqlite evidence queries.
- Exact cognitive-tool prompt preparation for `cognitive_dispatch` and loop execution now consumes the supported `pi-vault-client/prompt-plane` seam instead of reading raw prompt bodies with package-local `dolt sql`; the remaining local Prompt Vault path is the bounded metadata listing used by `/cognitive` and runtime-health summaries.
- Prompt Vault execution dispatch now has an orchestrator bridge: `vault_execute_template` uses `pi-vault-client/dispatch-runtime`, maps `transcendent-iteration` to `loop_execute(loop="transcendent")` and `ooda` to `loop_execute(loop="ooda")`, and fails closed for unknown loop/workflow-grade templates that lack an executable binding. Workflow-grade failures are operator/process gates: for known package-owned procedures such as `pi-autoresearch-setup`, the tool now reports the owner-specific lawful route instead of encouraging template-prose bypass.
- Installed-package `release:check` now proves guarded-bootstrap, timeout, truncation, team-mismatch, and successful package-owned KES loop emission through a deterministic headless harness against an isolated installed dependency set rooted in the target tarball, including the current bundled `pi-autonomous-session-control` publish bridge and the local `pi-vault-client` prompt-plane dependency path.
- `release:check` now also enforces the bundled-bridge lifecycle trigger: once `pi-autonomous-session-control` is visible on the npm registry, the orchestrator package must cut over to a normal dependency instead of silently continuing to ship the bundle.
- Invalid or unwritable package-owned KES roots now fail closed with a typed materialization error and structured `loop_execute` failure output instead of leaking raw filesystem exceptions.
- That bridge is now explicitly temporary: keep it only until ASC has registry-backed release evidence and orchestrator can cut over to a normal dependency without bundle lifting; see [bundled ASC bridge lifecycle](docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md). The package release-check now consults that trigger directly so the bundle cannot linger by inertia after ASC publication.
- The first time-boxed [execution seam review](docs/project/2026-03-31-execution-seam-review.md) now records that this package remains the only real external runtime consumer and that installed-package smoke is verification evidence rather than a second consumer.
- Remaining uncertainty is narrow: `society_query` remains a bounded raw sqlite diagnostic exception until a truthful canonical read boundary exists, the `/cognitive` catalog/health listing still uses a bounded local metadata query until `pi-vault-client` exposes a supported public catalog seam, and full interactive `/reload` parity is still outside the routine release-check harness even though guarded-bootstrap live-host proof now exists in [2026-04-01 guarded bootstrap verification](docs/project/2026-04-01-guarded-bootstrap-verification.md).
- `ts-quality` release coordination now has a bounded orchestrator-side workflow surface:
  - tool: `ts_quality_release_workflow`
  - current truth: use action `plan` first; `prepare` wraps repo-local release file preparation; `commit_tag`, `push`, `create_github_release`, and `verify_public` keep the release chain explicit; `push` and `create_github_release` require `externalMutationApproved=true`; local `npm publish` stays forbidden because GitHub Release triggers npm Trusted Publishing/OIDC.
- Live `pi-autoresearch` campaigns now have a bounded orchestrator-side start/supervise surface:
  - tool: `autoresearch_live_supervision`
  - current truth: `status`, `observe`, `start`, and `stop` remain exact `taskId` + `cwd` supervision controls; `start_campaign` additionally requires exact `taskId`, exact `cwd`, and a non-empty objective, delegates one `setupMode=autoplan`, `runMode=bounded_loop`, `peerMode=plan` campaign start to the `pi-autoresearch` public runtime seam, and then starts live supervision. `start_campaign` can pass `planner=dspx_program`, `runDspxProgramGen`, `materializeDspxIntent`, and DSPx intent/outdir/behavior paths through to `pi-autoresearch`, which can materialize and run a bounded DSPx-generated DSPy planner assembly and use the validated generated DSPy output in `behavior_results.json` as the campaign setup plan; orchestrator does not synthesize or apply DSPy programs itself. Live supervision reports the package-owned Oracle-ready evidence packet/preflight status and the DSPx owner command (`dspx oracle autoresearch-evidence publish-preflight --packet ...`) as read-only empirical-memory handoff context; it does not write Oracle Postgres, migrate local `coordinates.db`, or make Oracle memory authoritative. Live supervision may project verified AK milestones through its existing orchestrator-gated projector after runtime/ledger proof; this surface does not spawn peers, promote candidates, mutate direction, or write KES evidence.
- Manifest-driven `pi-autoresearch` campaigns now also have a bounded orchestrator-side observation/evidence surface:
  - contract: [pi-autoresearch manifest campaign supervision contract](docs/project/pi-autoresearch-manifest-campaign-supervision-contract.md)
  - status: [pi-autoresearch manifest campaign supervision status](docs/project/pi-autoresearch-manifest-campaign-supervision-status.md)
  - tool: `autoresearch_manifest_campaign_supervision`
  - current truth: reuse package-derived manifest campaign AK-binding truth for exact-anchor evidence-only writes, keep the surface one-shot, and do not widen this concern into live polling or task lifecycle mutation without a separate explicit decision.
- Supervised self-hosting `pi-autoresearch` campaigns now have a narrow orchestrator-side observation/evidence surface:
  - contract: [pi-autoresearch self-hosting supervision contract](docs/project/pi-autoresearch-self-hosting-supervision-contract.md)
  - package vision anchor: [pi-autoresearch vision](../pi-autoresearch/docs/project/vision.md)
  - tool: `autoresearch_self_hosting_supervision`
  - current truth: read exact `autoresearch.self-hosting.json`, evaluator lock, and promotion/rollback record artifacts from an explicit package cwd; verify evaluator snapshot hashes; optionally record deduped exact-task AK evidence; do not run candidates, mutate evaluator locks, reclassify applicability, approve promotion, rotate/rollback controllers, spawn peers, or complete tasks.
- Keep this package's current truth in `README.md` + `next_session_prompt.md`, not a separate `status.md` mirror.

## Package-owned KES activation

The first bounded KES wave after the prompt-plane cutover is now complete through `task:1089`, `task:1090`, and `task:1091`, and the first bounded TG3 hardening slice is complete through `task:1107` and `task:1108`:

- `src/kes/` owns the package-local contract for KES roots, markdown/frontmatter scaffolding, and lazy materialization
- the only allowed artifact roots for that seam are `diary/` and `docs/learnings/`
- learning outputs stay **candidate-only** until a later explicit promotion step says otherwise
- loop execution consumes this seam: every run writes package-owned KES diary artifacts under `diary/`, and crystallization-oriented phases stage candidate-only learning artifacts under `docs/learnings/`
- invalid or unwritable package-owned KES roots now fail closed with a typed materialization error and structured `loop_execute` failure surface
- package checks, installed-package release smoke, and repo-root validation now prove that path strongly enough to treat the first KES packet and first TG3 hardening slice as landed truth
- set `PI_ORCH_KES_ROOT` only when you intentionally need a different writable package-owned root during testing or smoke validation

Primary package-local KES references:
- [2026-04-10 KES crystallization contract](docs/project/2026-04-10-kes-crystallization-contract.md)
- [Strategic goals](docs/project/strategic_goals.md)
- [Tactical goals](docs/project/tactical_goals.md)
- [Operating plan](docs/project/operating_plan.md)
- `src/kes/index.ts`
- `tests/kes-contract.test.mjs`

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

## `workflow_execute` examples

See [examples/workflow-execute.md](examples/workflow-execute.md) for copy/paste-ready chain, parallel, and worktree-isolated examples.

Important framing:
- `workflow_execute` is best understood as **caller-authored / operator-authored orchestration**, not agent-defined orchestration
- the workflow graph is explicit in the request payload: the caller chooses chain vs parallel, step order, agent roles, and optional worktree use
- the agent still executes each step objective, but it does **not** silently redefine the workflow topology at this boundary
- that explicitness is intentional: it keeps the first workflow adapter truthful, reviewable, and fail-closed above ASC instead of turning hidden planner behavior into authority

Smallest useful read-only chain:

```js
workflow_execute({
  request: {
    mode: "chain",
    steps: [
      {
        kind: "step",
        agent: "scout",
        objective: "Inspect the current repo and identify the main workflow-composition entry points.",
      },
      {
        kind: "step",
        agent: "reviewer",
        objective: "Review the discovered workflow-composition surface and summarize the main runtime risks.",
      },
    ],
  },
})
```

Operator proof for the first live bounded smoke is recorded in [docs/project/2026-04-23-live-workflow-execute-smoke.md](docs/project/2026-04-23-live-workflow-execute-smoke.md).

## Subagent vs cognitive dispatch vs loop vs workflow vs DSPy / DSPx

Use these terms distinctly:

| Need | Use | Why |
|---|---|---|
| one focused specialist run | `dispatch_subagent` | direct access to the ASC-owned subagent runtime for one bounded child-agent objective |
| one task, but the thinking pattern is the main uncertainty | `cognitive_dispatch` | orchestrator chooses the cognitive framing, then dispatches one ASC-backed execution |
| one predefined multi-phase reasoning framework | `loop_execute` | orchestrator-owned phase model such as `kaizen`, `ooda`, or `strategic` |
| one explicit custom multi-step graph | `workflow_execute` | caller-/operator-authored chain/parallel/worktree graph executed over ASC-backed subagents |
| program/runtime optimization, replay, compile/eval, empirical evolution | DSPy / DSPx | different concern: inner cognition/program runtime plus the engineering/evidence layer around it |

Additional interpretation:

- **subagent** — the direct execution unit owned by `pi-autonomous-session-control`
  - use when you want one focused child agent with one bounded objective
  - this is the strongest current Pi-side execution/runtime surface

- **cognitive dispatch** — single-task orchestration where cognition/tool choice is the key help
  - still typically one dispatched execution unit underneath
  - useful when you do not want to author a full graph but do want cognition selection help

- **loop** — a predefined cognitive framework owned by the orchestrator
  - examples: `kaizen`, `ooda`, `strategic`
  - the phase sequence, default agents, and default cognitive tools are already defined
  - best when the reasoning pattern matters more than exact custom step topology

- **workflow** — an explicit caller-authored step graph owned by the orchestrator
  - examples: chain / parallel / optional worktree groups via `workflow_execute`
  - the caller supplies the topology directly in the request
  - best when the exact sequence or fan-out shape is already known

- **DSPy** — an inner cognition/program runtime, not the same thing as a Pi workflow wrapper
  - useful when the concern is LM-program behavior, signatures, compilation, or optimization inside a bounded phase/runtime
  - in the broader target shape, DSPy may run *inside* selected governed phases, not replace Pi's outer orchestration surface

- **DSPx** — the engineering / optimization / replay / eval layer around DSPy systems
  - see `softwareco/owned/dspx/README.md` and `softwareco/owned/dspx/docs/project/vision.md`
  - DSPx is a local-first receipts-first runtime for empirical development of DSPy systems
  - it is not the same concern as a thin Pi workflow wrapper; it sits closer to program evolution, replayable evidence, optimization/search, and local promotion/replay semantics than to simple command/tool orchestration

Practical rule:
- choose **subagent** when you want one specialist worker
- choose **cognitive_dispatch** when you want one worker plus cognition/tool selection help
- choose **loop** when you want the orchestrator's predefined thinking pattern
- choose **workflow** when you want to state the exact multi-step graph yourself
- choose **DSPy/DSPx** when the real problem is program-shaped cognition, compile/eval, optimization, replay, or empirical evolution rather than just multi-agent step sequencing

## Package checks

From the package directory:

```bash
npm install
npm run docs:list
npm run check
npm run release:check
```

`npm run check` exercises package-local typechecking and regression tests in addition to lint/structure/package validation.

`npm run release:check` now also proves the installed-package KES path and compact loop contract: a successful kaizen loop must emit package-owned `diary/` plus candidate-only `docs/learnings/` artifacts under the true installed package root without returning full phase outputs, while the installed transcendent smoke proves fail-fast behavior after a timed-out first phase and streamed phase lifecycle updates.

## AK task/work-item operations

This package is a monorepo member, not a git root.
Use the monorepo-root AK wrapper for task/work-item operations:

```bash
# from the pi-extensions repo root
ak --doctor
ak task ready

# from this package directory
../.ak --doctor
../.ak task show <id> -F json
```

For package-local architecture/process docs, prefer:
- `docs/project/` for dated RFCs, runbooks, and evidence/progress notes
- `docs/adr/` for adopted architecture decisions
- avoid new `docs/dev/` trees

The runtime now also shares package-local helpers for:
- no-shell lower-plane command execution (`sqlite3`, `ak`, `rocs-cli`)
- session-local lower-plane boundary telemetry for those command paths, with command mix, latency, success/failure, and recent event inspection via `/runtime-boundary-telemetry` and `orchestrator_boundary_telemetry`
- async, timeout-bound lower-plane runtime calls for `sqlite3`, `dolt`, and `rocs-cli` instead of synchronous runtime `execFileSync` reads
- cognitive-tool prompt preparation through the supported `pi-vault-client/prompt-plane` seam, plus a bounded local metadata listing helper for `/cognitive` and runtime-health surfaces
- `rocs-cli`-backed ontology resolution via ROCS build/index artifacts instead of raw ontology SQL reads
- fail-closed agent/team routing plus session-identity-scoped, capacity-bounded team state for direct dispatch and loop execution
- shared execution/evidence policy across direct dispatch and loop execution (abort skips evidence, timeout/protocol failure records fail evidence, and non-canonical repo contexts fail closed instead of writing directly to sqlite)
- abortable, timeout-bound, capture-bounded child-process supervision for `ak` and Pi subagents
- explicit `societyDb` targeting for `ak`-backed runtime paths so ambient `AK_DB` does not silently override the configured package DB target
- repo-local `scripts/ak.sh` discovery for runtime `ak` calls when available, so live sessions prefer the same wrapper/runner lineage used by repo operators before falling back to explicit `AGENT_KERNEL`, the built agent-kernel binary, or `ak` on PATH
- evidence writes now preflight for a registered repo ancestor in `society.db`; when none exists, they consume the AK-owned `ak repo bootstrap --path <cwd>` surface and fail closed unless that canonical repo-registration path makes `ak evidence record` truthful
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
- `PI_ORCH_DEFAULT_AGENT_TEAM` — default internal team id for sessions without explicit selection (for example `full`, rendered to operators as `all agents`; invalid values fall back to `full`)
- `PI_ORCH_MAX_SESSION_KEYS` — max retained session-key entries before oldest-key eviction
- `PI_ORCH_PROCESS_CAPTURE_BYTES` — bounded stdout/stderr capture limit for supervised child processes
- `PI_ORCH_SUBAGENT_TIMEOUT_MS` — default timeout forwarded through the ASC public execution request when orchestrator dispatch does not set an explicit timeout
- `PI_ORCH_LOOP_TIMEOUT_MS` — default loop-level timeout for `loop_execute` in milliseconds when callers do not pass `loop_timeout_seconds` (defaults to 30 minutes)
- `PI_ORCH_SUBAGENT_OUTPUT_CHARS` — bounded subagent output preserved on the orchestrator side after ASC runtime execution completes
- `PI_ORCH_ONTOLOGY_REPO` — ontology repo passed to `rocs build` (defaults to `~/ai-society/softwareco/ontology`)
- `PI_ORCH_ROCS_PROJECT` — local `rocs-cli` project used when invoking `uv --project ... run rocs`
- `PI_ORCH_ROCS_BIN` — direct `rocs`/wrapper executable override for ontology resolution
- `PI_ORCH_ROCS_WORKSPACE_ROOT` — workspace root passed to `rocs` for ref resolution (defaults to `~/ai-society`)
- `PI_ORCH_ROCS_WORKSPACE_REF_MODE` — ROCS workspace ref mode for ontology resolution (defaults to `loose`)

`npm run release:check` now also exercises installed-package guarded-bootstrap, timeout, truncation, team-mismatch, and successful kaizen-loop KES smoke through a headless harness that binds to the exact `PACKAGE_SPEC` recorded in the isolated Pi agent settings, verifies the installed package contents still match that tarball, and then drives the installed extension's registered tools/commands through a copy-isolated import harness. That harness keeps TypeScript loading deterministic while explicitly pointing the KES smoke lane at the true installed package root, so the proof asserts both the guarded-bootstrap `ak repo bootstrap` path and the installed-root loop-phase evidence/KES writes. It uses deterministic fake subagent/`ak` dependencies plus a temporary vault fixture, packs any local sibling runtime dependencies needed by the target release artifact, and installs that dependency set into an isolated `NPM_CONFIG_PREFIX`. That keeps the installed-package proof while removing the old dependency on `~/.pi/agent/auth.json`, a live provider-backed Pi host, and registry publication of same-wave local dependency packages before the release-smoke lane can run. For the complementary live-host proof, see [2026-04-01 guarded bootstrap verification](docs/project/2026-04-01-guarded-bootstrap-verification.md).

Treat that harness as **installed-package / packaging truth**, not as the primary source of semantics. The contract truth itself is anchored by the package-local KES docs/tests plus `tests/runtime-shared-paths.test.mjs`; `npm run release:check` proves the packaged import graph and installed extension behavior still work after install.

From the monorepo root:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-society-orchestrator
```

## Notes

- The package ships `src/` because the extension entrypoint imports runtime modules from there.
- `session_start` guards UI-only behavior with `ctx.hasUI` so non-UI runs stay safer.
- The package was renamed early to the `pi-society-orchestrator` canonical package identity to avoid later naming churn.
- The execution-plane/public-contract cutover is landed, and exact prompt-plane preparation now consumes the supported `pi-vault-client` seam. The first bounded KES packet is landed through `task:1089`, `task:1090`, and `task:1091`, and the first TG3 hardening slice is landed through `task:1107` and `task:1108`; reassess AK before opening any further loop-family hardening so completed lower-plane proof does not get replayed as active backlog. The bundled ASC bridge remains governed by the documented lifecycle note rather than open-ended cleanup.
