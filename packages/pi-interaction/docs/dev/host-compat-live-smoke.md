---
summary: "Live smoke checklist for recent Pi host compatibility fixes across interaction packages."
read_when:
  - "Running an interactive verification pass after Pi host updates or extension compatibility patches."
system4d:
  container: "Cross-package live verification guide."
  compass: "Catch host/runtime skew in the real interactive TUI before release."
  engine: "Reload -> exercise editor autocomplete -> exercise PTX -> exercise overlay -> exercise vault boundary."
  fog: "Package/unit tests can pass while live host wiring still drifts."
---

# Host compatibility live smoke

Use this after changing any of the following:

- `packages/pi-interaction/pi-editor-registry`
- `packages/pi-prompt-template-accelerator`
- `packages/pi-context-overlay`
- Pi host version / global `@mariozechner/pi-coding-agent`

## Preconditions

Install the local packages into Pi from their package paths:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-context-overlay
```

Optional if validating vault coexistence:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
```

## Reload

In Pi:

```text
/reload
```

## Smoke flow

### 1. Interaction runtime loads

Run:

```text
/triggers
```

Confirm:
- interaction runtime commands respond
- no startup/runtime crash appears

### 2. PTX autocomplete / picker path

Type:

```text
$$ /
```

Confirm:
- no `suggestions.items.length` crash
- picker/autocomplete opens
- selecting a template writes back into the editor

### 3. Force completion / explicit tab path

In a context where autocomplete should appear, press `Tab` explicitly.

Confirm:
- no crash from explicit-tab completion
- single-result completions apply cleanly when appropriate

### 4. Context overlay path

Run:

```text
/c
```

Confirm:
- overlay opens
- footer renders key hints correctly
- no `appKeyHint is not a function` error

### 5. Vault boundary check

Run:

```text
/vault
```

Confirm:
- vault commands still work
- PTX and vault remain distinct surfaces:
  - PTX = installed/exported prompt commands
  - vault = visible Prompt Vault template space

## Capture drift explicitly

If any live-only mismatch appears:

- record it in `packages/pi-interaction/next_session_prompt.md`
- if overlay-specific, also record it in `packages/pi-context-overlay/next_session_prompt.md`
- include:
  - Pi host version
  - failing command/keystroke
  - stack trace or exact message
  - whether package tests still passed
