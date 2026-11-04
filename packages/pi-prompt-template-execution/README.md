---
summary: "@tryinget/pi-prompt-template-execution package overview."
read_when:
  - "Orienting to this package or directory before changing its behavior."
---

# @tryinget/pi-prompt-template-execution

Live monorepo-owned successor for the external `npm:pi-prompt-template-model` package inside the `pi-extensions` monorepo.

## Current scope

This package owns prompt-template execution semantics for prompt files that need extension behavior such as `model`, `thinking`, `restore`, `skill`, model conditionals, and argument substitution.

Current live posture:

- exposes a minimal Pi extension entrypoint through `package.json#pi.extensions`
- does **not** expose `package.json#pi.prompts`
- does **not** ship prompt bundles
- replaces the external `npm:pi-prompt-template-model` execution owner for `/commit`
- treats Pi core prompt-template commands as metadata/template expansion entries, not as extension execution owners
- blocks duplicate extension command owners through the guarded registration path
- keeps `pi-session-compaction` separate as the compaction-summary owner

## Implemented surfaces

- prompt-template discovery for extension-relevant prompt markdown:
  - global/user prompt directory
  - project prompt directory
  - project prompt overrides global by name
  - duplicate same-source diagnostics
  - reserved command-name diagnostics
  - description-only prompts ignored by the extension loader so Pi core keeps plain prompt metadata ownership
- frontmatter subset:
  - `model`
  - `description`
  - `restore`
  - `thinking`
  - `skill` resolved through skill lookup/message helpers
- prompt-template-model-compatible model fallback through `@tryinget/pi-model-selection`
- argument substitution:
  - `$1`, `$2`, ...
  - `$@`
  - `$ARGUMENTS`
  - `${@:N}` and `${@:N:L}`
- prompt-template-model-compatible model conditionals:
  - `<if-model is="provider/model">...<else>...</if-model>`
  - comma-separated specs and provider wildcard conditionals such as `openrouter/*`
  - nested conditionals
  - fail-soft invalid-markup diagnostics that leave content unchanged
- execution planning:
  - selected model
  - rendered content
  - switch/restore model intent
  - thinking intent
- command registration guard:
  - requires explicit enablement from the live entrypoint
  - requires loader/execution tests to be confirmed
  - requires no-double-registration preflight confirmation
  - requires an explicit existing-command snapshot
  - filters Pi core prompt/source commands out of extension-owner collision checks
  - blocks duplicate extension command owners and duplicate same-package registration
- command runner:
  - refreshes prompt templates at invocation time
  - switches model when needed
  - sends rendered user message through Pi host APIs
  - supports deferred `agent_settled` restore timing for model/thinking restore
  - restores immediately if message dispatch fails
- Pi host adapter:
  - normalizes `pi.setModel`, `pi.setThinkingLevel`, `pi.sendUserMessage`, `pi.getThinkingLevel`, queued skill messages, and UI notification behavior
- dry-run diagnostic and safety reports:
  - list which prompt templates would be claimed
  - report loader diagnostics and command-snapshot collisions
  - remain report-only; no package install/reload/hook activation side effects
- compatibility canary helpers:
  - compare prompt loading, command descriptions, invalid-frontmatter diagnostics, model selection decisions, and `/commit` execution-plan summaries against explicit external-compatible fixture expectations
  - include restore, thinking, model-conditionals, invalid frontmatter/model/restore/thinking, model-less conditional inheritance, empty rendered prompt abort, and restore-false + thinking fixtures

## `/commit` cutover interpretation

After Phase 4, `/commit` has exactly one extension execution owner: this package's `extensions/prompt-template-execution.js`.

Pi core may still expose a prompt-source `/commit` command from `~/.pi/agent/prompts/commit.md`. That core prompt entry is expected because Prompt Vault exports the prompt markdown for template expansion and editor visibility. It is not treated as a duplicate prompt-template execution owner.

## Active-model fallback

The live entrypoint keeps a template's configured model as its preferred override.
If that override is unavailable or its switch is refused before dispatch, it renders
against the invocation-active model and sends the prompt once, with a warning.
The pure command runner exposes this behavior through `fallbackToCurrentModel: true`;
existing callers without that option retain their fail-closed selection behavior.

If the override's initial provider response fails with no assistant output (including
thinking) or tool execution, the live entrypoint attempts the invocation-active model
once, after Pi's normal retries/recovery. This includes quota errors such as
`opencode-go`'s `GoUsageLimitError`. The command is **not resent**: a context edit omits
only the exact terminal failed response from model context, retaining the raw failure
in session history, and requests one boundary continuation. Invocation thinking is
restored after the fallback model switch, including for `restore: false` templates.

No automatic fallback occurs after output/tools, on abort, without a different prior
model, when pending work or manual model/thinking changes intervene, or when model
conditionals would produce different instructions. Manual changes during preparation
cancel dispatch. A failed fallback switch is not retried by settlement restoration.
Expected thinking events remain tracked across settlement so delayed owned events do
not cancel the next invocation.

Recovery uses Pi's public `agent_before_settle` boundary API. Existing boundary drafts
are preserved, and pending work/abort/ownership are rechecked after awaited switching.
Later extension handlers can still change the boundary result; this is not exclusive
host-wide arbitration. If dispatch is intercepted before a run starts, no recovery is
inferred from the fire-and-forget send call. Busy/overlapping commands are refused.

`tests/model-fallback-host.test.mjs` exercises the real Pi command lifecycle using
in-memory synthetic providers only; it does not contact `opencode-go` or perform Git
commits. Existing sessions must reload after the updated package is installed.

## Explicit non-goals

- no package prompt bundle registration
- no `package.json#pi.prompts`
- no independent subagent runtime
- no loop/chain/workflow runtime
- no `/prompt-tool` or `run-prompt` tool
- no compaction hook ownership

Loop/chain/workflow ownership belongs in `packages/pi-society-orchestrator/`. Subagent/runtime execution belongs to ASC. Compaction ownership belongs in `packages/pi-session-compaction/` and remains separate.

## Template baseline

This package was created from `../pi-extensions-template` in `simple-package` mode and keeps `.copier-answers.yml` tracked. It is deliberately adapted as a root-managed live extension package with a minimal extension entrypoint and no prompt bundle.

## Validation

```bash
cd packages/pi-prompt-template-execution
npm run check
```
