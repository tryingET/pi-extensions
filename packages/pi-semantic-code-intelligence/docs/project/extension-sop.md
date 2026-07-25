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
- Run `npm run docs:list` and read docs matching your task domain.
- Capture dated RFCs, runbooks, and evidence/progress notes in `docs/project/`.
- Capture adopted architecture decisions in `docs/adr/`.
- Confirm risks and dependencies.

## 2) Implement

- Build in small commits.
- Keep command/tool behavior explicit.
- Update docs as behavior changes.

## 3) Verify

- Run `npm run check`.
- Execute relevant extension tests.
- Validate prompt templates if changed.

## 4) Install the private local package

- Run `npm run release:check`; this validates the private local artifact with `npm pack --dry-run` and never invokes npm publication.
- Run `npm run dogfood` against the installed SCI local production candidate.
- Install from the package path with `pi install "$PWD"`, reload Pi, and verify a real native composite call.
- Do not add release-please, registry publication, or trusted-publishing posture without a separate accepted decision.

## 5) Maintain

- Monitor regressions and user feedback.
- Re-run validation after dependency/script changes.
- Keep `README.md` and `next_session_prompt.md` current.
