---
summary: "Lifecycle SOP for extension delivery and maintenance."
read_when:
  - "Planning, implementing, verifying, releasing, or maintaining extension work."
system4d:
  container: "End-to-end extension operating procedure."
  compass: "Consistent quality from idea to maintenance."
  engine: "plan -> implement -> verify -> release -> maintain."
  fog: "Unknowns resolved through incremental validation loops."
---

# Extension SOP

## 1) Plan

- Define scope and acceptance criteria.
- Read [Agent vent design](2026-05-21-agent-vent-design.md) before changing tool behavior or storage.
- Run `npm run docs:list` and read docs matching your task domain.
- Capture dated RFCs, runbooks, and evidence/progress notes in `docs/project/`.
- Capture adopted architecture decisions in `docs/adr/`.
- Confirm privacy, authority-boundary, storage, and dependency risks.

## 2) Implement

- Build in small commits.
- Keep command/tool behavior explicit.
- Keep pure recurrence/redaction/store behavior in `src/vent-store.js` with `node:test` coverage.
- Do not add network calls, telemetry, AK mutations, GitHub mutations, or incident creation without a new design.
- Update docs as behavior changes.

## 3) Verify

- Run `npm run check`.
- Confirm tests cover changed redaction, recurrence, JSONL, and candidate-incident behavior.
- Validate prompt templates if changed.
- For live behavior, install the package into Pi, `/reload`, then verify `/agent_vent help` or a safe `agent_vent` call.

## 4) Release

- Run `npm run release:check` (or `npm run release:check:quick` for artifact-only CI mode).
- Confirm GitHub Actions settings allow marketplace actions and PR creation by workflows.
- Use release-please PR flow for versioning/changelog updates.
- For first-time npm packages, bootstrap once with token auth before switching fully to trusted publishing.
- Publish from GitHub release after publish workflow checks pass.
- Sync extension to live pi when needed.

## 5) Maintain

- Monitor regressions and user feedback.
- Review whether candidate-incident heuristics are noisy or too quiet.
- Re-run validation after dependency/script changes.
- Keep `README.md` and `next_session_prompt.md` current.
