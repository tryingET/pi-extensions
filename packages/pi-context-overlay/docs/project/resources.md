---
summary: "Key resources for building and maintaining the extension."
read_when:
  - "Looking up references, docs, or operational artifacts."
system4d:
  container: "Reference catalog for the package."
  compass: "Keep maintainers close to the files that actually define overlay behavior, validation, and release wiring."
  engine: "Entrypoints -> implementation -> verification -> release/handoff references."
  fog: "The main risk is losing time in generic template docs instead of the package files that carry real behavior."
---

# Resources

## Core package surfaces

- [README](../../README.md)
- [Extension entrypoint](../../extensions/context-overlay.ts)
- [Overlay component](../../src/context-overlay-component.ts)
- [Snapshot store](../../src/snapshot-store.ts)
- [Prompt templates](../../prompts)
- [Tests](../../tests/context-overlay.test.ts)

## Validation and live verification

- [Live smoke example](../../examples/live-smoke.md)
- [Validation script](../../scripts/validate-structure.sh)
- [Release check script](../../scripts/release-check.sh)
- [Biome config](../../biome.jsonc)
- [VS Code workspace settings](../../.vscode/settings.json)

## Package history and handoff

- [Next session prompt](../../next_session_prompt.md)
- [Session-start compatibility note](2026-04-01-session-start-surface-compatibility.md)
- [Changelog](../../CHANGELOG.md)

## Monorepo / release context

- [Organization operating model](../org/operating_model.md)
- Root release mapping: `../../../../.release-please-config.json`
- Tech-stack lane reference (pi extension TypeScript):
  - `uv tool run --from ~/ai-society/core/tech-stack-core tech-stack-core show pi-ts --prefer-repo`
