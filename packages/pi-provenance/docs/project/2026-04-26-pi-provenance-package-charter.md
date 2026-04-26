---
summary: "Package charter for pi-provenance as the extensible Pi-owned runtime provenance seam."
read_when:
  - "You need to understand why provenance capture is a standalone Pi extension package."
  - "You are deciding whether review-lane provenance belongs in pi-provenance, pi-little-helpers, ASC, or orchestrator."
type: "charter"
system4d:
  container: "Package charter for the Pi provenance extraction seam."
  compass: "Keep Pi runtime/session facts source-owned while making them easy for downstream evidence writers to reuse."
  engine: "Classify owner boundary -> expose minimal extractor -> keep governance consumers downstream."
  fog: "Without a package seam, helper, orchestration, and governance authority can blur into one another."
---

# pi-provenance Package Charter

## Decision

Create `packages/pi-provenance` as the extensible Pi-owned runtime provenance package.

This is intentionally broader than `pi-review-provenance`, because the first use case is governed review-lane provider/model evidence, but the reusable source fact is more general:

```text
Pi session/runtime assistant-message provenance
```

## Why this is not pi-little-helpers

`pi-little-helpers` is appropriate for small operator conveniences. The provenance seam has a stronger contract:

- it must preserve exact Pi session/message refs
- it must avoid full prompt/provider-payload capture by default
- it must avoid `message_end` pre-persistence entry-id races
- it is likely to be consumed by review runners, orchestrator surfaces, or ASC-backed flows
- it should stay reusable beyond one operator helper command

A diagnostic `/provenance` command is useful, but the package's primary value is the importable extraction seam.

## Why this is not pi-society-orchestrator

`pi-society-orchestrator` may decide when a governed workflow needs provenance. It should consume `pi-provenance` rather than own the source fact.

Keeping extraction here prevents society-specific coordination code from becoming the source owner for generic Pi runtime/session facts.

## Why this is not ASC

`pi-autonomous-session-control` owns subagent execution/runtime behavior. Some future subagent review lanes may use `pi-provenance`, but the assistant-message provenance primitive also applies to parent sessions, synthesis turns, and non-subagent review runners.

## Current scope

The first slice provides:

- `src/provenance-core.js`
  - find the latest assistant-message session entry
  - build a minimal source-owned provenance block
  - extract that block from Pi's read-only `ctx.sessionManager`
- `extensions/provenance.ts`
  - `/provenance`
  - `/provenance --json`
- tests that prove the block omits raw message content and preserves provider/model/API/session refs

## Non-goals

This package does not own:

- AK decision closure
- `ak packet` identity/links
- AK run/governed-run schema
- Prompt Vault procedure identity
- whole review-lane orchestration
- generic all-session surveillance
- historical inference from opaque `session://...` aliases

## Future extension points

Legal next slices include:

1. explicit review-lane markers so capture only happens for intended lanes
2. helper APIs that select a specific assistant entry by id rather than the latest assistant message
3. optional sidecar writer for explicit caller-provided evidence paths
4. ASC/orchestrator consumer adapters that call this package without absorbing source ownership
5. historical backfill tooling that requires exact JSONL file + entry id before replacing `not_surfaced`

Do not add provider request payload capture unless a separate design names privacy, redaction, and retention rules.
