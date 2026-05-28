---
summary: "Overview and quickstart for monorepo package @tryinget/pi-better-openai."
read_when:
  - "Starting work in this package workspace."
system4d:
  container: "Monorepo package scaffold for pi extension delivery."
  compass: "Ship safe package-level iterations inside a shared workspace."
  engine: "Plan -> implement -> validate -> coordinate with monorepo release flow."
  fog: "Drift risk if package scripts diverge from monorepo root conventions."
---

# @tryinget/pi-better-openai

Standalone Pi extension package extracted from `contrib/pi-better-openai` for two focused OpenAI capabilities:

- `/fast` toggles OpenAI priority service tier injection (`service_tier: "priority"`) for configured OpenAI/OpenAI Codex models.
- `/openai-image` and the `openai_image` tool generate or edit images through OpenAI Codex subscription auth and the hosted `image_generation` tool.

- Workspace path: `packages/pi-better-openai`
- Release component key: `pi-better-openai`
- Release config mode: `component` (default: `component`)

## Runtime dependencies

This package expects pi host runtime APIs and declares them as `peerDependencies`:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-tui`

When using UI APIs (`ctx.ui`), guard interactive-only behavior with `ctx.hasUI` so `pi -p` non-interactive runs stay stable.

## Commands and tools

- `/fast` — toggle fast mode for supported OpenAI/OpenAI Codex models.
- `/openai-image <prompt>` — generate an image from a prompt.
- `/openai-settings` — show fast-mode and image-generation diagnostics.
- `openai_image` tool — generate/edit images from model tool use; accepts `prompt`, optional `images`, `action`, `model`, `outputFormat`, `save`, and `saveDir`.

Image generation uses `openai-codex` OAuth credentials from Pi's model registry or `~/.pi/agent/auth.json`; run `/login openai-codex` if credentials are missing.

## Package checks

Run from package directory:

```bash
npm install
npm run check
```

Run from monorepo root through the canonical package gate:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-better-openai
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

## Live package activation

Install the package into Pi from the package directory containing this package's `package.json`:

```bash
pi install /absolute/path/to/your/monorepo/packages/pi-better-openai
```

Then in Pi:

1. run `/reload`
2. verify with a real command or tool call from this package

## Release metadata

This scaffold keeps npm identity separate from release component identity:

- npm package name: `@tryinget/pi-better-openai`
- release component/tag stem: `pi-better-openai` (for example `pi-better-openai-vX.Y.Z`)

The npm package name must stay scoped. The release component should usually stay unscoped so root release-please component tags remain readable and stable.

This scaffold writes component metadata in `package.json` under `x-pi-template`:

- `workspacePath`
- `releaseComponent`
- `releaseConfigMode`

Default `releaseConfigMode` is `component`, meaning the package expects root-managed component release metadata such as a monorepo release-please component map. Use `none` only as an explicit opt-out when the monorepo root deliberately manages releases another way.

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
- `engineering-pi-ts.ts-quality.md` when the package explicitly adopts deterministic screening with `ts-quality`

If this package adopts `ts-quality`, prefer repo-local rollout truth in `docs/project/ts-quality-current-vs-target.md` and keep the detailed adoption doctrine upstream in `~/ai-society/softwareco/owned/ts-quality/docs/adoption/`.

## Copier lifecycle policy

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.
