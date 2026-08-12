---
summary: "Controlled evidence and runtime design for ASC stable-prefix dispatch plus cache-aware tree/fork routing."
read_when:
  - "Changing dispatch child prompt placement, cache measurements, or self tree/fork advice."
  - "Evaluating whether Pi session branching can reuse provider prompt cache."
---

# ASC subagent cache locality — 2026-08-12

## Implemented boundary

ASC now keeps Pi's host prompt, project context, and child tool schema as the stable prefix. Profile instructions, Prompt Vault envelope content, and the typed task contract are composed once into the initial user message after that prefix.

Clean children also default to `--no-skills`, preventing ambient skill discovery from adding variable prompt content. Callers load governed skills through an explicit named `skillProfile`; `noSkills: false` remains a deliberate compatibility opt-out.

Completed owned child runs report:

- first-turn prompt, fresh-input, cache-read, cache-write, uncached, output, cost, and cache-read-ratio values;
- aggregate versions of the same cache values;
- wall time through the existing execution result.

Provider usage cannot establish result quality, semantic overlap, or separately priced reasoning. Those remain external evaluation concerns.

## Controlled OpenAI Codex observations

The live probes used `openai-codex/gpt-5.6-sol`, thinking off, one stable appended prefix, and the same `read` tool schema.

### Same live session versus fork

A source session made one tool call, producing two provider requests:

| Request | Fresh input | Cache read | Cache-read ratio |
|---|---:|---:|---:|
| source first request | 2,063 | 0 | 0% |
| source automatic post-tool request | 561 | 1,536 | 73.25% |
| first request after `--fork` | 2,116 | 0 | 0% |

The fork header had a new Pi session ID and pointed to the source through `parentSession`. It inherited conversation storage, not the parent's provider cache identity.

### Clean ASC siblings

Two same-profile children with the same tools and different minimal objectives each reported:

| Child | First-turn prompt | Uncached | Cache read |
|---|---:|---:|---:|
| sibling A | 1,634 | 1,634 | 0 |
| sibling B | 1,634 | 1,634 | 0 |

The new stable textual prefix therefore does not, by itself, create cross-child hits on the current Codex transport. Pi currently derives `prompt_cache_key` from each Pi session ID. A cache-family key independent of session identity would be separate future work; this slice deliberately does not change provider cache keys.

## Tree/fork interpretation

- `/tree` and continued execution in the same session preserve the Pi session ID and offer the best chance of reusing a recent exact provider prefix. A hit still depends on model/provider behavior, TTL, identical model/tools/system/context, and choosing no branch summary when locality is the priority.
- `/tree` then `/clone` can shorten the active path before creating a separate session, reducing replay volume. The clone receives a new session ID, so this is not cache inheritance.
- `/fork` selects earlier inherited conversation into a new session. Use it for context inheritance, not as a cache optimization.
- `dispatch_subagent` remains the clean independent-review path. Stable-prefix ordering reduces avoidable textual divergence, while first-turn metrics expose the remaining fan-out tax.

## Why self advises rather than executes

Pi exposes `navigateTree`, `fork`, and session replacement only through command contexts. A model-callable tool runs during an active agent turn; replacing that session from the tool/event context can deadlock or invalidate the running context.

ASC therefore exposes `self({ query: "cache-aware delegation: tree or fork?" })` as a read-only typed recommendation. It may suggest operator prefill such as `self({ query: "Prefill: /tree" })`, but it does not perform hidden navigation, fork, clone, or cache-hit attestation.
