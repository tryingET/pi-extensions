---
summary: "DesignMD Foundry Pi adapter integration contract."
read_when:
  - "Before changing DesignMD Foundry extension tools or skill behavior."
system4d:
  container: "Pi-facing adapter over DesignMD Foundry CLI workflows."
  compass: "Expose verified design-contract operations without pretending optional external tools are installed."
  engine: "Pi tool request -> DesignMD CLI command -> structured tool result."
  fog: "Foundry path or optional external CLIs may be missing on an operator machine."
---

# Integration contract

`pi-designmd-foundry` is a Pi adapter over the DesignMD Foundry CLI. It should not duplicate parser/linter/exporter logic.

## Stable initial tool boundary

The extension exposes operations that are readiness-verified in DesignMD Foundry:

- `designmd_lint`
- `designmd_export`
- `designmd_agent_prompt`
- `designmd_oat_visual_snapshot`
- `designmd_openpencil_prompt`
- `designmd_openpencil_info`
- `designmd_openpencil_lint`
- `designmd_openpencil_export` for verified formats only: `svg`, `png`, `jpg`, `webp`, `fig`
- `designmd_import_penpot`
- `designmd_palette_from_text`
- `designmd_readiness`

## Non-goals for the initial package

- No direct save of canonical `DESIGN.md`.
- No provider-backed LLM generation.
- No direct Penpot webhook/plugin synchronization.
- No OpenPencil JSX export wrapper until JSX behavior is fixture-verified.
- No claim that `open-pencil`/`openpencil` or `pigmnts` live CLIs exist unless DesignMD readiness reports them.

## Runtime path resolution

The extension resolves the Foundry root in this order:

1. Tool parameter `foundryRoot`.
2. Environment variable `DESIGNMD_FOUNDRY_HOME`.
3. Default local checkout: `~/ai-society/softwareco/owned/designmd-foundry`.

The CLI entrypoint uses `dist/cli.js` when present, otherwise source mode through Node type stripping.

## Safety posture

Tools return command metadata and bounded stdout/stderr. Canonical writes are avoided; generated prompt, token, palette, and snapshot text is returned to the agent/operator for review. Artifact writes require an explicit output path, as with restricted OpenPencil export.
