---
summary: "Overview and quickstart for monorepo package @tryinget/pi-context-packer."
read_when:
  - "Starting work in this package workspace."
system4d:
  container: "Monorepo package scaffold for pi extension delivery."
  compass: "Ship safe package-level iterations inside a shared workspace."
  engine: "Plan -> implement -> validate -> coordinate with monorepo release flow."
  fog: "Drift risk if package scripts diverge from monorepo root conventions."
---

# @tryinget/pi-context-packer

Read-only context-window packet planning for Pi coding sessions.

This package is the proposed implementation seam for FCOS item `context-window-packer`: it plans how to assemble useful next-turn context from source-owned providers without turning any provider into a monolithic all-context authority.

- Workspace path: `packages/pi-context-packer`
- Release component key: `pi-context-packer`
- Release config mode: `component` (default: `component`)

## Current surface

- `/context-pack` — preview the package's read-only planning posture.
- `context_plan` — model-callable tool that returns a provider plan, budget, risks, and non-authorizations.
- `context_pack` — model-callable packet assembler for currently wired read-only providers.
- `context_dogfood_evaluate` — model-callable, non-persistent evaluator for filled redacted dogfood observation templates.
- `context_dogfood_summarize` — model-callable, non-persistent aggregate summary for multiple redacted dogfood observations/evaluations.

`context_pack` is the first bounded retrieval slice: it reads only local AGENTS files, caller-seeded or docs-list-ranked Markdown docs, trusted-system-git status, current Pi session/environment metadata, and SCI code context for caller-seeded code paths/symbols only when SCI read-only safety is explicitly confirmed. It returns a curated Markdown packet as primary tool content and keeps structured details compact by default, omitting duplicated raw item content from `details`. It records omissions, owner-surface routes, and a measurement receipt with estimated tool calls avoided, packet fill ratio, wired providers, already-loaded prompt dedupe, provider gaps, a packet-local utility recommendation that can say to use the packet, skip duplicate content, or review omissions, and a redacted copy-ready dogfood observation template for externally comparing actual low-level probes against estimates without persisting evidence, duplicating raw packet content, or leaking selected item paths / raw omission details. The observation template includes optional `actualLowLevelCallsAvoided` for cases with a known baseline. `context_dogfood_evaluate` consumes that redacted template after observation fields are filled and returns a packet-local calibration summary (`matched`, `overestimated`, `underestimated`, `needs_review`, or `observation_incomplete`) without reading files, calling providers, writing evidence, updating AK/FCOS, or creating session memory. `context_dogfood_summarize` aggregates multiple redacted observations/evaluations into status counts, provider omission counts, invalid-receipt counts, and cautious next actions under the same non-persistent boundary. Provider failure omissions use stable public failure classes; raw subprocess stderr/stdout/error text is omitted from Markdown packet output, compact details, and next-tool suggestions. Session awareness emits compact numeric context-usage metadata only; raw session/context-usage objects and system prompt content are not packetized. Markdown structural labels such as objectives, item IDs, paths, and rationales are rendered as bounded one-line display text so caller-controlled labels cannot forge packet sections. Owner-surface routes are advisory only: when an objective needs `self`, subagent execution, peer messaging/launch, orchestrator gates, AK/FCOS authority, Prompt Vault governance, or ROCS semantics, the packet names the owning surface and states that context-packer did not call, spawn, supervise, persist, or authorize it. It enforces the global packet budget across providers while preserving the configured reasoning reserve, enforces cumulative provider-local caps, preserves loader-style AGENTS order from root/ancestor files to deepest package files, and treats Markdown extensions case-insensitively. It does not mutate state. Caller-controlled path seeds and provider-discovered Markdown paths are screened before packet reads; URI/drive-letter, absolute, parent-traversing, current-directory, hidden/internal, generated/vendor, or malformed path seeds are omitted from provider queries and surfaced as blocked path risks. Caller-controlled `cwd`/`repoRoot` values are also screened before they are echoed as workspace posture: package cwd can name an ancestor monorepo `repoRoot` only when that ancestor has a `.git` marker, while unrelated roots and broad non-repo ancestors fail closed. Retrieval repeats workspace containment plus descriptor/TOCTOU checks before file content enters a packet. When no explicit safe Markdown seed is supplied, the docs provider may use `docs-list.mjs` read-only ranking to discover repo-relative Markdown candidates by objective, even if unrelated unsafe caller seeds were omitted. If SCI read-only safety is not confirmed, context-packer refuses to run SCI workflows rather than risk creating or mutating `.ontology` artifacts. When the active Pi system prompt already contains a selected AGENTS/doc file, the packet emits metadata instead of duplicating the whole content.

Initial live receipts are recorded in [Dogfood measurement receipts — 2026-05-22](docs/project/2026-05-22-dogfood-measurement-receipts.md), including one useful-packet case and one `no_packet_needed` case.

## Provider boundary

`context_plan` may select or mark optional providers for:

- SCI code context (`sci`)
- repo docs / docs-list (`docs`)
- active AGENTS/instruction context (`agents`)
- git posture (`git`)
- current session context pressure (`session`)
- Prompt Vault read-only procedures (`prompt_vault`)
- AK read-only task/decision/evidence orientation (`ak`)
- FCOS read-only control-board orientation (`fcos`)

See the root source-owner docs:

- [Context-window packer FCOS slice](../../docs/project/2026-05-21-context-window-packer-fcos-slice.md)
- [Context packer provider contract](../../docs/project/2026-05-21-context-packer-provider-contract.md)

## Current MVP omissions

`context_pack` records explicit omissions instead of pretending full integration exists. Prompt Vault, AK, and FCOS adapters are planned provider seams. The current MVP assembles bounded AGENTS/docs-list/git/session sections plus SCI code context for path and symbol seeds when an SCI CLI is available.

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
bash ./scripts/package-quality-gate.sh ci packages/pi-context-packer
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
pi install /absolute/path/to/your/monorepo/packages/pi-context-packer
```

Then in Pi:

1. run `/reload`
2. verify with a real command or tool call from this package

## Release metadata

This scaffold keeps npm identity separate from release component identity:

- npm package name: `@tryinget/pi-context-packer`
- release component/tag stem: `pi-context-packer` (for example `pi-context-packer-vX.Y.Z`)

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
