---
summary: "Changelog for pi-interaction."
read_when:
  - "Preparing a release or reviewing history."
system4d:
  container: "Release log for this extension package."
  compass: "Track meaningful deltas per version."
  engine: "Document changes at release boundaries."
  fog: "Versioning policy may evolve with team preference."
---

# Changelog

All notable changes to this project should be documented here.

## [Unreleased]

### Changed

- Split runtime responsibilities into sibling subpackages:
  - `@tryinget/pi-editor-registry`
  - `@tryinget/pi-interaction-kit`
  - `@tryinget/pi-trigger-adapter`
- Umbrella package (`@tryinget/pi-interaction`) now composes/re-exports stable APIs from those subpackages.
- Extension entrypoint now mounts editor ownership through `createEditorRegistry` while preserving existing trigger behavior.
- Added runtime composition helpers: `createInteractionRuntime`, `getInteractionRuntime`, `resetInteractionRuntime`.
- Pre-publish package rename to `@tryinget/pi-interaction` to align first public release with interaction-runtime scope.
- Environment variable namespace now defaults to `PI_INTERACTION_*` while keeping `PI_INPUT_TRIGGERS_*` aliases for migration compatibility.
- Release/security docs now point at the monorepo package path as the canonical publish target and describe the first release-safe workflow.

## [0.2.0] - 2026-03-05

### Added

- TypeBox runtime boundary validation for `registerPickerInteraction` config and sanitized candidate payloads.
- Boundary-focused regression tests for unknown config keys, malformed payloads, malformed candidate IDs, inline overlay fallback signaling, and inline `maxOptions` behavior.
- Repository guard test that blocks `vault-client` internal source-path imports (enforcing package-surface-only usage).

### Changed

- Interaction-helper internals are now modularized under `src/interaction-helper/` while preserving the stable public API from `src/InteractionHelper.js` and extension re-exports.
- Inline overlay picker semantics now report explicit fallback mode details and treat `maxOptions` as a visible-row cap instead of a search-space cap.
- TypeScript validation now runs in strict mode across extension TypeScript and runtime JavaScript modules (`checkJs` enabled for `src/**/*.js`).

### Fixed

- Normalized inline overlay no-match reason reporting to `no-match` for deterministic downstream handling.
- Hardened candidate sanitization to reject malformed candidate IDs through boundary validation instead of silently dropping entries.
- Remediated audit findings by pinning `fast-xml-parser` override to `5.4.2`.

## [0.1.0] - 2026-03-04

### Added

#### Core Components

- **TriggerBroker** (`src/TriggerBroker.js`): Central registry for input triggers
  - `register(trigger, options)` - Register new triggers with validation
  - `unregister(id)` - Remove triggers
  - `list()` - List all registered triggers
  - `diagnostics()` - Get fire counts, errors, status
  - `setEnabled(id, enabled)` - Enable/disable triggers
  - `checkAndFire(context)` - Match and fire triggers

- **TriggerEditor** (`src/TriggerEditor.js`): CustomEditor integration
  - Extends pi's CustomEditor for keystroke watching
  - Provides TriggerAPI to handlers (select, confirm, input, setText, notify)
  - Automatic context building (textBeforeCursor, cursor position, etc.)

- **Extension** (`extensions/input-triggers.ts`):
  - Auto-installs TriggerEditor on session_start
  - Exports `getBroker()` and `resetBroker()` for external extensions

#### Built-in Triggers

| ID | Pattern | Description |
|----|---------|-------------|
| `ptx-template-picker` | `$$ /` | Prompt template selector using pi.getCommands() |
| `bash-command-picker` | `!! /` | Common bash commands (git, npm, docker) |
| `file-picker` | `!! .` | File picker demo |

#### Commands

| Command | Description |
|---------|-------------|
| `/triggers` | List all registered triggers with status |
| `/trigger-enable <id>` | Enable a disabled trigger |
| `/trigger-disable <id>` | Disable a trigger |
| `/trigger-diag` | Show detailed diagnostics (fire count, errors) |
| `/trigger-pick` | Manually trigger picker for any registered trigger |
| `/trigger-reload` | Clear and reload all triggers |

#### Features

- **Priority-based ordering**: Higher priority triggers checked first
- **Debounce**: Configurable delay (default 100ms) before firing
- **Cursor position**: `requireCursorAtEnd` option for precise matching
- **Match types**: Regex, string prefix, or custom function
- **Handler API**: Full access to pi's UI (select, confirm, input, notify)

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_INPUT_TRIGGERS_ENABLED` | `1` | Set to `0` to disable entire extension |
| `PI_INPUT_TRIGGERS_LEGACY_MODE` | `0` | Set to `1` to skip editor override |
| `PI_INPUT_TRIGGERS_EXAMPLES` | `1` | Set to `0` to disable built-in triggers |

#### Testing

- 16 unit tests in `tests/trigger-broker.test.mjs`
- Coverage: registration, matching, priority, debounce, cursor position
- All tests passing

#### Documentation

- README.md with full API documentation
- README.md for durable package-group truth and `next_session_prompt.md` for the active handoff
- docs/dev/EXTENSION_SOP.md for contribution guidelines
- `next_session_prompt.md` for session handoff
