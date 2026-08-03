---
name: pi-session-jsonl
description: Deterministically inspect Pi session JSONL through the package-owned jq extractor, including active branches, compactions, spawned-session roles, AK references, explicit owner attribution, and KES propagation status. Use for session audits and handoffs without treating JSONL as canonical authority.
compatibility: Requires Node.js 22+ and jq 1.7+.
---

# Pi Session JSONL

Use the package extractor before any LLM synthesis. The durable source is this package; a copy under `~/.pi/agent/skills/` is an installed projection, not the authoring owner.

## Hard boundaries

- Inspect JSONL content only through `jq`.
- Bash may locate files and orchestrate extractor calls.
- Do not inspect JSONL with `rg`, `grep`, `sed`, Python, Node JSON parsing, or an ad-hoc parser.
- Pi session JSONL is historical observation, never AK, runtime, source-owner, KES, or propagation authority.
- Never infer authority from `session_header_cwd`.
- Do not automatically write diary/learnings, promote KES, create AK evidence, or mutate owner state.

## Extract one session

Resolve paths relative to this skill directory, then run:

```bash
node ../../bin/pi-session-insights.mjs /absolute/path/to/session.jsonl
```

For readable output:

```bash
node ../../bin/pi-session-insights.mjs --pretty /absolute/path/to/session.jsonl
```

The CLI invokes `lib/session-insights.jq`; the Node wrapper validates arguments and never parses JSONL.

## Add source-qualified attribution

Session bytes cannot establish owner or propagation truth. Supply a separately verified attribution document only after reading canonical AK and owner-repo facts:

Each authority-bearing field must use the shown `{ "value": ..., "source": ... }` record with a non-whitespace source. Unsourced scalars and blank-source records are ignored, fail closed to null or `session-only`, and produce uncertainties.

```json
{
  "schema": "pi.session-insights.attribution.v1",
  "attributions": {
    "<session-id>": {
      "authority_repo": {"value": "/owner/repo", "source": "ak:task:123"},
      "observed_mutation_roots": {"value": ["/observed/repo"], "source": "session-tool-call:path + git-review"},
      "runtime_owner": {"value": "/runtime/owner", "source": "owner-docs:<ref>"},
      "kes_destination": {"value": "/owner/repo/diary", "source": "repo-kes-policy:<ref>"},
      "propagation_state": {"value": "session-only", "source": "repo-inspection:<ref>"},
      "uncertainties": ["live activation not proven"]
    }
  }
}
```

Then run:

```bash
node ../../bin/pi-session-insights.mjs \
  --attribution /path/to/attribution.json \
  --pretty \
  /path/to/session.jsonl
```

Allowed propagation values:

- `session-only`
- `session + diary`
- `session + crystallized`
- `session + propagated`

## Locate candidates without inspecting content

Bash may locate paths:

```bash
find "${PI_CODING_AGENT_SESSION_DIR:-$HOME/.pi/agent/sessions}" \
  -type f -name '*.jsonl' -print | sort
```

Use the extractor on bounded candidates one file at a time. Do not send multi-megabyte JSONL directly to an LLM.

The extractor emits bounded JSON, but jq currently uses `--slurp`, so its memory scales with the one selected file. Do not aggregate a session directory into one invocation.

## Read the output

The `pi.session-insights.v1` object includes:

- session file/id/header cwd/role/start;
- latest meaningful activity from persisted timestamps, not filesystem mtime;
- latest non-spawn operator message and active-branch assistant text, both capped;
- last-appended active leaf plus bounded root-to-leaf parent chain;
- Pi-native `firstKeptEntryId` and newer harness `retainedTail` compaction facts, plus branch-summary, custom-entry, model, and thinking-level-change facts;
- deterministic AK task references and path-observed mutation roots;
- explicit authority/runtime/KES/propagation attribution or conservative null/default values;
- uncertainties explaining truncation, attribution gaps, ambiguous leaves, and unparsed Bash effects.

A recognized first scout/subagent/fork boot prompt, including an exact copy embedded in `retainedTail`, is classified as boot context and is not presented as an independent operator objective. Spawn-like wording in later real operator messages remains visible.

## Propagation review

After extraction, inspect owner-repo storage surfaces separately:

1. `diary/`
2. `docs/learnings/`
3. accepted TIP/process/check surfaces

Classify only observed propagation. A `CRYSTALLIZED LEARNINGS` heading inside assistant session text remains `session-only` until an owner deliberately persists it.
