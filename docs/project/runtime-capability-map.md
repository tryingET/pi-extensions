---
summary: "Searchable map from Pi runtime primitives and operator intents to their owning packages."
read_when:
  - "Looking for sendUserMessage, editor prefill, prompt replacement, continuation, loops, or self-improvement capabilities."
  - "Choosing a package owner from a runtime behavior rather than a package name."
system4d:
  container: "Repository-wide runtime capability routing map."
  compass: "Expose powerful primitives and their composition without collapsing owner boundaries."
  engine: "Find intent or primitive -> select owner -> read package contract -> use the narrowest lawful surface."
  fog: "Capabilities can exist in code while remaining practically invisible or being mistaken for authority."
---

# Runtime capability map

This is the repository-wide behavior map. [`root-capabilities.md`](root-capabilities.md) separately describes what the monorepo root owns.

| Intent / primitive | Current owner | Runtime truth and boundary |
|---|---|---|
| Prompt mode switching | `packages/pi-modes` | `append`, complete static `replace_base`, and exact `replace_final`; mode activation is not autonomy permission. |
| Native startup base replacement | Pi host | `--system-prompt` and `SYSTEM.md`; context, skills, date, and cwd remain dynamic under Pi's custom-base branch. |
| Additive system instructions | Pi host / package adapters | `--append-system-prompt`, `APPEND_SYSTEM.md`, and scoped `before_agent_start` appenders. |
| Child prompt envelopes | `pi-autonomous-session-control` | Deterministic child system-prompt envelope and provenance for ASC-owned execution. |
| Operator editor prefill | ASC and interaction packages | `ctx.ui.setEditorText`; proposes text for review and submission. This is not provider-level assistant prefill. |
| Fresh-session handoff generation and launch | `pi-session-compaction` + `pi-little-helpers` | Compaction owns conversation-grounded handoff prompt shape; little-helpers `/handoff-tab` transports exactly one generated prompt into a clean Ghostty Pi session, auto-submitted as its initial user message. Git/AK/source owners remain runtime authority. |
| Provider-level assistant prefill | Not currently owned | Do not claim editor prefill as assistant-role/provider prefill. A provider-specific contract would be required. |
| Trigger another agent turn | Pi host primitive, guarded by ASC and loop owners | `pi.sendUserMessage`; always triggers a turn. Use for actionable continuation, not passive status. |
| Passive operator notification | Pi host UI / owning extension | `ctx.ui.notify` or a custom rendered message; does not create a new LLM turn. |
| Agent fully settled signal | Pi host | `agent_settled`; appropriate observation point for bounded continuation policy. It grants no permission itself. |
| Guarded low-risk continuation | `pi-autonomous-session-control` | `self` may use `pi.sendUserMessage` for explicit safe continuation; risky/directive text is editor-prefilled. |
| Visible repeated prompts | `pi-little-helpers` | Visible-loop transport and visible peer/worktree tools; communication is not durable evidence. |
| One-call local code aggregation | `pi-eval-kernel` | Disposable Python/JavaScript workers with persistent logical state and explicit capability adapters; it does not disable Bash, expose arbitrary registered Pi tools, or provide a security sandbox. |
| Bounded measured optimization | `pi-autoresearch` | Experiment machine, budgets, receipts, candidate binding, empirical interpretation; no package self-promotion. |
| Fixed prompt/system comparison | `pi-evalset-lab` | Reproducible task-set comparisons and reports; a passing eval is evidence, not authorization. |
| Multi-owner loop/workflow routing | `pi-society-orchestrator` | Routes and supervises owner surfaces; does not replace ASC execution or autoresearch measurement. |
| Task/evidence/decision authority | AK | Pi sessions, mode state, intercom, and local receipts are not canonical task/evidence truth. |

## Initiative ladder

Use the narrowest truthful step:

1. UI notification for passive status.
2. Editor prefill when operator review/submission is needed.
3. One explicit low-risk `sendUserMessage` continuation.
4. Visible bounded loop or supervised peer campaign.
5. Measured autoresearch campaign with candidate isolation and evaluation.
6. Separately gated owner-surface evidence, learning, finalization, or promotion.

A prompt mode may influence reasoning style at every level, but it never selects the level or supplies authorization by itself.
