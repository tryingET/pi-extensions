---
summary: "Package guardrails for deterministic, jq-first Pi session insight extraction."
read_when:
  - "Editing packages/pi-session-insights."
  - "Changing session JSONL extraction, attribution, or the pi-session-jsonl skill."
---

# AGENTS.md — pi-session-insights

## Owner boundary

This package owns deterministic, bounded extraction from explicitly named Pi or Claude Code session JSONL files, through distinct adapters.

It does not own:

- AK task/decision/evidence truth;
- source-owner, runtime-owner, or KES authority;
- session compaction (`pi-session-compaction`);
- minimal assistant-message provenance (`pi-provenance`);
- automatic diary/learnings/KES promotion;
- broad surveillance, semantic ranking, or LLM-first session scanning.

## JSONL rule

- `lib/session-insights.jq` owns Pi parsing; `lib/claude-session-insights.jq` owns explicit Claude parsing. Never apply Pi schema or effective-context semantics to Claude.
- Node may validate arguments/budgets, read/hash a single-descriptor bounded byte snapshot, spawn jq, serialize bounded extractor output and check explicitly scoped sidecar presence; it must not parse source JSONL.
- Claude metadata pages omit bodies by default. Optional text is not redaction; keep private text out of model prompts. Preserve physical references, page totals, parse/shape errors and unsupported context semantics.
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
- Package-owned `skills/pi-session-jsonl/` (Pi audits) and `skills/agent-session-recovery/` (bounded recovery) are authoring truth; machine-local copies are projections. Preserve existing Pi invocation compatibility.
- Skill installation, canonical landing and live activation require explicit integration clearance; candidate checks do not establish installed behavior.

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
