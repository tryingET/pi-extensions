---
summary: "Implementation plan for the first pi-agent-vent package slice."
read_when:
  - "Continuing or reviewing the initial agent vent implementation."
system4d:
  container: "Implementation slice for local agent vent capture."
  compass: "Ship a minimal, tested, local-first tool without authority drift."
  engine: "Scaffold -> domain/store core -> Pi extension surface -> docs -> validation."
  fog: "Overbuilding escalation workflows before local records prove useful."
---

# Implementation plan — pi-agent-vent v0.1

## Scope

Create a new simple-package monorepo package from `pi-extensions-template` and replace scaffold placeholders with a real local agent vent tool.

## Acceptance criteria

- Package exists at `packages/pi-agent-vent` with tracked `.copier-answers.yml` and template-aligned metadata.
- `agent_vent` custom tool supports `record`, `summary`, `list`, and `path` actions.
- `/agent_vent` command supports human-readable `help`, `summary`, `list`, and `path` inspection, with no `/agent-vent` runtime alias.
- Durable data is append-only JSONL at `~/.pi/agent/agent-vent/vents.jsonl` or `PI_AGENT_VENT_DIR`.
- Records are minimized, schema-versioned, and redacted for common secret patterns.
- Recurrence grouping and candidate-incident heuristics are implemented in testable core code.
- Package README, engineering override, vision/foundation docs, and root package maps describe the real behavior.
- Root release-please component config is synchronized from package metadata.
- `pi-toolbox-discovery` catalog exposes an `agent_vent` diagnostic bundle without moving vent ownership into ASC/self.
- `npm run check` passes for `packages/pi-agent-vent`.

## Implementation steps

1. Generate package scaffold with `copier copy --trust --vcs-ref HEAD` from `~/ai-society/softwareco/owned/pi-extensions-template` in `simple-package` mode.
2. Add core module `src/vent-store.js`:
   - category/severity vocabularies;
   - redaction and recurrence-key normalization;
   - append/read JSONL store helpers;
   - grouping, candidate-incident, and formatting helpers.
3. Replace `extensions/agent-vent.ts` scaffold command:
   - register `agent_vent` custom tool with clear prompt guidelines;
   - register `/agent_vent` inspection command only; do not add `/agent-vent` as a runtime alias;
   - keep all storage local; avoid network and owner-surface writes.
4. Add `tests/vent-store.test.js` for redaction, record creation, JSONL round-trip, and summary grouping.
5. Update package metadata and docs:
   - `package.json` description/keywords/files;
   - `README.md` quickstart and data/privacy contract;
   - `docs/engineering.local.md` selected disciplines and package-specific deltas;
   - `docs/project/vision.md`, `foundation.md`, and `extension-sop.md`;
   - `next_session_prompt.md` if needed.
6. Update root and cross-package discovery docs:
   - `README.md` package list and routing;
   - `README.terse.md` package map;
   - `pi-toolbox-discovery` catalog/docs/tests for the `agent_vent` bundle;
   - ASC/self capability docs to point at `agent_vent` as a separate companion when relevant;
   - root release-please config/manifest via `node ./scripts/release-components.mjs sync`.
7. Validate:
   - `npm install` in the package;
   - `npm run check` in the package;
   - optionally `node ./scripts/release-components.mjs validate` at root.

## Deferred work

- Confirmation-gated delete/export commands.
- Rich TUI summary view.
- Optional AK/GitHub escalation helpers that create draft text only, never silent mutations.
- Team-shared sink after consent, retention, identity, and sync semantics are designed.
