---
summary: "Deterministic jq-first Pi session JSONL insight extraction package and skill."
read_when:
  - "Using or changing pi-session-insights."
  - "Auditing Pi sessions without loading raw JSONL into an LLM."
system4d:
  container: "Private skill-only Pi package for bounded session observation."
  compass: "Extract first, attribute from owners second, synthesize last."
  engine: "session JSONL -> jq facts -> source-qualified attribution -> bounded JSON -> optional synthesis."
  fog: "Session cwd and transcript claims can be mistaken for canonical owner or propagation truth."
---

# @tryinget/pi-session-insights

Deterministic, bounded analysis of one explicitly named Pi session JSONL file.

The package exists because long-lived sessions can reach tens of megabytes and thousands of messages. Correctness should not depend on an LLM scanning that chronology. The extraction path is:

```text
Pi session JSONL
-> lib/session-insights.jq
-> bounded pi.session-insights.v1 JSON
-> optional source-qualified attribution
-> optional LLM synthesis
```

## Ownership

This is a new package instead of an expansion of existing owners:

- `pi-provenance` remains the minimal provider/model/message-reference extractor and deliberately excludes raw prompts/full chronology.
- `pi-session-compaction` remains the live compaction-summary owner.
- `pi-session-insights` owns explicit-file, post-hoc structural extraction and bounded latest-message facts.

AK, Git, runtime owners, ROCS, Prompt Vault, and KES retain their own authority. Session bytes are historical evidence only.

## CLI

Requirements: Node.js 22+ and jq 1.7+.

```bash
node ./bin/pi-session-insights.mjs --pretty /path/to/session.jsonl
```

Installed/local-bin shape:

```bash
pi-session-insights --pretty /path/to/session.jsonl
```

Options:

```text
--attribution <file>   source-qualified owner/propagation facts
--max-text-chars <n>   cap latest text fields (default 2000)
--max-chain <n>        cap emitted active parent ids (default 512)
--pretty               pretty JSON
--jq-bin <path>        explicit jq executable
```

Exactly one session is processed per invocation. Bash can loop over bounded candidates; the CLI does not aggregate unbounded histories.

The current jq implementation uses `--slurp`: emitted output is bounded, and observed 29–31 MB sessions complete without LLM scanning, but jq memory still scales with the selected input file. Select one explicit file at a time.

## Output contract

`pi.session-insights.v1` includes:

- `session_file`, `session_id`, `session_header_cwd`, `session_role`, `session_start`;
- `latest_meaningful_activity`, `latest_operator_message`, `latest_assistant_text`;
- `active_leaf`, `active_parent_chain`, total/truncation metadata;
- Pi-native `firstKeptEntryId` and newer harness `retainedTail` compaction facts, plus branch-summary, custom-entry, model, and thinking-level-change facts;
- `ak_task_ids`, `observed_mutation_roots`;
- `authority_repo`, `runtime_owner`, `kes_destination`, `propagation_state`;
- attribution sources and explicit uncertainties.

The active chain is reconstructed from `id`/`parentId`. The persisted last appended tree entry is the leaf derivation because JSONL has no independent durable leaf pointer. Multiple leaves are reported as an uncertainty. Filesystem mtime is never used as activity truth.

Latest operator text excludes a recognized first scout/subagent/fork boot prompt and peer-injected protocol messages. Spawn-like wording in a later real operator message is retained. Latest assistant text comes from the active branch. Both are capped; full chronology, tool output, provider payloads, and hidden thinking are not emitted or searched for AK references.

`bounded_output: true` is backed by explicit limits for text, parent IDs, task IDs, mutation roots, custom-entry types, metadata strings, and uncertainties. Truncation totals/flags and uncertainty markers remain visible. The jq program rejects caller-supplied text/chain limits above the CLI maxima.

`custom_entry_types` is a bounded array of `{ordinal, type, type_truncated, count}` records. Totals and truncation are computed from distinct raw types before names are capped, so long common prefixes cannot collapse the accounting.

## Attribution

Cwd is observation origin, not owner. Without attribution:

```json
{
  "authority_repo": null,
  "runtime_owner": null,
  "kes_destination": null,
  "propagation_state": "session-only"
}
```

Use `pi.session-insights.attribution.v1` only after revalidating AK and owner-repo facts. See [`skills/pi-session-jsonl/SKILL.md`](skills/pi-session-jsonl/SKILL.md) for the schema and procedure.

Every authority-bearing attribution field must be an object with both `value` and a non-whitespace `source`. Unsourced scalars and blank-source records are ignored and reported as uncertainties; they cannot populate authority, runtime, KES, mutation-root, or promoted propagation output.

## Package posture

This first slice is deliberately:

- private;
- `releaseConfigMode=none`;
- skill-only (`pi.skills`);
- not installed/reloaded or live-activated by this task;
- free of extensions, package-local `.pi` prompts, prompt bundles, slash commands, MCP, DSPy, ranking, or automatic KES promotion.

The package source is durable authoring truth. A machine-local `~/.pi/agent/skills/pi-session-jsonl` copy is an installed projection.

## Validation

```bash
npm install
npm run fixtures:test
npm run check
```

From the monorepo root:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-session-insights
```
