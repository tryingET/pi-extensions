---
summary: "Architecture for prompt modes that replace Pi's static base prompt without confusing mode selection with autonomy."
read_when:
  - "Changing prompt composition, mode storage, activation, or cross-package boundaries."
  - "Evaluating whether a mode may trigger autonomous behavior."
system4d:
  container: "Session-local prompt-mode extension."
  compass: "Make complete base-prompt replacement first-class while preserving Pi's dynamic envelope by default."
  engine: "Discover -> validate -> activate -> compose -> persist session selection."
  fog: "A final-prompt override can be mistaken for a base-prompt override, and a mode name can be mistaken for execution authority."
---

# Prompt-mode architecture

## Decision

`pi-modes` owns prompt-profile discovery, validation, selection, prompt composition, session-local persistence, and operator visibility.

It supports three explicit strategies:

| Strategy | Result |
|---|---|
| `append` | Keep Pi's assembled prompt and append mode instructions. |
| `replace_base` | Replace Pi's static base, then preserve the documented dynamic envelope: append prompt, trusted context files, visible skills, date, and cwd. |
| `replace_final` | Send exactly the configured mode prompt. No dynamic section is retained automatically. |

`replace_base` is the primary strategy. It matches the intent of Pi's `--system-prompt` and `SYSTEM.md` surfaces. `replace_final` is an explicit expert escape hatch rather than an accidental side effect.

Pi's native `<project>/.pi/SYSTEM.md` and `~/.pi/agent/SYSTEM.md` remain the default base-prompt authority. This package does not add a second project-default selector. Named `replace_base` modes are explicit alternatives; no active mode and `/mode off` both return control to the native host assembly unchanged.

## Why this package exists

Pi exposes complete base-prompt replacement at process start, while `before_agent_start` exposes the already assembled prompt. A session mode therefore needs to distinguish changing the base from replacing the final assembly. The extension reconstructs Pi's documented custom-base branch from `event.systemPromptOptions` until Pi exposes a supported host builder or a `systemPromptOptions` return patch.

## Runtime flow

```text
native <cwd>/.pi/SYSTEM.md or ~/.pi/agent/SYSTEM.md host base
+ global built-ins
+ ~/.pi/agent/modes/*.json
+ trusted ancestor .pi/modes/*.json from filesystem root to cwd
-> validate each mode file independently
-> deepest project overrides shallower project, global, then builtin by key
-> explicit PI_MODE launch selection, otherwise latest session selection
-> append changed selection to the active session branch
-> before_agent_start composes the selected strategy
-> no selection/off returns the native host base unchanged
-> footer shows an active named mode
```

Ancestor discovery mirrors Pi's `AGENTS.md` load order: filesystem root down to cwd, with the deepest matching key winning. Project mode files are ignored unless `ctx.isProjectTrusted()` is true. Invalid files produce diagnostics without preventing other modes from loading. `/mode-new --project` writes only at the active cwd. Writes use validated keys and atomic same-directory rename; edit/delete never accept a raw path.

A non-blank `PI_MODE` is an explicit process-start override and therefore takes precedence over the restored session selection. `off`, `default`, and `none` select the native host base. Invalid or unavailable values fail closed to that native base with a warning. When `PI_MODE` is absent or blank, session branch replay remains authoritative. Interactive `/mode` commands may change the resolved startup selection for later turns.

## Mode contract

```json
{
  "schemaVersion": 1,
  "key": "focused-builder",
  "label": "Focused Builder",
  "description": "Complete coding-agent identity for focused implementation.",
  "promptStrategy": "replace_base",
  "systemPrompt": "You are ..."
}
```

A missing `promptStrategy` defaults to `replace_base`, making simple custom modes behave like Pi's custom system-prompt feature.

## Trust and authority boundary

Mode activation changes prompt policy only. It does not:

- call `pi.sendUserMessage`;
- continue after `agent_settled`;
- dispatch subagents or peers;
- start visible loops or autoresearch campaigns;
- mutate AK, Prompt Vault, KES, ROCS, or evidence;
- grant mutation, promotion, or publication authority.

Future autonomy work must consume a separate explicit handoff request through its owning runtime. A mode name such as `research` or `autonomous` is never authorization.

## Future host improvement

Prefer an upstream Pi API equivalent to one of:

```ts
ctx.buildSystemPrompt({ ...event.systemPromptOptions, customPrompt })
```

or:

```ts
return { systemPromptOptions: { customPrompt } };
```

Once supported and compatibility-tested, replace the package-local parity builder with the host builder to eliminate composition drift.

## Attribution

The product concept and command vocabulary were informed by Maxime Rivest's MIT-licensed [`pi-modes`](https://github.com/MaximeRivest/pi-modes). This implementation is independently structured around explicit prompt-composition strategies, project trust, safe persistence, and package-local tests.
