---
summary: "Migration plan for replacing the external pi-prompt-template-model package with monorepo-owned prompt-template execution surfaces."
read_when:
  - "Continuing pi-session-compaction model resolver extraction."
  - "Deciding whether /commit model frontmatter should stay in npm:pi-prompt-template-model or move into pi-extensions."
  - "Planning prompt-template command/execution ownership across PTX, ASC, and compaction."
system4d:
  container: "Cross-package consolidation plan for prompt-template execution behavior."
  compass: "Preserve live /commit behavior while removing permanent dependence on an external installed package."
  engine: "inventory external behavior -> map owners -> define safe rollout -> land tests before install/uninstall."
  fog: "The main risks are double slash-command registration, divergent model fallback semantics, and recreating a second subagent runtime."
---

# Prompt-template-model consolidation plan

## Current live truth

The live `/commit` prompt model selection is **not** owned by Pi core and is **not** owned by `packages/pi-prompt-template-accelerator`.

Current live owner after Phase 4 cutover:

- installed package: local `packages/pi-prompt-template-execution`
- live extension entrypoint: `packages/pi-prompt-template-execution/extensions/prompt-template-execution.js`
- removed package: `npm:pi-prompt-template-model`
- old installed path `/home/tryinget/.npm-global/lib/node_modules/pi-prompt-template-model` is absent after removal
- `/commit` prompt file: `/home/tryinget/.pi/agent/prompts/commit.md`
- `/commit` uses frontmatter:
  ```yaml
  model: zai/glm-5.1
  ```

Pi core prompt templates still expose core prompt-template metadata/expansion entries such as description. The successor extension owns the execution semantics by discovering prompt markdown files itself and registering extension commands for templates that use extension-specific frontmatter. Post-cutover validation treats Pi core prompt entries as prompt metadata, not as duplicate extension execution owners.

## Non-negotiable constraints

- Do not break `/commit`.
- Do not uninstall `npm:pi-prompt-template-model` until a tested monorepo replacement exists and is installed.
- Do not enable duplicate slash commands for the same prompt templates.
- Do not make `pi-session-compaction` the owner of prompt-template execution semantics.
- Do not create another independent subagent runtime; prompt-template delegation must use ASC or an ASC-backed public seam.
- Do not enable more than one custom compaction override at once.

## External package inventory

Source files inspected from `npm:pi-prompt-template-model@0.6.8`:

| File | Feature area | Keep / rewrite / defer |
|---|---|---|
| `model-selection.ts` | model spec parsing, provider priority, current-model preservation, auth-aware fallback | **Keep semantics**, rewrite/import into monorepo shared resolver |
| `prompt-loader.ts` | prompt discovery, extension frontmatter validation, reserved command names, skill path resolution | **Keep semantics**, rewrite with tests before command registration |
| `prompt-execution.ts` | model resolution + conditional rendering + argument substitution preparation | **Keep semantics**, split pure renderer from host side effects |
| `template-conditionals.ts` | `<if-model>` rendering | **Keep if used by prompts**, pure module candidate |
| `args.ts` | runtime flags, placeholder args, model/subagent overrides, legacy loop flags | **Keep only the prompt-execution subset**; do not let legacy loop flags define new ownership |
| `chain-parser.ts` | `step -> step`, quoted separators, `parallel(...)`, per-step flags | **Do not port into the prompt execution MVP**; route workflow/chain behavior to `pi-society-orchestrator` if still needed |
| `loop-utils.ts` | convergence, iteration summaries, changed-file detection | **Do not port into the prompt execution MVP**; loops/workflows live in `packages/pi-society-orchestrator` |
| `index.ts` | command registration, restore state, hooks, loops, chains, skill messages, run-prompt tool | **Rewrite**, do not copy as-is; it mixes multiple ownership planes |
| `subagent-*.ts` | delegated subagent bridge/runtime/widget | **Do not keep as independent runtime**; replace with ASC seam integration |
| `tool-manager.ts` | `/prompt-tool` and `run-prompt` tool queue | **Defer** until replacement has stable command execution path |

### Behavior that must be preserved for `/commit` parity

Minimum replacement behavior for live `/commit`:

1. Discover global prompt files under `~/.pi/agent/prompts` and project prompt files under `<cwd>/.pi/prompts`.
2. Register a slash command only for templates needing extension execution semantics.
3. Parse YAML frontmatter as an object and reject invalid `model` fields deterministically.
4. Support frontmatter field `model` as:
   - bare `modelId`
   - explicit `provider/modelId`
   - comma-separated fallback list
5. If current model matches any listed candidate, keep it.
6. For ambiguous bare model IDs, order candidate providers as:
   1. `openai-codex`
   2. `anthropic`
   3. `github-copilot`
   4. `openrouter`
7. Select only candidates with usable auth through host-compatible APIs:
   - `getAvailable()`
   - `isUsingOAuth()`
   - `getApiKey()`
   - and, for our compaction/host compatibility, `getApiKeyAndHeaders()`
8. Switch model for execution and restore afterward unless `restore: false`.
9. Preserve ordinary argument substitution enough for prompt-template execution (`$1`, `$2`, `$@`, `$ARGUMENTS`, `${@:N}`, `${@:N:L}`).

## Ownership split

| Capability | Proposed owner | Reason |
|---|---|---|
| Prompt-template picker UX, `$$ /...`, `/ptx-select`, prompt prefill, deterministic slot inference | `packages/pi-prompt-template-accelerator` | PTX already owns command UX and prefill; it should not execute model/thinking semantics. |
| Shared model spec resolver (`model`, provider/model parsing, fallback ordering, auth adapter) | new shared module/package, likely under `packages/pi-interaction/` or a new `packages/pi-prompt-template-execution` internal module | Multiple consumers need identical semantics: prompt execution and compaction presets. `pi-session-compaction` must not remain the semantic source. |
| Prompt-template execution frontmatter (`model`, `thinking`, `skill`, `restore`, conditionals, args) | new monorepo successor package, tentatively `packages/pi-prompt-template-execution` | This is an execution concern distinct from PTX picker UX and compaction. It should replace `npm:pi-prompt-template-model`. |
| Loops, chains, workflow orchestration, convergence/fresh-context workflow behavior, and workflow tools | `packages/pi-society-orchestrator` | This monorepo already places loops/workflows in the orchestrator. Do not recreate them in the prompt-template successor. |
| Delegated prompt execution (`subagent`, `inheritContext`, `cwd`, parallel delegated steps if retained as compatibility syntax) | successor package as caller; ASC as runtime owner | The prompt runner may prepare tasks, but actual subagent execution must call ASC's public seam rather than carrying `subagent-runtime.ts`. Workflow composition belongs in orchestrator. |
| Custom compaction summaries and `session_before_compact` | `packages/pi-session-compaction` | Dedicated owner for compaction summary shape and summarizer integration. |
| ASC rewind aliasing / session runtime / subagent artifacts | `packages/pi-autonomous-session-control` | Existing runtime owner; may observe compaction events but should not own summary generation. |

## Why not fold everything into existing packages?

### Not `pi-prompt-template-accelerator`

PTX is a command UX and prefill accelerator. Its README and runtime registry explicitly say it observes model lifecycle but does not use the active model for suggestions. Adding model switching, restore, skill injection, loops, chains, and subagent execution would turn it into a prompt runner and blur its fast-picker contract.

### Not `pi-session-compaction`

Compaction needs compatible model resolution for presets and summarizer calls, but it should remain the compaction owner. Making it own prompt-template execution would bury `/commit` behavior in an unrelated package and repeat the original problem.

### Not `pi-autonomous-session-control`

ASC owns execution/subagent runtime behavior, not prompt-template discovery and slash-command registration. It should expose/keep a stable execution seam for delegated prompt steps, but not own prompt-template model frontmatter.

## Proposed migration architecture

```text
prompt files (~/.pi/agent/prompts, <cwd>/.pi/prompts)
        │
        ├─ Pi core prompt loader
        │    └─ plain prompt templates; description-only semantics
        │
        ├─ pi-prompt-template-accelerator
        │    └─ picker/prefill UX over visible prompt commands
        │
        └─ pi-prompt-template-execution (new successor)
             ├─ prompt discovery for extension-relevant frontmatter only
             ├─ shared model-spec resolver
             ├─ model/thinking/skill/restore execution
             ├─ optional conditionals and args
             └─ delegated execution -> ASC public execution seam

pi-society-orchestrator
        └─ owns loops/chains/workflow orchestration; prompt successor should call or defer here rather than clone workflow runtime

pi-session-compaction
        └─ imports/reuses shared model-spec resolver for summarizer presets
```

## Rollout plan with no double registration

### Phase 0 — freeze current live dependency

- Keep `npm:pi-prompt-template-model` installed.
- Do not install a successor package that registers overlapping prompt commands.
- Keep `pi-session-compaction` non-live until `session_before_compact` handler tests pass and a no-double-compaction preflight confirms no existing custom compaction owner.

### Phase 1 — shared resolver extraction

Goal: remove copied resolver semantics from `pi-session-compaction` without changing live slash commands.

Options:

1. Add a tiny shared pure module package, for example `packages/pi-interaction/pi-model-selection` or `packages/pi-prompt-template-execution/src/model-selection.js` exported for internal reuse.
2. Move the current `pi-session-compaction/extensions/session-compaction/model-resolver.js` prompt-template-model-compatible pieces into that shared module.
3. Keep compaction-specific preset resolution in `pi-session-compaction`.
4. Update compaction tests to prove the same current-model/auth/provider-priority behavior through the shared module.

Acceptance tests:

- exact `modelId`
- exact `provider/modelId`
- comma fallback
- current-model preservation
- provider priority ordering
- `getAvailable()` true path
- `getApiKey()` legacy path
- `getApiKeyAndHeaders()` host path
- model-level headers preserved
- invalid specs rejected (`*`, whitespace, malformed provider/model)

### Phase 2 — prompt-template execution MVP package

Goal: local replacement sufficient for `/commit` parity, initially not live by default during Phase 2.

Successor package created:

- `packages/pi-prompt-template-execution/`

MVP features:

- discover extension-relevant prompt templates
- validate frontmatter subset:
  - `model`
  - `description`
  - `restore`
  - optional `thinking`
- register commands for the selected templates
- execute a prompt by:
  - refreshing prompt from disk
  - resolving model via shared resolver
  - switching model when needed
  - setting thinking when present
  - substituting args
  - sending user message
  - restoring model/thinking afterward when configured
- expose a dry-run or diagnostic command to list which templates it would claim

Explicitly exclude from MVP:

- delegated `subagent`
- `loop`
- `chain`
- `fresh`
- `converge`
- `rotate`
- `/prompt-tool` and `run-prompt`
- skill injection, unless `/commit` or another critical prompt requires it before rollout

MVP tests:

- loader claims `/commit` because `model` exists
- loader ignores plain description-only templates, preventing command collisions with Pi core
- reserved command names are skipped
- project prompt overrides global prompt by name, matching external package behavior
- duplicate same-source names are skipped with diagnostics
- invalid frontmatter object/list cases fail closed
- command execution switches/restores model exactly once when needed
- current matching model does not switch
- `restore: false` leaves selected model active
- command refreshes prompt file before execution

### Phase 3 — compatibility canary before live install

Status: **closed as non-live candidate proof**.

The successor now has a non-live canary that compares external-compatible fixture expectations with monorepo behavior for:

- prompt loading decisions
- command descriptions
- model selection decisions
- invalid-frontmatter diagnostics
- `/commit` fixture execution plan
- restore, thinking, and model-conditional behavior
- invalid frontmatter/model/restore/thinking behavior
- model-less conditional prompt inheritance
- empty rendered prompt abort behavior
- `restore: false` plus `thinking` interaction

The canary does not invoke both packages live. It compares pure/fixture outputs in tests and keeps Phase 4 cutover separate from Phase 3 closure.

### Phase 4 — controlled live cutover

Status: **complete**.

Completed actions:

1. Removed `npm:pi-prompt-template-model` with `pi remove npm:pi-prompt-template-model`.
2. Installed local successor package with `pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-execution`.
3. Reloaded Pi.
4. Verified exactly one extension execution owner for `/commit`, sourced from `packages/pi-prompt-template-execution/extensions/prompt-template-execution.js`.
5. Verified `/commit` safely in a throwaway repo using an aborting probe: it switched from `openai-codex/gpt-5.4` to `zai/glm-5.1`, rendered the commit orchestrator prompt, substituted `$ARGUMENTS`, and restored the original model afterward.
6. Verified `pi-session-compaction` remained non-live and no loop/chain/subagent runtime was added.

Post-cutover interpretation:

- Pi core may still expose a prompt-source `/commit` entry from `~/.pi/agent/prompts/commit.md` after Prompt Vault export.
- That prompt-source entry is metadata/template-expansion visibility, not a prompt-template execution owner.
- The no-duplicate execution invariant is therefore: exactly one extension execution owner for `/commit`.

Rollback:

- uninstall/disable successor package
- reinstall `npm:pi-prompt-template-model`
- reload Pi
- verify `/commit` works again

## Feature backlog after MVP

### Skill injection

Keep semantics from the external package:

- `skill` or `skill:<name>`
- registered skill command path via `pi.getCommands()` and `sourceInfo.path`
- project `.pi/skills`
- `.agents/skills` in cwd ancestors to repo root
- global `~/.pi/agent/skills`
- global `~/.agents/skills`
- fail fast if missing/unreadable

Implementation should use a next-turn/context message as the external package now does, not hidden system-prompt mutation.

### Inline model conditionals

Keep if existing prompt templates use them:

- `<if-model is="...">`
- `<else>`
- nested blocks
- exact model IDs, explicit provider/model IDs, provider wildcards for conditionals only
- render after fallback resolution

### Loops, chains, and workflows

Do **not** port these as prompt-template successor-owned runtime features:

- `loop: N | true | unlimited`
- `fresh`
- `converge`
- `rotate`
- `chain`
- `chainContext: summary`
- `parallel(...)`
- `/prompt-tool` or workflow-like `run-prompt` behavior

This monorepo already places loops and workflows in `packages/pi-society-orchestrator/`. If compatibility with external `pi-prompt-template-model` chain/loop prompts is required later, implement an explicit translation/delegation layer to orchestrator-owned workflow surfaces instead of cloning the runtime in `pi-prompt-template-execution`.

### Delegated prompt execution

Do not port `subagent-runtime.ts` as an independent runtime.

Successor package should call ASC's public execution seam. The prompt runner may own:

- resolving the prompt
- rendering the task text
- passing model/profile/cwd/inherit-context intent
- receiving/displaying result summaries

ASC owns:

- process spawning
- transport protocol
- session artifacts
- timeout/abort handling
- concurrency/session-name invariants
- prompt-envelope provenance where applicable

## Compaction-specific implications

`pi-session-compaction` followed this plan:

1. port files-touched collection/tests from dot314
2. port user prompt/command preservation
3. wire `session_before_compact`
4. add handler-level integration tests
5. install only after no other compaction override is enabled

The shared resolver should combine three inputs:

1. `pi-prompt-template-model` semantics for prompt/frontmatter model specs and fallback ordering
2. dot314 grounded-compaction semantics for presets and summarizer integration
3. local host compatibility adapter for `getApiKeyAndHeaders` vs `getApiKey`

Compaction keeps these package-local concepts:

- `defaultPreset`
- `presets`
- `includeFilesTouched`
- `--preset` / `-p` parsing
- focus text after preset selection
- `session_before_compact` summary contract
- optional `session_before_tree` augmentation

## Compatibility risks

| Risk | Mitigation |
|---|---|
| Duplicate `/commit` registration | Successor package must stay uninstalled or registration-disabled until external package is disabled; add a diagnostic claimed-command list. |
| Divergent model fallback semantics | Extract pure resolver and test against external behavior fixtures. |
| Host API drift (`getApiKey` vs `getApiKeyAndHeaders`) | Shared auth adapter must support both and preserve model headers. |
| Plain prompts get claimed accidentally | Loader should ignore model-less templates without extension-specific config, matching external package hardening. |
| Project/global prompt precedence changes | Test global first, project override behavior. |
| Subagent runtime duplication | Do not copy external `subagent-runtime.ts`; integrate with ASC seam only. |
| `/prompt-tool` exposes autonomous command execution too early | Defer until successor command execution has stable guardrails and operator-visible config. |
| Chain/loop semantics get duplicated outside society orchestrator | Do not port legacy prompt-template loop/chain runtime; route or translate workflow needs to `packages/pi-society-orchestrator/`. |
| Compaction package accidentally becomes prompt runner | Shared resolver extraction should move generic semantics out of compaction. |

## First safe implementation slice

The safest next code slice is **shared resolver extraction**, not live command replacement:

1. Choose the shared module/package location.
2. Move generic model-selection primitives out of `pi-session-compaction`:
   - `PREFERRED_PROVIDERS`
   - `parseModelSpecList`
   - `selectModelCandidate`
   - provider/model parsing
   - auth adapter supporting both host APIs
3. Keep preset matching and summarizer-specific errors in `pi-session-compaction`.
4. Run `cd packages/pi-session-compaction && npm run check`.
5. Add successor package only after the resolver is shared and stable.

Status: implemented as a private shared package at `packages/pi-interaction/pi-model-selection` (`@tryinget/pi-model-selection`). `pi-session-compaction` imports that package and keeps compaction-specific preset/thinking behavior local.

Follow-up status: `pi-session-compaction` also now has package-local files-touched collection and manifest helpers ported from dot314 grounded-compaction. This does not enable the live compaction hook.

Second follow-up status: `pi-session-compaction` now has package-local user prompt / command preservation helpers ported from legacy `pi-user-prompt-compaction`, including `/compact <customInstructions>` preservation. This still does not enable the live compaction hook.

Third follow-up status: `pi-session-compaction` now has a tested `session_before_compact` handler module that assembles summaries from the shared model resolver, files-touched manifests, and user-prompt preservation helpers. It was initially non-live until the guarded cutover.

Fourth follow-up status: `pi-session-compaction` now has a fail-closed registration guard for hook activation. It requires explicit enablement, handler-test confirmation, no-double-compaction preflight confirmation, explicit zero existing compaction handlers, and duplicate package-registration protection.

Fifth follow-up status: `pi-session-compaction` now has non-live branch-tree summary augmentation helpers for optional `session_before_tree` instructions with files-touched grounding. This still does not register any `session_before_tree` hook.

Sixth follow-up status: `packages/pi-prompt-template-execution` now exists as a private non-live successor foundation created from `../pi-extensions-template`. It has pure loader, argument substitution, model conditional rendering, and execution-plan tests for `model`/`thinking`/`restore` semantics, while explicitly skipping chain/loop/subagent ownership.

Seventh follow-up status: `packages/pi-prompt-template-execution` now has a non-live fail-closed command registration guard. It requires explicit enablement, loader/execution test confirmation, no-double-registration preflight confirmation, an explicit existing-command snapshot, and blocks collisions such as an already registered `/commit`.

Eighth follow-up status: `packages/pi-prompt-template-execution` now has a non-live command runner that refreshes prompt templates at invocation time and executes through injected host actions, including model/thinking switch and restore behavior. It still does not register slash commands or mutate live Pi state unless a future guarded entrypoint calls it.

Ninth follow-up status: `packages/pi-prompt-template-execution` now has a non-live dry-run diagnostic report (`src/diagnostic-report.js`) that lists would-be claimed templates, loader diagnostics, explicit command-snapshot collisions, and registration readiness without host mutation. It also has real `/commit` fixture parity tests based on `/home/tryinget/.pi/agent/prompts/commit.md`, including `model: zai/glm-5.1`, command-description shape, execution-plan switch/restore intent, `$ARGUMENTS` substitution, and proof that an existing `/commit` command snapshot blocks successor registration.

Tenth follow-up status: `packages/pi-prompt-template-execution` now has a tested Pi host adapter (`src/host-adapter.js`) for `pi.setModel`, `pi.setThinkingLevel`, `pi.sendUserMessage`, `pi.getThinkingLevel`, and UI notification behavior. Guarded registration now wires to the same non-live command runner when no custom handler is supplied, but remains disabled by default behind explicit enablement and no-double-registration proof. This does not add package manifest live hooks or duplicate slash commands.

Eleventh follow-up status: `packages/pi-prompt-template-execution` now has pure compatibility canary helpers (`src/compat-canary.js`) that compare monorepo prompt loading, command descriptions, invalid diagnostics, model-selection summaries, and `/commit` execution-plan summaries against explicit external-compatible fixture expectations. The canary does not import, register, or run `npm:pi-prompt-template-model` live.

Twelfth follow-up status: `packages/pi-prompt-template-execution` now has skill frontmatter parity helpers (`src/skills.js`) for registered skill commands, project `.pi/skills`, ancestor `.agents/skills`, global Pi skills, global agent skills, frontmatter stripping, and `skill-loaded` message shaping. The non-live command runner queues the resolved skill message before sending the rendered prompt and fails closed if the skill is missing. There is still no live `before_agent_start` hook or package manifest entrypoint.

Thirteenth follow-up status: the pure compatibility canary now also covers restore, thinking, model-conditionals, and invalid frontmatter/model/restore/thinking fixture behavior in addition to `/commit`, model selection, and loading summaries.

Fourteenth follow-up status: the non-live command runner now supports deferred agent-end style restore by returning explicit restore intent and exposing `restorePromptTemplateSessionState(...)`, while still restoring immediately if `sendUserMessage` fails. This gives a tested path toward matching external prompt-template-model restore timing without registering a live `agent_end` hook yet.

Fifteenth follow-up status: `packages/pi-prompt-template-execution` now has a prompt-template-model-compatible model conditional renderer (`src/model-conditionals.js`) with nested conditionals, comma-separated specs, provider wildcards, and fail-soft invalid-markup diagnostics that leave content unchanged. This replaces the first simple regex renderer without adding loop/chain/workflow ownership.

Sixteenth follow-up status: `packages/pi-prompt-template-execution` now has a non-live safety report helper (`src/safety-report.js`) that summarizes manifest posture, explicit command-snapshot collisions, and external `npm:pi-prompt-template-model` presence as live-cutover blockers. It is report-only and does not register commands, install packages, reload Pi, or activate hooks.

Seventeenth follow-up status: the pure compatibility canary now also covers model-less conditional prompt inheritance, empty rendered prompt abort behavior, and the interaction between `restore: false` and `thinking`. This remains fixture-only and does not load or mutate the external live package.

Eighteenth follow-up status: `packages/pi-prompt-template-execution/docs/project/2026-04-24-live-cutover-plan.md` recorded the plan-only Phase 4 checklist: preconditions, no-double-registration proof expectations, install/reload steps, rollback, and owner boundaries.

Nineteenth follow-up status: Phase 4 cutover is complete. The live entrypoint `packages/pi-prompt-template-execution/extensions/prompt-template-execution.js` is installed through `package.json#pi.extensions`, `npm:pi-prompt-template-model` has been removed, `/commit` behavior was verified safely, and the cutover plan now records closeout proof plus rollback.

Phase 3 closeout status: Phase 3 is closed as a non-live candidate proof after the prompt-template execution, session-compaction, and shared model-selection checks passed.

Phase 4 closeout status: Phase 4 is closed as a controlled live cutover. `packages/pi-prompt-template-execution` is now the live prompt-template execution owner, `npm:pi-prompt-template-model` has been removed, and `/commit` behavior was verified safely.

Compaction cutover status: `packages/pi-session-compaction` later became the guarded live local `session_before_compact` owner after package checks passed and installed-package inventory showed no existing compaction override. It remains separate from prompt-template execution and still must not be enabled alongside another custom compaction owner.
