---
summary: "Steve-specific Pi session presence sidecar and Ghostty/Niri hot-restore contract for exact session-file recovery."
read_when:
  - "You are wiring Pi session identity into Steve's Ghostty/Niri observation or restore stack."
  - "You need the exact reason this package publishes session sidecars and title suffixes."
system4d:
  container: "A Pi package extension exporting live session identity to Steve's workstation restore layer."
  compass: "Make exact Pi session files observable outside the Pi process without asking the operator to re-pick sessions."
  engine: "Publish sidecar -> expose title -> let workstation capture/plan consume exact session context."
  fog: "The main risk is coupling generic Pi behavior too tightly to one desktop setup without documenting the boundary."
---

# 2026-04-12 — Session presence for Steve hot restore

This package now includes a **session-presence** extension aimed at a very specific workstation setup:

- Arch Linux desktop
- Ghostty terminals
- Niri window observation / restore tooling
- Pi sessions stored under `~/.pi/agent/sessions/`
- restore intent: reopen the exact Pi session file, not a generic picker

## Why this exists

The normal Pi runtime knows the current session file internally through:

- `ctx.sessionManager.getSessionFile()`
- `ctx.sessionManager.getSessionId()`

But the surrounding desktop/session-restore stack cannot see that exact information unless Pi publishes it.

That gap matters on Steve because the workstation restore logic wants to answer:

1. **which Ghostty window corresponds to which Pi session file?**
2. **what should be relaunched after a terminal crash?**
3. **how can hourly observation record the exact session context rather than only a guessed title?**

## What the extension does

### 1. Publishes a live sidecar JSON per active Pi process

Default location:

- `$XDG_RUNTIME_DIR/pi-session-presence/<pid>.json`
- fallback: `~/.local/state/pi-session-presence/<pid>.json`

Example payload:

```json
{
  "schemaVersion": 1,
  "source": "@tryinget/pi-little-helpers/session-presence",
  "pid": 2520262,
  "cwd": "/home/tryinget/ai-society/softwareco/owned/agent-kernel",
  "cwdLabel": "agent-kernel",
  "sessionId": "77bc82bb-21b8-4651-a058-8b6e4d50636c",
  "sessionIdShort": "77bc82bb",
  "sessionFile": "/home/tryinget/.pi/agent/sessions/--home-tryinget-ai-society-softwareco-owned-agent-kernel--/2026-04-11T19-25-03-681Z_77bc82bb-21b8-4651-a058-8b6e4d50636c.jsonl",
  "sessionName": "AK hotfix",
  "tty": "/dev/pts/6",
  "piBin": "pi",
  "resumeArgv": [
    "pi",
    "--session",
    "/home/tryinget/.pi/agent/sessions/--home-tryinget-ai-society-softwareco-owned-agent-kernel--/2026-04-11T19-25-03-681Z_77bc82bb-21b8-4651-a058-8b6e4d50636c.jsonl"
  ],
  "windowTitleBase": "π - agent-kernel",
  "windowTitle": "π - agent-kernel · 77bc82bb",
  "publishedAt": "2026-04-12T02:30:00.000Z"
}
```

### 2. Sets the terminal title to include the short session id

Default title format:

```text
π - <cwd basename> · <session-id-short>
```

Example:

```text
π - agent-kernel · 77bc82bb
```

That title is intentionally chosen so the surrounding desktop stack can correlate:

- Ghostty/Niri observed window title
- Pi runtime sidecar JSON
- exact session file under `~/.pi/agent/sessions/`

### 3. Cleans up stale sidecars on publish

Whenever the extension republishes state, it removes dead `<pid>.json` files whose process is no longer present under `/proc`.

This keeps the directory useful even when terminals crash.

## Lifecycle hooks used

The extension republishes on:

- `session_start`

using the modern post-`0.65.0` lifecycle contract where `session_start` carries:

- `startup`
- `reload`
- `new`
- `resume`
- `fork`

through `event.reason`.

It removes its sidecar on:

- `session_shutdown`

That means it updates after:

- initial load
- `/resume`
- `/new`
- `/fork`
- `/reload` runtime replacement

without depending on removed legacy events such as `session_switch` or `session_fork`.

## Commands

### `/session-presence`

Republish the current sidecar and show a short status message.

### `/session-presence path`

Show the exact current session file.

### `/session-presence json`

Show the exact sidecar JSON path.

### `/session-path`

Shortcut that prints only the current session file.

## Why restore should use `--session`, not `--resume`

For Steve's hot-restore flow, the important distinction is:

- `pi --resume` → opens the interactive picker
- `pi --session <path>` → resumes the exact known session file directly

If the hourly observer has already recorded the exact `sessionFile`, then the truthful restore command is:

```bash
ghostty --title='π - agent-kernel · 77bc82bb' \
  -e bash -ic 'cd /home/tryinget/ai-society/softwareco/owned/agent-kernel && exec pi --session /home/tryinget/.pi/agent/sessions/--home-tryinget-ai-society-softwareco-owned-agent-kernel--/2026-04-11T19-25-03-681Z_77bc82bb-21b8-4651-a058-8b6e4d50636c.jsonl'
```

This is the exact hot-restore seam the workstation stack needs.

## Environment knobs

### `PI_SESSION_PRESENCE_DIR`

Override the sidecar directory.

### `PI_SESSION_PRESENCE_PI_BIN`

Override the Pi binary stored in `resumeArgv`.

Default:

```text
pi
```

### `PI_SESSION_PRESENCE_TITLE_MODE`

Controls title publication.

Supported values:

- `session-short-id` (default)
- `off`

For Steve's Niri/Ghostty restore coupling, leave this at the default.

## Limitations

- This is **specific to Steve-style desktop restore coupling**; it is not a generic cross-platform session manager.
- The sidecar tells the outside world which Pi session is active, but it does **not** force Ghostty to reopen that session by itself. The restore layer still has to consume the sidecar and spawn the terminal.
- If a session is ephemeral / no-session, the sidecar still exists, but exact file restore is not possible because there is no saved `sessionFile`.

## Intended downstream consumer

The workstation session capture / planner should consume this sidecar to produce Ghostty recipe entries that prefer:

```bash
pi --session <exact-session-file>
```

instead of:

```bash
pi --resume
```

That is the main value of this helper.
