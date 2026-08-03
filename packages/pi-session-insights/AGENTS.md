---
summary: "Package guardrails for deterministic, jq-first Pi session insight extraction."
read_when:
  - "Editing packages/pi-session-insights."
  - "Changing session JSONL extraction, attribution, or the pi-session-jsonl skill."
---

# AGENTS.md — pi-session-insights

## Owner boundary

This package owns deterministic, bounded extraction from explicitly named Pi session JSONL files.

It does not own:

- AK task/decision/evidence truth;
- source-owner, runtime-owner, or KES authority;
- session compaction (`pi-session-compaction`);
- minimal assistant-message provenance (`pi-provenance`);
- automatic diary/learnings/KES promotion;
- broad surveillance, semantic ranking, or LLM-first session scanning.

## JSONL rule

- `lib/session-insights.jq` is the only session-content parser.
- The Node CLI may validate arguments, locate its jq program, and spawn jq; it must not parse JSONL.
- Tests may generate known fixtures and parse extractor output, but production inspection remains jq-only.
- Keep output bounded. Do not emit full chronology, tool results, provider payloads, hidden thinking, auth material, or unbounded message text.

## Attribution rule

- Never infer authority from session cwd.
- `authority_repo`, `runtime_owner`, `kes_destination`, and non-default propagation require a source-qualified attribution document.
- Path-derived mutation roots are observations only and must retain an uncertainty/non-authority marker.
- Session-only is the conservative propagation default.

## Package posture

- Private, `releaseConfigMode=none`, and skill-only for this first slice.
- No `pi.extensions`, `pi.prompts`, slash command, MCP server, live install/reload, release, or publication.
- The package-owned `skills/pi-session-jsonl/SKILL.md` is authoring truth; machine-local skill copies are projections.

## Validation

From this package:

```bash
npm run fixtures:test
npm run check
```

From the monorepo root:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-session-insights
```

Use plain installed `ak` for the monorepo-root task. Preserve all sibling/root dirty files.
