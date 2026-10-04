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

The `pi.session-insights.v2` object includes (v1 consumers must migrate):

- session file/id/header cwd/role/start;
- latest meaningful activity from persisted timestamps, not filesystem mtime;
- latest eligible user-role message with unknown authorship and active-branch assistant text labelled as unverified, both capped;
- last-appended active leaf plus bounded root-to-leaf parent chain;
- Pi-native `firstKeptEntryId` and newer harness `retainedTail` compaction facts, plus branch-summary, custom-entry, model, and thinking-level-change facts;
- deterministic AK task references and path-observed mutation roots;
- explicit authority/runtime/KES/propagation attribution or conservative null/default values;
- uncertainties explaining truncation, attribution gaps, ambiguous leaves, and unparsed Bash effects.

`latest_user_message` replaces `latest_operator_message`. Existing heuristic exclusions remove recognized first scout/subagent/fork boot prompts, peer-injected protocol messages, and retained-tail text equal to the first user message. Later spawn-like wording remains eligible. This filtering does not establish authorship: every emitted user record has `authorship: "unknown"`, and `session_role_basis` is `heuristic_not_authorship`.

## Synthesis claim boundaries

- Do not count user-role records as confirmed human behavior. Generated, pasted, and unresolved-origin content can share that role. Phrase patterns are not authorship proof.
- `latest_assistant_text.claim_status` is `unverified_assistant_text`. Preserve that distinction when quoting a completion claim, including after compaction.
- `tool_result_observations` counts persisted active-branch results, excluding retained-tail copies. It records only capped entry references and structural `isError` status, never tool bodies. Counts are observations, not proof of tool success or research fulfillment.
- `research_completion: "not_established"` is a limitation of the extractor, not a failure verdict. Disclose known failed attempts and unresolved coverage; neither a successful return nor a later assertion erases them. Obtain separate evidence of sources actually obtained and used before claiming completed research.
- Do not turn a retrieval attempt into a claim that a Vault prompt was applied or web sources were consulted. Report unavailable research explicitly; identify any source-independent advice as such.
- No report generator or runtime enforcement is provided here. These rules guide synthesis; the machine fields prevent the extractor itself from asserting unsupported authorship/completion.
- This single-file extractor does not deduplicate forked history or establish causality. Those limitations preclude claims of unique human-message counts or causal personal diagnoses from its output alone.

## Propagation review

After extraction, inspect owner-repo storage surfaces separately:

1. `diary/`
2. `docs/learnings/`
3. accepted TIP/process/check surfaces

Classify only observed propagation. A `CRYSTALLIZED LEARNINGS` heading inside assistant session text remains `session-only` until an owner deliberately persists it.
