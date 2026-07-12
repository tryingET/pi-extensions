---
summary: "Prompt mode switching with explicit base-prompt and final-prompt replacement semantics."
read_when:
  - "Installing, operating, or extending @tryinget/pi-modes."
system4d:
  container: "Installable Pi prompt-mode package."
  compass: "Switch complete prompt policies without confusing base replacement, final replacement, or autonomy."
  engine: "Discover modes -> validate -> activate -> compose -> restore from session state."
  fog: "Prompt composition layers are easy to conflate and can silently discard dynamic context."
---

# @tryinget/pi-modes

Switch Pi prompt profiles during a session without restarting Pi.

The package makes the distinction that matters:

- `append` keeps Pi's fully assembled prompt and adds mode instructions;
- `replace_base` changes the complete static base prompt while preserving Pi's dynamic append/context/skills/date/cwd envelope;
- `replace_final` deliberately replaces the final assembled prompt with exact text.

`replace_base` corresponds to the intent of Pi's native `--system-prompt` and `SYSTEM.md` features.

## Native base and named alternatives

Pi's native base-prompt files remain the default source of truth:

```text
<project>/.pi/SYSTEM.md
~/.pi/agent/SYSTEM.md
```

Starting Pi normally uses the trusted project `SYSTEM.md`, then the global `SYSTEM.md`, then Pi's built-in base according to Pi's native resource rules. `pi-modes` does not add a parallel project-default file. Named modes under `.pi/modes/` and `~/.pi/agent/modes/` are explicit alternatives to that native base.

When no named mode is active—or after `/mode off`—the extension returns control to Pi unchanged, so the native `SYSTEM.md` base and dynamic envelope remain active.

## Commands

| Command | Purpose |
|---|---|
| `/mode` | Select a discovered mode. |
| `/mode <key>` | Activate a mode directly. |
| `/mode off` | Restore the host prompt for future turns. |
| `/mode-status` | Add a durable TUI-only status card with active mode, native-base fallback, available keys, and diagnostics. |
| `/mode-preview [key]` | Preview the final composed prompt without activating it; without a key, open the mode selector. |
| `/mode-new [--project] <key>` | Create a global or trusted-project mode in an editor. |
| `/mode-edit <key>` | Edit a custom mode using its validated discovered path. |
| `/mode-delete <key>` | Confirm and delete a custom mode safely. |

The package includes small built-in `plan`, `review`, and `explain` append modes.

`/mode-status` is stored as a custom session entry and rendered in the transcript without entering LLM context. Its compact view shows the active selection and counts; expand it through Pi's normal message-expansion control to see strategy, scope, available keys, and malformed-file diagnostics.

## Launch-time selection

Set `PI_MODE` to select a named alternative when Pi starts:

```bash
PI_MODE=focused-builder pi
PI_MODE=review pi
PI_MODE=off pi
```

Startup precedence is intentionally small:

1. a non-blank `PI_MODE` explicitly selects a named mode or `off`;
2. otherwise, a resumed/reloaded session restores its latest `/mode` selection;
3. otherwise, Pi uses its native project/global `SYSTEM.md` or built-in base.

`PI_MODE=off` (also `default` or `none`) explicitly selects the native `SYSTEM.md`/host base. An unavailable or invalid `PI_MODE` fails closed to that native base and reports a warning. The resolved launch selection is written to the Pi session branch, so later turns remain stable; an interactive `/mode` command can change it afterward.

## Mode files

Global modes:

```text
~/.pi/agent/modes/*.json
```

Trusted ancestor/project modes:

```text
<filesystem-root>/.pi/modes/*.json
...
<company>/.pi/modes/*.json
...
<cwd>/.pi/modes/*.json
```

Discovery mirrors Pi's `AGENTS.md` layering: load the global mode directory, then ancestor `.pi/modes` directories from filesystem root down to the active cwd. Deeper definitions override shallower definitions with the same key; every project definition overrides global and built-in definitions. This lets `~/ai-society/.pi/modes`, company-level `.pi/modes`, lane-level `.pi/modes`, and repo-local `.pi/modes` form one predictable hierarchy.

All ancestor/project mode directories are ignored when the active project is not trusted. `/mode-new --project <key>` writes only to the active cwd's `.pi/modes`; it never mutates an ancestor implicitly. Inherited modes are selectable and previewable but read-only from descendant cwd sessions—change to the owning ancestor directory before using `/mode-edit` or `/mode-delete`.

Discovery and persistence reject symbolic links in any path component, including a symlinked `.pi` parent, so an inherited mode cannot escape its declared filesystem hierarchy.

Example:

```json
{
  "schemaVersion": 1,
  "key": "focused-builder",
  "label": "Focused Builder",
  "description": "A complete static coding-agent identity.",
  "promptStrategy": "replace_base",
  "systemPrompt": "You are a focused coding agent. Drive the requested task to verified completion."
}
```

A missing `promptStrategy` defaults to `replace_base`.

More examples are in [`examples/modes`](examples/modes).

## Prompt composition

### `append`

```text
host assembled prompt
+ active-mode section
```

### `replace_base`

```text
mode systemPrompt
+ APPEND_SYSTEM.md / --append-system-prompt
+ trusted AGENTS.md / CLAUDE.md context
+ visible skills when read is active
+ date
+ cwd
```

### `replace_final`

```text
mode systemPrompt exactly
```

`replace_final` intentionally does not retain project context, skills, date, cwd, or appended instructions. Use it for controlled exact-prompt experiments rather than by accident.

## Safety and scope

- Mode keys are validated before path construction.
- JSON files are parsed independently; one malformed file does not hide later valid modes.
- Saves use same-directory temporary files plus atomic rename.
- Edit/delete operate only on discovered global/project files.
- Mode selection is persisted in session custom entries and restored on resume/reload when `PI_MODE` does not explicitly override startup.
- The native project/global `SYSTEM.md` remains the default base; named modes are alternatives, not another default layer.

Mode activation changes prompt policy only. It does not send follow-up messages, continue automatically, launch peers/subagents/campaigns, or grant mutation or promotion authority. Future autonomy integration is intentionally separate.

Architecture: [`docs/project/2026-07-11-prompt-mode-architecture.md`](docs/project/2026-07-11-prompt-mode-architecture.md)  
Implementation plan: [`docs/project/2026-07-11-implementation-plan.md`](docs/project/2026-07-11-implementation-plan.md)

## Install and verify

```bash
git clone https://github.com/tryingET/pi-extensions.git
cd pi-extensions/packages/pi-modes
npm install
npm run check
pi install "$PWD"
```

Then run `/reload` and verify with:

```text
/mode review
/mode-status
/mode-preview review
/mode off
```

## Attribution

The concept and command vocabulary were informed by Maxime Rivest's MIT-licensed [`pi-modes`](https://github.com/MaximeRivest/pi-modes). This package uses a separately structured implementation with explicit composition strategies, trust gating, safe persistence, and tests.
