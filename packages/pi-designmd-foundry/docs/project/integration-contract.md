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
- `designmd_penpot_mcp_bridge` for plan-by-default / explicit-apply DesignMD canvas bridge boards through official Penpot MCP
- `designmd_readiness`

## Non-goals for the initial package

- No direct save of canonical `DESIGN.md`.
- No provider-backed LLM generation.
- No continuous Penpot webhook/plugin synchronization; the MCP bridge wrapper is limited to one explicit bounded board creation from `designmd.canvas-bridge.v1`.
- No OpenPencil JSX export wrapper until JSX behavior is fixture-verified.
- No claim that `open-pencil`/`openpencil` or `pigmnts` live CLIs exist unless DesignMD readiness reports them.

## Runtime path resolution

The extension resolves the Foundry root in this order:

1. Tool parameter `foundryRoot`.
2. Environment variable `DESIGNMD_FOUNDRY_HOME`.
3. Default local checkout: `~/ai-society/softwareco/owned/designmd-foundry`.

The CLI entrypoint uses `dist/cli.js` when present, otherwise source mode through Node type stripping.

## Safety posture

Tools return command metadata and bounded stdout/stderr. Canonical writes are avoided; generated prompt, token, palette, and snapshot text is returned to the agent/operator for review. Artifact writes require an explicit output path, as with restricted OpenPencil export and Penpot MCP SVG proof output. Penpot MCP mutation requires `apply: true` and a human-connected plugin; plan mode is the default.

## Optional Watch Mode reporting

When `DESIGNMD_SESSION_ENDPOINT` points at a Foundry session API root such as `http://127.0.0.1:8788/api/session`, every tool reports start/pass/fail activity to the current or newly created session. Output-producing tools also attach previewable artifacts when possible.

Reporting must stay optional and fail-open:

- no hidden dependency on a running Foundry server
- no tool failure just because session reporting failed
- no canonical authority claim for session/activity/artifact logs
- optional bearer token via `DESIGNMD_SESSION_TOKEN` or `DESIGNMD_API_TOKEN`

Use `DESIGNMD_SESSION_ID` only when the operator wants to bind reports to an explicit existing session.
