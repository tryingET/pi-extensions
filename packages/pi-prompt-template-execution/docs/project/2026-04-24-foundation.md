---
summary: "Non-live foundation slice for prompt-template execution replacement."
read_when:
  - "Continuing prompt-template-model consolidation."
  - "Changing prompt-template model/thinking/args execution planning."
---

# pi-prompt-template-execution foundation

## Decision

Create `packages/pi-prompt-template-execution` as a successor foundation for the external `npm:pi-prompt-template-model` package, then cut it over as the live prompt-template execution owner in Phase 4.

The package was scaffolded from `../pi-extensions-template` in `simple-package` mode. It is deliberately adapted as a root-managed live extension package with a minimal `package.json#pi.extensions` entrypoint, while still omitting `package.json#pi.prompts` and generated prompt bundles.

## Current implemented slice

- `src/loader.js`
  - discovers extension-relevant prompt markdown from global/user and project prompt directories
  - lets project prompts override global prompts
  - diagnoses duplicate same-source command names
  - ignores description-only templates so Pi core keeps plain prompt ownership
  - skips reserved command names
  - skips chain/loop/subagent frontmatter rather than cloning orchestrator or ASC runtime
- `src/args.js`
  - supports `$1`, `$2`, `$@`, `$ARGUMENTS`, `${@:N}`, and `${@:N:L}` substitutions
- `src/model-conditionals.js`
  - renders prompt-template-model-compatible `<if-model>` blocks, including nested conditionals, comma-separated specs, provider wildcards, and invalid-markup diagnostics that leave content unchanged
- `src/execution-plan.js`
  - renders model conditionals
  - resolves prompt models via `@tryinget/pi-model-selection`
  - produces switch/restore/thinking/send-message intent without mutating the Pi host
- `src/registration.js`
  - provides a non-live fail-closed command registration guard
  - requires explicit enablement, loader/execution test confirmation, no-double-registration preflight confirmation, and an explicit existing-command snapshot
  - blocks existing command collisions and duplicate package registration
- `src/command-runner.js`
  - refreshes prompt templates at invocation time
  - executes a prompt through injected host actions
  - switches/restores model and thinking according to the execution plan
  - supports deferred agent-end style restore by returning restore intent plus an explicit restore helper, while still restoring immediately on send failure
  - exposes the single guarded future command-handler path used by registration when no custom handler is supplied
- `src/host-adapter.js`
  - normalizes Pi host APIs for `setModel`, `setThinkingLevel`, `sendUserMessage`, `getThinkingLevel`, command snapshots, queued skill messages, and UI notifications
  - stays limited to same-session prompt dispatch and does not create a subagent, loop, or workflow runtime
- `src/skills.js`
  - resolves skill frontmatter through registered skill commands, project `.pi/skills`, ancestor `.agents/skills`, global Pi skills, and global agent skills
  - strips skill-file frontmatter and builds the `skill-loaded` message shape for a future guarded `before_agent_start` hook
  - fails closed when a referenced skill cannot be found or read
- `src/diagnostic-report.js`
  - builds a dry-run report of claimed templates, loader diagnostics, command collisions, and registration readiness
  - requires an explicit existing-command snapshot before reporting clean registration readiness
  - keeps live mutation false and records that workflow/loop ownership remains in `pi-society-orchestrator` while subagent runtime ownership remains in ASC
- `/commit` fixture parity tests
  - mirror the current live `/home/tryinget/.pi/agent/prompts/commit.md` prompt shape
  - prove `model: zai/glm-5.1` loading, command-description shape, execution-plan switch/restore intent, and `$ARGUMENTS` substitution
  - prove current live `/commit` ownership would block successor registration through the no-double-registration report
- `src/compat-canary.js`
  - compares monorepo outputs against explicit external-compatible fixture expectations without loading the external package live
  - covers prompt loading, command descriptions, invalid diagnostics, model-selection summaries, and `/commit` execution-plan summaries
  - now includes restore, thinking, model-conditionals, invalid frontmatter/model/restore/thinking, model-less conditional inheritance, empty rendered prompt abort, and restore-false + thinking fixtures
- `src/safety-report.js`
  - summarizes non-live manifest posture and explicit command-snapshot collisions
  - blocks live-cutover readiness when `/commit` is already present or `npm:pi-prompt-template-model` remains installed
  - performs no command registration, package install, reload, hook activation, or host mutation
- `extensions/prompt-template-execution.js`
  - live minimal Pi extension entrypoint
  - calls the guarded registration path with explicit enablement and confirmed test/preflight flags
  - filters Pi core prompt/source commands out of extension-owner collision checks while blocking duplicate extension command owners
  - defers restore to `agent_end` for normal prompt execution and also attempts restore on shutdown
- `docs/project/2026-04-24-live-cutover-plan.md`
  - records Phase 4 cutover closeout, no-double-registration interpretation, live proof, rollback, and owner boundaries

## Phase 3 and Phase 4 closeout

Phase 3 closed as a non-live candidate proof. The package had fixture canaries, `/commit` parity coverage, no-double-registration guards, a safety report, and a plan-only Phase 4 cutover document.

Phase 4 is now closed as a controlled live cutover. The package is installed as the live prompt-template execution owner, `npm:pi-prompt-template-model` has been removed, `/commit` model/argument/restore behavior was verified safely, and `pi-session-compaction` remains a separate compaction-summary owner rather than a prompt-template execution dependency.

## Non-goals

- no package prompt registration
- no `package.json#pi.prompts`
- no independent subagent runtime
- no loop/chain/workflow runtime

## Validation

```bash
cd packages/pi-prompt-template-execution
npm run check
```
