# 2026-04-07 — ASC extensionless child settings isolation

## Scope
- AK task `#958` — `[ASC] Isolate extensionless child from invalid default-model warnings`

## What changed
- Added `packages/pi-autonomous-session-control/extensions/self/subagent-child-agent-dir.ts` to build a temporary child-only Pi agent dir.
- Updated `packages/pi-autonomous-session-control/extensions/self/subagent-pi-json-filter.ts` so the raw `pi` child now runs with:
  - a sanitized child `settings.json`
  - copied top-level auth/config files from the parent agent dir
  - best-effort cleanup of the temporary child agent dir after execution
- Kept the earlier explicit child extension bootstrap path intact for extension-backed providers such as `openai-codex-2` via `pi-multi-pass`.
- Added end-to-end coverage proving the helper now isolates the child agent dir and removes it after the run.
- Refreshed ASC docs/changelog/public-contract notes to state the child-settings isolation behavior.

## Why
The parent Pi config currently carries an extension-backed default provider (`openai-codex-2/gpt-5.4`).
When ASC launches an intentional `--no-extensions` raw child, upstream Pi still reads the global settings file first and emits:

- `Warning: No models match pattern "openai-codex-2/gpt-5.4"`

That warning was unrelated to the actual requested child model and polluted subagent stderr even when the child otherwise worked.

## Validation
Package-level:
- `cd packages/pi-autonomous-session-control && npm run docs:list`
- `cd packages/pi-autonomous-session-control && npm run check`
- `cd packages/pi-autonomous-session-control && node --test tests/subagent-transport-live.test.mjs tests/subagent-model-selection.test.mjs tests/dispatch-subagent.test.mjs tests/subagent-protocol.test.mjs tests/public-execution-contract.test.mjs`

Live proof:
- `node packages/pi-autonomous-session-control/extensions/self/subagent-pi-json-filter.ts --cwd "$PWD" --model github-copilot/gpt-5.4 ...`
- `node packages/pi-autonomous-session-control/extensions/self/subagent-pi-json-filter.ts --cwd "$PWD" --model openai-codex-2/gpt-5.4 --extension /home/tryinget/.pi/agent/git/github.com/hjanuschka/pi-multi-pass/extensions/multi-sub.ts ...`
- both helper runs completed with empty stderr and filtered protocol output only

Root-level:
- `npm run quality:pre-commit`
- `npm run quality:pre-push`
- `npm run quality:ci`
- `npm run check`
