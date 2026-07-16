---
summary: "Lifecycle SOP for bounded evidence-review candidate delivery and maintenance."
read_when:
  - "Planning, implementing, verifying, handing off, or maintaining evidence-review work."
system4d:
  container: "End-to-end extension operating procedure."
  compass: "Consistent quality from idea to maintenance."
  engine: "plan -> implement -> verify -> candidate handoff -> maintain."
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
- Confirm package activation exposes only the `evidence-review` extension command.

## 4) Candidate handoff

- Treat `npm run release:check:quick` as packaging diagnostics only.
- Keep `releaseConfigMode: none`; this candidate has no release-please, publishing, or production-readiness authority.
- Hand live Pi install/reload and any future release proposal to the owning controller.

## 5) Maintain

- Monitor regressions and user feedback.
- Re-run validation after dependency/script changes.
- Keep `README.md` and `next_session_prompt.md` current.
