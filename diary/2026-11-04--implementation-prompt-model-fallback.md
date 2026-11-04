---
summary: "Add a one-time invocation-model fallback for prompt overrides that fail before output or tools."
read_when:
  - "Investigating /commit quota failures, model restoration, or no-replay recovery."
---

# Prompt model fallback

## Observed failure and scope

AK8266 follows the operator's request for a fallback when `/commit` switches to
`opencode-go/deepseek-v4.1-flash`. The named session recorded a model switch at
2026-11-04T04:54:30Z, an empty initial `429 GoUsageLimitError` response, then
restoration of the invocation model without continuation. This explains the
DeepSeek choice; it was prompt metadata, not a model choice made by the assistant.

Work is isolated to `pi-prompt-template-execution` and this diary. No prompt export,
provider settings, credentials, shared model resolver, workstation runtime, or
foreign dirty paths are changed. No real provider requests are used for testing.

## Implementation

- The live command runner falls back to the invocation-active model when an
  override is unavailable or its pre-dispatch switch is refused. It re-renders
  conditionals and arguments rather than sending override-specific instructions.
- After normal host retries, one initial empty provider failure may continue on
  the invocation model. The original user prompt is not resent. Only the exact
  terminal failed response is omitted from projected context through a public
  boundary context edit; raw failure history remains intact.
- Output, thinking content, tool execution, aborts, queued/competing work, manual
  selections, differing conditional content, and overlapping runs prevent recovery.
- Ownership is reserved before awaits and checked afterward. Model restoration
  precedes thinking restoration. Expected thinking events survive settlement;
  model-default transitions are correlated through public session history rather
  than aggregating manual and owned changes across an awaited setter.
- A refused/thrown fallback switch is consumed once, without a hidden retry from
  settlement restoration. The source README documents the behavior and limits.

## Verification evidence

Local logs are retained under `/data/ai-society-scratch/ak8266/`:

- `red.log`: original missing continuation/unavailable/refused-switch cases fail.
- `race-red.log`, `thinking-red.log`, `thinking-real-event-red.log`: concurrency
  regressions fail before their fixes, including real model-default event shape.
- `no-retry-red.log`: settlement's unintended second switch attempt reproduced.
- `suite-final.log`: 98 tests pass, including five real Pi 1.1 SDK lifecycle cases
  using in-memory synthetic providers: quota, partial output, fallback failure,
  restore-false, and exhausted automatic retry. No real commits are executed.
- `delete-pass.log`: removing the recovery boundary in an owned scratch copy makes
  the primary quota-fallback requirement fail again (deletion mutant rejected).
- Independent bounded inspection accepted the final previously identified
  thinking-transition fix and reproduced both manual-before/default-after cases.

Package validation and root staged-smoke commands are run separately for the
commit; their real statuses and exact command texts belong to the commit-local
provenance note and AK evidence, not assumptions inferred from this diary.

## Activation and proof limits

At authoring time the implementation is in a linked worktree, not yet active in
existing Pi sessions. Landing must use `scripts/land-canonical.sh`; the package
must be installed and loaded fresh afterward. Existing sessions require reload.
Offline host evidence is not a successful live `opencode-go` request, and no
unrelated product commit should be created merely to test this feature.

The public pre-settlement boundary is not exclusive arbitration: later extension
handlers may change its result. An intercepted fire-and-forget dispatch does not
prove a run started and does not justify automatic recovery. No claim is made
about undiscovered defects or the completion of unrelated AK work.
