---
summary: "Overview and quickstart for monorepo package @tryinget/pi-designmd-foundry."
read_when:
  - "Starting work in this package workspace."
system4d:
  container: "Monorepo package scaffold for pi extension delivery."
  compass: "Ship safe package-level iterations inside a shared workspace."
  engine: "Plan -> implement -> validate -> coordinate with monorepo release flow."
  fog: "Drift risk if package scripts diverge from monorepo root conventions."
---

# @tryinget/pi-designmd-foundry

Pi extension and skill package for using DesignMD Foundry as a local-first design contract tool surface.

This package does **not** reimplement DesignMD Foundry. It wraps the DesignMD Foundry CLI so Pi agents can reliably lint `DESIGN.md`, export design artifacts, generate handoff prompts, import DTCG/Penpot token JSON, parse palette text, and inspect integration readiness.

No harnessed LLM provider is bundled here. Pi remains the agent harness; Foundry remains the design contract authority.

When `DESIGNMD_SESSION_ENDPOINT` is set, tools also report start/pass/fail activity and generated artifacts into a running DesignMD Foundry Watch Mode session. Reporting is optional and fail-open: tools still work when no Foundry UI/server is running.

- Workspace path: `packages/pi-designmd-foundry`
- Release component key: `pi-designmd-foundry`
- Release config mode: `component`

## Tools

- `designmd_lint` — lint a `DESIGN.md` file.
- `designmd_export` — export `css`, `oat`, `tailwind`, `dtcg`, `tokens`, `agent-prompt`, `xstate`, `rive`, or `json`.
- `designmd_agent_prompt` — convenience wrapper for `agent-prompt` export.
- `designmd_oat_visual_snapshot` — generate token-preserving Oat visual snapshot HTML for manual review.
- `designmd_openpencil_prompt` — build an OpenPencil handoff prompt.
- `designmd_openpencil_info` — inspect a `.fig` / `.pen` file through the verified OpenPencil info adapter.
- `designmd_openpencil_lint` — lint a `.fig` / `.pen` file through the verified OpenPencil lint adapter.
- `designmd_openpencil_export` — export a `.fig` / `.pen` file to `svg`, `png`, `jpg`, `webp`, or `fig`; `jsx` is intentionally excluded.
- `designmd_import_penpot` — convert DTCG/Penpot token JSON into DESIGN.md text.
- `designmd_palette_from_text` — parse or apply Pigmnts-style hex palette text.
- `designmd_penpot_mcp_inspect` — read-only inspect of the active Penpot file through the official Penpot MCP server.
- `designmd_penpot_mcp_bridge` — plan or explicitly apply one bounded `designmd.canvas-bridge.v1` board create/update mutation through the official Penpot MCP server; update selectors only rebuild selected/latest DesignMD bridge boards.
- `designmd_penpot_mcp_export` — read-only SVG export of an existing DesignMD bridge board through the official Penpot MCP server.
- `designmd_session_plan` — build or materialize a local `designmd.session-plan.v1` Watch Mode planning packet without claiming canonical AK/society authority.
- `designmd_session_variants` — build or materialize local `designmd.session-variants.v1` proposal lanes without claiming accepted durable variants or canonical direction.
- `designmd_session_handoff` — build or materialize a local `designmd.session-handoff.v1` prompt for one executable variant lane without claiming canonical authority.
- `designmd_session_guided_run` — build or materialize the full local `designmd.guided-design-run.v1` loop (plan, memory, variants, handoff, report-back instructions) without executing Pi or claiming canonical authority.
- `designmd_session_browser_agent_handoff` — build or materialize a local `designmd.browser-agent-handoff.v1` prompt for optional browser-side review such as Sitegeist without granting mutation or promotion authority.
- `designmd_session_closeout` — build or materialize a local `designmd.session-closeout.v1` Watch Mode evidence packet without claiming canonical AK/society promotion.
- `designmd_session_promotion_candidate` — build or materialize a local `designmd.promotion-candidate.v1` owner-review packet without promoting, publishing, merging, or mutating AK/society authority.
- `designmd_readiness` — run DesignMD Foundry's integration readiness probe.

Prompt/export modes are deliberately constrained to the Foundry CLI contract: `iterate`, `remix`, `expand`, or `audit`.

## Skill

Use the skill when doing UI/design work:

```text
/skill:designmd-foundry
```

The skill instructs agents to lint and export design context before implementation, preserve tokens unless a DESIGN.md change is intentional, and keep external integrations honest about readiness.

## Runtime dependencies

This package expects pi host runtime APIs and declares them as `peerDependencies`:

- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-ai`

When using UI APIs (`ctx.ui`), guard interactive-only behavior with `ctx.hasUI` so `pi -p` non-interactive runs stay stable.

## Package checks

Run from package directory:

```bash
npm install
npm run check
```

Run from monorepo root through the canonical package gate:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-designmd-foundry
```

The generated package-local `scripts/quality-gate.sh` is a thin wrapper that searches upward for the canonical monorepo root gate.
If you validate the package outside the monorepo tree, set `PACKAGE_QUALITY_GATE_SCRIPT` to the canonical `pi-extensions` root gate path.

## AK task/work-item operations

This package is a monorepo member, not a git root.
Use the monorepo-root AK wrapper for task/work-item operations:

```bash
# from the monorepo root
./scripts/ak.sh --doctor
./scripts/ak.sh task ready

# from this package directory
../../scripts/ak.sh --doctor
../../scripts/ak.sh task show <id> -F json
```

## Documentation placement

Use:
- `docs/project/` for dated RFCs, runbooks, and evidence/progress notes
- `docs/adr/` for adopted architecture decisions

Avoid creating new package-local `docs/dev/` trees.

## Watch Mode reporting

To watch Pi tool progress in the DesignMD Foundry UI, start Foundry and point this package at its session API:

```bash
export DESIGNMD_SESSION_ENDPOINT=http://127.0.0.1:8788/api/session
# optional existing session override:
export DESIGNMD_SESSION_ID=ses_...
# optional actor label and API token:
export DESIGNMD_SESSION_ACTOR=pi-designmd
export DESIGNMD_SESSION_TOKEN=$DESIGNMD_API_TOKEN
```

Without `DESIGNMD_SESSION_ID`, the adapter reuses the current running session or starts a new one. Output-producing tools attach artifacts such as Oat snapshot HTML, agent prompts, CSS/JSON exports, SVG/path metadata for OpenPencil exports, Penpot MCP bridge plans, bridge-apply proof SVGs, read-only existing-board export SVGs, local session plan packets, local session variant lane packets, local session handoff prompts, local session closeout packets, and local promotion candidate packets.

## DesignMD Foundry root

By default the extension looks for DesignMD Foundry at:

```text
~/ai-society/softwareco/owned/designmd-foundry
```

Override with either a tool parameter or environment variable:

```bash
export DESIGNMD_FOUNDRY_HOME=/path/to/designmd-foundry
```

## Live package activation

Install the package into Pi from the package directory containing this package's `package.json`:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-designmd-foundry
```

Then in Pi:

1. run `/reload`
2. verify with a real command or tool call from this package

## Release metadata

This scaffold writes component metadata in `package.json` under `x-pi-template`:

- `workspacePath`
- `releaseComponent`
- `releaseConfigMode`

Use these values when wiring monorepo-level release-please component maps.

## Docs discovery

```bash
npm run docs:list
npm run docs:list:workspace
npm run docs:list:json
```

## Stack lane companions

This package follows the shared `pi-ts` lane.
Add companions only when they materially improve clarity or reuse:

- `fast-check` for parser/rendering/selection invariants
- `@cucumber/cucumber` for executable Gherkin/operator workflows
- `nunjucks` for reusable text/config/prompt/file templates
- `tech-stack-pi-ts.ts-quality.md` when the package explicitly adopts deterministic screening with `ts-quality`

If this package adopts `ts-quality`, prefer repo-local rollout truth in `docs/project/ts-quality-current-vs-target.md` and keep the detailed adoption doctrine upstream in `~/ai-society/softwareco/owned/ts-quality/docs/adoption/`.

## Copier lifecycle policy

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.
