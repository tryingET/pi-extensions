---
summary: "Local engineering-core override for pi-agent-vent."
read_when:
  - "Aligning implementation decisions with the TypeScript stack baseline."
  - "Changing local vent persistence, privacy posture, or tool behavior."
system4d:
  container: "Repo-local deltas on top of shared engineering-core guidance."
  compass: "Keep local diagnostic capture minimal, testable, private, and authority-safe."
  engine: "Use pi-ts lane -> apply selected disciplines -> validate with package gate."
  fog: "A convenient vent log can accidentally become hidden task/evidence/incident authority."
---

# engineering.local — pi-agent-vent

Primary lane:

- `engineering-core show pi-ts`

Retrieval command:

```bash
uv tool -n run --from ~/ai-society/core/engineering-core engineering-core show pi-ts --prefer-repo
```

## Selected disciplines

Always selected:

- `validation` — package gate and unit tests are required before handoff.
- `testing` — pure recurrence/redaction/store logic belongs in `node:test` tests.
- `security-privacy` — vent records are local diagnostic user data; minimize and redact.
- `documentation` — README/design docs must match shipped tool behavior.
- `dependency-governance` — prefer Node built-ins; do not add runtime deps for trivial helpers.
- `specification-and-dsls` — JSONL record shape, `package.json#pi.extensions`, and tool parameters are executable contracts.

Package-specific selected disciplines:

- `local-first-data` — this package owns durable local JSONL state at `~/.pi/agent/agent-vent/vents.jsonl` or `PI_AGENT_VENT_DIR`.
- `data-governance` — vent records are append-only local diagnostic events, not tasks/incidents/evidence.
- `domain-modeling` — preserve the distinction between vent record, recurrence group, candidate incident, and canonical incident.
- `observability` — local summaries make recurring friction visible without cloud telemetry.

Not selected by default:

- `accessibility` / `design-system` — no custom UI surface in v0.1.
- `service-api` — no network/API boundary in v0.1.
- `ai-ml` — the package records model/tool observations but does not evaluate models or make ML safety claims.

## Repo-local emphasis

- Runtime/package manager baseline: Node.js 22 + npm.
- Extension runtime: TypeScript entrypoint loaded by Pi; pure core logic lives in `src/vent-store.js` for deterministic tests.
- Storage: append-only JSONL; tolerate malformed old lines during reads; do not silently rewrite user data.
- Privacy: no network calls, no telemetry, no secrets in records, conservative runtime redaction.
- Authority: candidate incidents are recommendations only; do not create or imply AK/GitHub/incident mutations.
- Validation: `npm run check` from this package, or root `bash ./scripts/package-quality-gate.sh ci packages/pi-agent-vent`.
- Optional companions are intentionally not adopted for v0.1: no `fast-check`, Cucumber, Nunjucks, or ts-quality rollout.
