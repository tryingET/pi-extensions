---
name: designmd-foundry
description: Use DesignMD Foundry when doing UI, CSS, design-token, design-system, Penpot/OpenPencil/Pigmnts/Oat, or AI design handoff work. It tells the agent to lint DESIGN.md, export verified design context/tokens, preserve tokens unless intentionally changing the design contract, and avoid wrapping unverified external tool paths.
system4d:
  container: "Skill guidance for DesignMD Foundry-backed design contract workflows."
  compass: "Keep UI/design work grounded in DESIGN.md before implementation."
  engine: "Read DESIGN.md -> lint/export context -> implement/propose patch -> re-lint."
  fog: "External design CLIs may be unavailable; do not overclaim live integration readiness."
---

# DesignMD Foundry

Use this skill when a task touches UI implementation, CSS, HTML, component styling, design tokens, `DESIGN.md`, generated design prompts, or integrations such as Penpot, OpenPencil, Pigmnts, and Oat.

## Core principle

`DESIGN.md` is the design contract. Treat it as source of truth before generating or editing UI.

Do not invent colors, radii, spacing scales, type stacks, or component-token names unless the task explicitly asks for a design-system change. If a change is needed, propose the `DESIGN.md` patch separately and run lint before promotion.

## Preferred Pi tools

When the `pi-designmd-foundry` extension is installed, prefer its tools over ad-hoc shell commands:

1. `designmd_lint`
2. `designmd_export`
3. `designmd_agent_prompt`
4. `designmd_oat_visual_snapshot`
5. `designmd_openpencil_prompt`
6. `designmd_openpencil_info`
7. `designmd_openpencil_lint`
8. `designmd_openpencil_export`
9. `designmd_import_penpot`
10. `designmd_palette_from_text`
11. `designmd_readiness`

Use shell commands only when the extension is unavailable.

## Standard workflow for UI/code implementation

1. Find the nearest relevant `DESIGN.md`.
2. Run a design lint check.
3. Export agent context and concrete implementation artifacts:
   - `agent-prompt` for guidance
   - `css`, `tailwind`, `dtcg`, or `tokens` as appropriate
4. Implement using the exported tokens and prose constraints.
5. If implementation requires design-system changes, return them as a separate `DESIGN.md` patch proposal.
6. Re-run lint after any proposed design contract change.

## CLI fallback

From the DesignMD Foundry repo:

```bash
npm run readiness:integrations
node dist/cli.js lint DESIGN.md
node dist/cli.js export --format agent-prompt DESIGN.md
node dist/cli.js export --format css DESIGN.md
node dist/cli.js export --format dtcg DESIGN.md
```

If `dist/` is unavailable:

```bash
npm run build
```

## Integration readiness rule

Do not claim a live integration just because an adapter exists.

- Penpot: file-based DTCG/Penpot token import is the stable baseline unless a real project export/plugin/webhook path is verified.
- OpenPencil: prompt handoff, info/lint, and export to `svg`, `png`, `jpg`, `webp`, or `fig` are stable when DesignMD readiness reports the project-local `openpencil` dev dependency; `jsx` export remains unwrapped until fixture-verified.
- Pigmnts: text-output palette parsing is stable; image extraction requires installed `pigmnts` and a real image fixture.
- Oat: theme/preview export and visual snapshot HTML are stable; CDN remains explicit opt-in.
- Agent prompt export: stable for handoff, but quality should be evaluated in a real implementation task before adding more automation.

## Output discipline

When using DesignMD context in a final answer or implementation note, report:

1. Which `DESIGN.md` was used.
2. Lint status.
3. Which export formats informed the work.
4. Any token/design-system assumptions.
5. Any proposed `DESIGN.md` changes separately from code changes.
