---
summary: "Root-cause investigation and isolated Pi 0.84.4 compaction cancellation repair; not deployed."
read_when:
  - "Investigating missing Auto-compacting status, zero-retention compaction, or restart after cancellation."
---

# Auto-compaction investigation — 2026-09-19

## Status and authority

- AK #5792: package investigation. AK #5793: isolated Pi-host source repair.
- Operator explicitly selected isolated host fixes and preservation of zero retention; no installed runtime replacement or publication.
- Installed host observed: Pi 0.84.4. Settings on disk: compaction enabled, `reserveTokens: 15000`, `keepRecentTokens: 0`, retry disabled, default thinking high. These are not proof of any earlier process's effective settings.
- Package: `@tryinget/pi-session-compaction`, installed from its local package path. No extension implementation or user settings changed in this investigation.
- Source repair: `softwareco/contrib/.worktrees/pi-mono-auto-compaction`, branch `fix/auto-compaction-cancellation`, based on exact release `b79e4cc834970cca69daebffab7df1da7d1e52c4` (v0.84.4). Uncommitted, not rebased onto latest upstream, installed, or published.

## QUESTION

Why can a full session show only a spinner, later show Auto-compacting, and restart compaction after cancellation? Which layer must change without losing context or silently changing retention?

## MODE 1 — MANY OF THE GREATS

### Performance engineering

- Core claim: latency comes from the work submitted, not the spinner.
- Premises: summarization is another inference request; input, output and reasoning budgets cost time.
- Strongest case: the extension defaults to the active model and inherits session thinking. With the observed reserve and default budget configuration it permits a 13,800-token model body. Calls await complete responses without streamed summary progress.
- What it sees: repeated cancelled attempts can waste computation and increase provider pressure. A slow response is not necessarily a deadlock.

### State-machine and concurrency engineering

- Core claim: cancellation must terminate the owning run, not merely its current request.
- Premises: compaction changes the context available to the next turn; queues, retries and preparation are parts of that same operation.
- Strongest case: cancelling only the compaction controller leaves context full and the agent eligible to continue. Another turn or queued submission can start another compaction.
- What it sees: local cancellation success is insufficient when a downstream continuation still runs.

### Human-factors and observability engineering

- Core claim: progress and cancellation must begin at the first potentially blocking operation.
- Premises: the operator can only distinguish working, waiting and stuck through the published lifecycle.
- Strongest case: the installed host awaits summarization authentication before publishing compaction start or creating its cancellation controller. During that wait, the normal spinner gives no compaction-specific explanation.
- What it sees: ambiguous feedback encourages repeated aborts, multiplying expensive work and obscuring the original failure.

## MODE 2 — CONFRONTATION

### Performance versus state-machine explanations

- Fundamental contradiction: slow inference cannot explain a compaction hook that never starts.
- Incompatible assumptions: "the summarizer is taking ages" assumes a summary request exists; zero-retention reproduction shows preparation can instead return nothing.
- Performance explains actual generation delay; the state machine explains missing starts and repeated attempts after abort.
- Residual tension: no affected real-provider request was timed, so provider latency remains unquantified.

### Visibility versus correctness

- Fundamental contradiction: labelling the spinner earlier does not stop a cancelled run from restarting.
- Incompatible assumptions: UI-only repair treats a truthful label as sufficient; lifecycle repair requires cancellation to govern every continuation.
- Visibility explains the unlabelled auth wait; lifecycle semantics explain queue-driven restart.
- Residual tension: arbitrary provider/extension work that ignores abort cannot be forcibly revoked by a host promise race.

## MODE 3 — INTEGRATION OR DECISION

- Chosen path: **Contextual dominance**.
- Result: host state-machine correctness dominates for the reproduced symptoms; early progress publication is part of that repair. Performance tuning is a separate, measurement-driven follow-up, not a substitute.
- Why justified: deterministic original-source tests reproduce skipped compaction and continuation after abort without any slow real provider.
- Unresolved: exact attribution of the operator's historical episode, real-provider latency, and live terminal behavior. This investigation reproduced mechanisms, not the original session timeline.

## Confirmed mechanisms and repaired behavior

1. **Trailing tool result + zero retention:** `findCutPoint()` exhausts retention on a tool result, cannot cut there, and can fall back to the first message. Nothing is selected for summarization, so no start event is emitted. Repair retains the latest safe assistant/tool-result boundary; zero remains a valid requested retention value, not permission to orphan tool results.
2. **Invisible auth preparation:** `_runAutoCompaction()` formerly authenticated before announcing compaction or creating its abort controller. Repair establishes progress/controller before the auth await and passes cancellation through it.
3. **Cancellation without termination:** between-turn cancellation could leave the agent running and context unchanged. Repair links parent cancellation and suppresses post-cancel provider/queue/retry continuation. An explicit later prompt can start fresh.
4. **Retry cancellation fall-through:** cancelled retry sleep could fall through into threshold compaction. Reproduced and repaired, but not the leading explanation with retry disabled on disk.

## Multi-order effects caught by independent review

The first patch passed its initial tests but failed four additional adversarial traces. All were regression-tested red before repair:

- Newly enabled zero-retention split compaction exposed a latent **previous-summary loss** path. Preserve the old checkpoint verbatim when no new history needs summarizing.
- Cancellation during the async success notification could execute queued work. Preserve an already-committed checkpoint but prohibit continuation.
- A delayed input interceptor could outlive cancellation, see idle state, and reclassify queued input as a fresh run. Preserve the originating run's identity across awaits.
- Marking preflight active could delay context-only extension guards until after a repeated request. Flush those guards before provider execution.

Second-order chain: invalid cut point → skipped between-tool compaction → unchanged context pressure → later expensive attempt → ambiguous/cancelled wait → queued continuation → another attempt. Fixing only one link does not establish a safe overall lifecycle.

## Gherkin-style red–green evidence

Tests use Given/When/Then names and the existing real AgentSession/faux-provider harness; no new test framework or paid API calls.

- Original focused suite: **15 failures, 1 passing control** against original release source; **16 passed** after the first repair.
- Review cases: **6 failures, 1 passing control** before follow-up fixes.
- Final focused set: **23 passed**.
- Focused plus nearby regressions: **151 passed, 15 skipped**; independently rerun with the same outcome.
- Full isolated `npm run check`: passed (Biome, pinned dependency/import checks, shrinkwrap/install-lock checks, root typecheck, browser smoke). No fixes applied in the final run.
- Independent review: approved tested source; no remaining blockers found.
- Package `npm run check`: passed, **125 tests**, packaging dry-run and lint. Package typecheck is explicitly skipped by its declared gate (no tsconfig); no package implementation changed.

Changed host files:

- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/compaction/compaction.ts`
- `packages/coding-agent/test/compaction-zero-retention.test.ts`
- `packages/coding-agent/test/suite/agent-session-compaction-cancellation.test.ts`
- `packages/coding-agent/test/suite/agent-session-compaction-review.test.ts`

Exact commands, red/green logs and chronology are retained in the isolated worktree's `.task-5793/report.md` and adjacent logs. Model catalog test data came from the installed same-version pi-ai package; source aliases target the isolated worktree. Initial missing-catalog import failures were environment setup failures, not the claimed regression RED.

## PRACTICAL CONSEQUENCE

Do not blame or rewrite the extension for a host cut-point failure that occurs before its hook. Do not silently change zero retention, disable compaction, downgrade the model, substitute lossy summaries, or add an arbitrary deadline to mask lifecycle defects.

**Not deployed:** the current Pi process still has its old behavior. These source fixes need a separately authorized integration/runtime activation and live-TUI check. Remaining terminal notification hooks are awaited; a stalled notification handler can still delay settlement. Real inference latency requires phase timing before tuning summary budgets or reasoning.
