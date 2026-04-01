---
summary: "Completed AK task #667 by adding installed-package guarded-bootstrap release smoke in pi-society-orchestrator and capturing one live Pi-host evidence_record proof through the AK-native bootstrap path."
read_when:
  - "You are resuming after FCOS-M41 task #667 in pi-extensions."
  - "You need the exact release-check and live-smoke proof captured for the guarded bootstrap verification step."
---

# 2026-04-01 — FCOS-M41 guarded bootstrap verification

## What I did
- Claimed AK task `#667`.
- Extended `packages/pi-society-orchestrator/scripts/release-smoke.mjs` so installed-package release validation now covers an explicit guarded-bootstrap scenario before the existing timeout / abort / semantic-error / parse-error / truncation / team-mismatch cases.
- Seeded the installed-package smoke DB so the normal dispatch cases still use the direct AK path while the dedicated guarded-bootstrap case proves:
  - one `ak repo bootstrap --path <cwd> -F json` call for an unregistered cwd
  - one subsequent `ak evidence record ...` call from that bootstrapped cwd
- Wrote the durable proof packet at:
  - `packages/pi-society-orchestrator/docs/project/2026-04-01-guarded-bootstrap-verification.md`
- Updated the package README + handoff plus the monorepo-root handoff/operating-plan notes so the concern is recorded as verified rather than still active.
- Ran one live Pi-host smoke against a temporary isolated AK DB and an unregistered repo under `softwareco/fork`, using the actual installed `pi-society-orchestrator` package and a real `evidence_record` tool call.

## Validation
- `cd packages/pi-society-orchestrator && npm run docs:list`
- `cd packages/pi-society-orchestrator && npm run check`
- `cd packages/pi-society-orchestrator && npm run release:check`
- Live Pi-host smoke proof captured in:
  - session JSONL: `/tmp/pi-orch-live-session-ipNQHX/2026-04-01T15-41-36-630Z_9ef260e4-308d-48db-a346-d53ed8cba6f8.jsonl`
  - isolated AK DB: `/tmp/pi-orch-live-smoke-ju5qLF/society.db`

## Result
- Task `#667` now has both deterministic package proof and one live Pi-host proof.
- The guarded repo bootstrap verification gap left after task `#666` is closed.
- The next session should treat the guarded bootstrap concern as verified history unless new evidence reopens it.
