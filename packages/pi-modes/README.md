---
summary: "Composable, drift-aware Pi prompt modes with one base and ordered overlays."
read_when:
  - "Installing, operating, or extending @tryinget/pi-modes."
system4d:
  container: "Installable Pi prompt-mode package."
  compass: "Compose prompt policy without confusing base replacement, exact-final replacement, or execution authority."
  engine: "Discover -> validate -> select/preset -> fingerprint -> compose -> observe -> reapprove drift."
  fog: "Prompt layers, inherited definitions, and extension ordering can silently change effective model context."
---

# @tryinget/pi-modes

Switch and compose Pi prompt profiles during a session without restarting Pi.

A composition contains zero or one base plus zero or more ordered overlays:

- `append` definitions are overlays that retain the chosen base;
- `replace_base` definitions replace the static base while preserving Pi's dynamic append/context/skills/cwd envelope;
- `replace_final` definitions replace the final prompt with exact configured bytes at this extension's composition point and are exclusive;
- native host with no overlays leaves Pi unchanged.

Mode activation changes prompt policy only. It never grants tools, mutation, continuation, peer launch, campaign execution, publication, promotion, or other authority.

## Commands

| Command | Purpose |
|---|---|
| `/mode` | Open the atomic searchable selector: one base plus ordered overlays. |
| `/mode <key>` | Select one base, or native plus one legacy-style append overlay. |
| `/mode +<overlay>` / `/mode -<overlay>` | Add or remove one overlay while preserving the base and validating contracts. |
| `/mode set <base\|native> [--overlay <key>]...` | Apply an exact composition in listed order. |
| `/mode off` | Clear base and overlays. |
| `/mode save [--project] <preset>` | Save the active composition as a named preset without embedding prompt text. |
| `/mode use <preset> [--confirm-exact]` | Validate and atomically activate a preset. |
| `/mode export <preset>` | Export strict JSON plus a portable base64url payload. |
| `/mode import [--project] <preset> [--data <base64url>]` | Import without activation; TUI callers may edit JSON. |
| `/mode presets` | List discovered named compositions and diagnostics. |
| `/mode-status [--json]` | Show selection, effective components, hashes, estimates, provenance, drift, and fallback. |
| `/mode-preview [--json] [selection]` | Preview components and the composed prompt without activation. |
| `/mode-reapprove [--confirm-exact]` | Explicitly accept changed active definitions and refresh fingerprints. |
| `/mode-policy <block\|warn\|allow>` | Choose what later definition drift does; `block` is the default. |
| `/mode-new [--project] <key>` | Save a new strict mode without activating it. |
| `/mode-edit <key>` | Edit a custom mode; active edits become blocked drift until reapproved. |
| `/mode-delete <key>` | Confirm and safely delete an owned custom mode. |

The package includes `plan`, `review`, and `explain` append overlays.

Mode keys that match command words such as `presets`, `save`, or `use` remain addressable without ambiguity through `/mode set <key>`.

### Interactive selector

Type to filter by key, label, description, strategy, or scope. Use Ctrl+U to clear, Up/Down to navigate the bounded choice window, Enter/Space to toggle, Alt+Up/Down to reorder checked overlays, then Apply or Cancel atomically. The selected row always remains visible even at the discovery bound. A details pane shows description, provenance, contracts, effective bytes/token estimate/hash, host-byte delta, and validation diagnostics.

Selecting or reapproving a new or drifted `replace_final` definition always requires TUI confirmation. Headless/RPC activation requires the explicit `--confirm-exact` acknowledgement:

```text
/mode exact-minimal --confirm-exact
/mode set exact-minimal --confirm-exact
/mode-reapprove --confirm-exact
```

Pi currently may report transport-level command acceptance after an extension command emits `extension_error`; automation must inspect the error event/stderr rather than exit/success alone.

### Headless observability

`/mode-status --json` and `/mode-preview --json` emit one deterministic JSON object. Preview includes the composed prompt; status includes only metadata and hashes. Non-TUI status/preview use JSON automatically. Pi currently redirects extension `console` output to process stderr and does not correlate it as an RPC result event, so automation must capture stderr together with `extension_error`; the JSON line is machine-parseable, but its channel is a host limitation.

## Launch-time selection

Single-key compatibility remains available:

```bash
PI_MODE=focused-builder pi
PI_MODE=review pi
PI_MODE=off pi
```

Structured startup composition uses strict JSON and takes precedence over `PI_MODE`:

```bash
PI_MODES='{"baseKey":"focused-builder","overlayKeys":["review","explain"]}' pi
```

Startup `replace_final` is also fail-closed and requires a separate explicit acknowledgement for either startup selector:

```bash
PI_MODE=exact-minimal PI_MODE_CONFIRM_EXACT=1 pi
PI_MODES='{"baseKey":"exact-minimal","overlayKeys":[]}' PI_MODE_CONFIRM_EXACT=1 pi
```

Startup precedence:

1. nonblank `PI_MODES`;
2. nonblank `PI_MODE`;
3. newest recognized active-branch session entry;
4. native project/global `SYSTEM.md` or Pi's built-in base.

Invalid or unavailable startup selections fail closed to native host and write authoritative fingerprinted state so an older selection cannot unexpectedly reactivate.

## Discovery

Global modes and presets:

```text
~/.pi/agent/modes/*.json
~/.pi/agent/mode-presets/*.json
```

Trusted ancestor/project layers:

```text
<filesystem-root>/.pi/modes/*.json
...
<cwd>/.pi/modes/*.json

<filesystem-root>/.pi/mode-presets/*.json
...
<cwd>/.pi/mode-presets/*.json
```

Discovery follows Pi's `AGENTS.md` direction: global first, then filesystem root to cwd, with deeper keys overriding shallower keys. Untrusted projects contribute no ancestor definitions or presets. Inherited artifacts are selectable but read-only from descendants; project authoring writes only to cwd. Symlink boundaries, path traversal, oversized inputs, and malformed files fail closed per file.

## Strict mode schema v2

```json
{
  "schemaVersion": 2,
  "key": "hard-nosed-review",
  "label": "Hard-nosed Review",
  "description": "Adversarial correctness review.",
  "promptStrategy": "append",
  "systemPrompt": "Challenge assumptions and demand concrete evidence.",
  "requires": ["plan"],
  "conflictsWith": ["minimal-output"],
  "after": ["plan"]
}
```

Schema v2 requires an explicit strategy and rejects unknown fields, noncanonical keys, unsafe display text, oversized prompts, duplicates, self-reference, contradictory contracts, and invalid contract roles. Legacy schema v1 remains readable and retains its historical missing-strategy default of `replace_base`; saving through current authoring writes v2.

Optional contracts:

- `requires`: every named component must also be selected;
- `conflictsWith`: the composition is invalid when a named component is selected;
- `before` / `after`: conditional ordering assertions for append overlays when both keys are selected.

Contracts never auto-add, auto-remove, or auto-reorder. Invalid candidates are rejected atomically; replay-time contract failure returns native host with diagnostics.

Packaged schemas live under [`schemas`](schemas). Lint files with:

```bash
npm run mode:lint -- path/to/mode.json path/to/preset.json
```

## Named composition presets

Presets store only keys and overlay order—not prompt text, authority, objectives, tools, or drift bypasses:

```json
{
  "schemaVersion": 1,
  "key": "deep-review",
  "label": "Deep Review",
  "selection": {
    "baseKey": "focused-builder",
    "overlayKeys": ["plan", "review"]
  }
}
```

Preset import/use resolves current trusted definitions and validates the complete composition before writing one state entry.

## Prompt composition

```text
native assembled host prompt
OR
replace_base systemPrompt
  + APPEND_SYSTEM.md / --append-system-prompt
  + trusted AGENTS.md / CLAUDE.md
  + visible skills
  + cwd

THEN
+ append overlay 1
+ append overlay 2
+ ... persisted order
```

`replace_final` preserves configured bytes exactly at the `pi-modes` handler. A later `before_agent_start` extension may still modify them; provider-payload exactness requires control of the full extension chain.

`replace_base` is compatibility-tested against Pi's pinned host prompt builder with both read-enabled and no-read skill-omission fixtures. Pi 0.84.2 added a final line feed to the custom-base envelope, so exact output cannot also match older hosts; this release truthfully supports `@earendil-works/pi-ai`, `pi-coding-agent`, and `pi-tui` `>=0.84.2 <0.85.0`. Advance that range only with the parity canary and installed-artifact smoke passing.

## Drift-resistant state and observability

New writes use `pi-mode-state.v3` with:

- base and ordered overlay keys;
- SHA-256 semantic/provenance fingerprints for every selected definition;
- activation source and timestamp;
- drift policy (`block` by default).

Fingerprints include prompt meaning, strategy, normalized contracts, scope, and source path—not JSON whitespace or mtime. Changed, missing, or newly shadowed definitions are visible in status. `block` returns native host until explicit reactivation or `/mode-reapprove`; `warn` and `allow` require explicit policy selection and never bypass slot, exact-final, or contract validation.

Session replay remains chronological across v1, v2, and v3. Valid legacy state migrates once to v3; invalid legacy state freezes to native host. Historical entries are never rewritten.

Status/preview expose effective component hashes, final composition hash, UTF-8 bytes, approximate token count, host-byte delta, activation provenance, drift, and diagnostics. Token counts are estimates, not provider tokenizer authority.

## Safety and rollback

- Mode/preset files are parsed independently with deterministic bounds.
- Saves use same-directory temporary files and atomic rename.
- Authoring does not activate implicitly.
- State changes append one validated entry; discovery never silently repairs state.
- `/mode off`, package disable/removal, or native host are the rollback surfaces.
- Downgrading to a pre-v3 release may expose an older v2 entry; explicitly use that version's `/mode off` or disable the package.

## Install and verify

```bash
git clone https://github.com/tryingET/pi-extensions.git
cd pi-extensions/packages/pi-modes
npm install
npm run check
npm run release:check
pi install "$PWD"
```

Then `/reload` and exercise:

```text
/mode set native --overlay review --overlay explain
/mode save deep-review
/mode off
/mode use deep-review
/mode-status --json
/mode-preview --json
/mode-reapprove
```

The release check installs the packed artifact into an isolated, credential-free Pi agent directory and runs extension-level migration, composition, exact-final, and semantic-error smoke probes. The publication gate uses `release:check:ci`, which additionally requires npm registry truth; `release:check:quick` remains the template-compatible artifact-only check. Local installation still requires `/reload` and a fresh real command/tool call.

- Architecture: [`docs/project/2026-07-11-prompt-mode-architecture.md`](docs/project/2026-07-11-prompt-mode-architecture.md)
- Composition design/evidence: [`docs/project/2026-07-13-base-plus-append-overlay-composition.md`](docs/project/2026-07-13-base-plus-append-overlay-composition.md)

## Attribution

The concept and command vocabulary were informed by Maxime Rivest's MIT-licensed [`pi-modes`](https://github.com/MaximeRivest/pi-modes). This implementation has separate composition, trust, persistence, preset, observability, validation, and test contracts.
