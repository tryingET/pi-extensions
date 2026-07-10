---
summary: "Overview and quickstart for @tryinget/pi-provenance."
read_when:
  - "Starting work in this package workspace."
  - "You need Pi-owned assistant-message/session provenance for review-lane or runtime evidence."
system4d:
  container: "Monorepo package for Pi runtime provenance helpers."
  compass: "Keep source-owned Pi session/message facts reusable without turning downstream governance systems into the source of runtime truth."
  engine: "Extract minimal persisted assistant-message provenance -> copy into caller evidence -> validate package."
  fog: "Main risk is accidentally capturing full prompts/provider payloads or making AK/orchestrator the source owner for Pi runtime facts."
---

# @tryinget/pi-provenance

Pi assistant-message/session provenance helpers for source-owned runtime evidence.

- Workspace path: `packages/pi-provenance`
- Release component key: `pi-provenance`
- Release config mode: `component`

## Why this package exists

Pi already persists assistant-message provenance in session JSONL entries: provider, model, API, stop reason, usage, response id when available, and stable session/message entry refs.

Downstream systems often need those facts without becoming their source owner. This package owns the small Pi-side extraction seam:

```text
Pi session JSONL assistant message
-> minimal provenance block
-> copied by review runners / orchestrators / evidence writers
```

It does **not** own AK decision closure, `ak packet` links, AK run/schema authority, whole review workflow orchestration, or generic all-session surveillance.

## Runtime surfaces

This package is background/library-first. It does not register a user-facing slash command and does not expose scaffold prompt templates.

Current surfaces:

1. an importable helper for callers that already have `ctx.sessionManager`
2. a gated background `agent_settled` handler for explicit review-lane capture

## Programmatic helper

Consumers can import the helper:

```js
import { extractLatestAssistantMessageProvenance } from "@tryinget/pi-provenance/provenance";

const provenance = extractLatestAssistantMessageProvenance(ctx.sessionManager);
```

Returned shape:

```json
{
  "provenance_schema": "pi.assistant_message.provenance.v1",
  "source_owner": "pi-runtime",
  "capture_time": "2026-04-26T07:00:00.000Z",
  "pi_session": {
    "session_id": "...",
    "session_file": "...",
    "message_entry_id": "...",
    "message_parent_id": "...",
    "entry_timestamp": "..."
  },
  "assistant_message": {
    "provider": "...",
    "model": "...",
    "api": "...",
    "response_id": "...",
    "message_timestamp": 1777185319548,
    "stop_reason": "stop",
    "usage": {}
  }
}
```

The helper does not include raw message content, prompts, provider request payloads, auth headers, tool output, or full session chronology.

## Background review-lane capture

The extension listens for `agent_settled`, but it is inert unless both explicit environment markers are present:

```bash
export PI_PROVENANCE_REVIEW_LANE_ID="review-lane-id"
export PI_PROVENANCE_OUTPUT_FILE="/absolute/path/to/provenance.json"
```

When both are set, the extension resolves the latest persisted assistant-message entry from `ctx.sessionManager` and atomically writes the minimal provenance block with this context:

```json
{
  "capture_context": {
    "kind": "review_lane",
    "review_lane_id": "review-lane-id"
  }
}
```

This makes review-runner wiring possible without making provenance capture visible in everyday Pi sessions.

## Review-lane provenance rule

For future governed review lanes, use this package as the source-runtime extractor and let the caller write evidence explicitly:

```text
review runner / orchestrator / ASC consumer
-> call pi-provenance after the assistant message is persisted
-> write the minimal block into lane evidence
-> keep historical lanes as not_surfaced unless exact JSONL entries are resolved
```

Important host lifecycle detail: Pi emits extension `message_end` before the session manager appends the message entry to JSONL. If a caller needs exact `message_entry_id`, resolve it from `ctx.sessionManager.getEntries()` after persistence, for example at `agent_settled` or by post-turn readback.

## Runtime dependencies

This package expects Pi host runtime APIs and declares them as `peerDependencies`:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-ai`

When using UI APIs (`ctx.ui`), guard interactive-only behavior with `ctx.hasUI` so `pi -p` non-interactive runs stay stable.

## Package checks

Run from package directory:

```bash
npm install
npm run check
```

Run from monorepo root through the canonical package gate:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-provenance
```

The generated package-local `scripts/quality-gate.sh` is a thin wrapper that searches upward for the canonical monorepo root gate.
If you validate the package outside the monorepo tree, set `PACKAGE_QUALITY_GATE_SCRIPT` to the canonical `pi-extensions` root gate path.

## AK task/work-item operations

This package is a monorepo member, not a git root. Use plain installed `ak` from the monorepo root or package directory; repo identity still belongs to the monorepo root.

## Documentation placement

Use:
- `docs/project/` for dated RFCs, runbooks, and evidence/progress notes
- `docs/adr/` for adopted architecture decisions

Avoid creating new package-local `docs/dev/` trees.

## Live package activation

Install the package into Pi from this package directory:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-provenance
```

Then in Pi:

1. run `/reload`
2. run a marked review-lane smoke with `PI_PROVENANCE_REVIEW_LANE_ID` and `PI_PROVENANCE_OUTPUT_FILE`
3. verify the output file contains only the minimal session/message/provider/model/API provenance block

## Release metadata

This package keeps component metadata in `package.json` under `x-pi-template`:

- `workspacePath`
- `releaseComponent`
- `releaseConfigMode`

Use these values when wiring monorepo-level release-please component maps.

## Docs discovery

```bash
npm run docs:list
npm run docs:list:workspace
npm run docs:list:json
```

## Copier lifecycle policy

- Keep `.copier-answers.yml` committed.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.
