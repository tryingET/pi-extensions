---
summary: "Handoff prompt for package @tryinget/pi-agent-vent inside monorepo workspace."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep local vent capture private, useful, and monorepo-compatible."
  engine: "Read design -> implement focused slice -> test redaction/recurrence/storage -> update docs."
  fog: "Biggest risk is local diagnostic records drifting into authority, telemetry, or noisy complaints."
---

# Next session prompt for @tryinget/pi-agent-vent

## Session objective

Continue one focused slice of the local agent venting tool while preserving privacy, authority boundaries, and monorepo compatibility.

## Package context

- workspace path: `packages/pi-agent-vent`
- release component key: `pi-agent-vent`
- primary extension entry: `extensions/agent-vent.ts`
- core logic: `src/vent-store.js`
- vision: `docs/project/vision.md`
- product posture: `docs/project/product-posture.md`
- design: `docs/project/2026-05-21-agent-vent-design.md`

## Quick start

```bash
# from package directory
npm run check
npm run release:check:quick
# when Pi/auth are available, full release check installs the tarball with isolated npm state and smokes package-discovery /agent_vent path
npm run release:check
```

Live check after install/reload:

```text
/agent_vent help
/agent_vent summary
```

## Session checklist

1. Read `AGENTS.md`, `README.md`, `docs/engineering.local.md`, `docs/project/vision.md`, `docs/project/product-posture.md`, and the design doc.
2. Keep `agent_vent` local-only unless a new design explicitly changes the boundary.
3. Add or update `node:test` coverage for redaction, recurrence grouping, JSONL reads/writes, and command/tool behavior affected by the change.
4. Run `npm run check`.
5. If release/package surface changed, run `npm run release:check:quick`; run `npm run release:check` when live Pi smoke is available.
6. Update docs and this handoff prompt when behavior changes.
