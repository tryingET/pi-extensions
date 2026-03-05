---
summary: "Cooperative interaction runtime for live editor interactions in pi."
read_when:
  - "Starting work in this repository."
system4d:
  container: "Repository scaffold for a pi extension package."
  compass: "Ship small, safe, testable extension iterations."
  engine: "Plan -> implement -> verify with docs and hooks in sync."
  fog: "Unknown runtime integration edge cases until first live sync."
---

# @tryinget/pi-interaction

A cooperative interaction-runtime extension for pi that enables live input interactions — UI elements (pickers, dialogs) that appear as you type, without requiring Enter submission.

## The Problem

Multiple pi extensions want to show UI when users type certain patterns:
- `$$ /` → prompt template picker
- `!! /` → bash command picker
- Custom triggers from user extensions

Previously, each extension needed to call `setEditorComponent()`, causing conflicts.

## The Solution

This extension provides a central registry where any extension can register triggers without conflict:

```typescript
import { getBroker } from "@tryinget/pi-interaction";

getBroker().register({
  id: "my-trigger",
  description: "Show picker when typing $$ /",
  match: /^\$\$\s*\/$/,
  handler: async (match, context, api) => {
    const selected = await api.select("Pick", ["A", "B"]);
    if (selected) api.setText(`$$ /${selected} `);
  }
});
```

## Install

### As a pi package (recommended)

After npm publish, add to your `~/.pi/agent/settings.json`:

```json
{
  "packages": ["npm:@tryinget/pi-interaction"]
}
```

Then run `/reload` in pi.

### Pre-publish manual (monorepo workspace)

```bash
git clone https://github.com/tryingET/pi-extensions.git ~/.pi/agent/extensions/pi-extensions
cd ~/.pi/agent/extensions/pi-extensions/packages/pi-interaction
npm install
```

## Quickstart

1. The extension auto-installs when pi starts
2. Type `$$ /` and wait ~150ms → template picker appears
3. Type `!! /` and wait → bash command picker appears

## Built-in Triggers

| Trigger | Pattern | Description |
|---------|---------|-------------|
| `ptx-template-picker` | `$$ /` | Prompt template selector |
| `bash-command-picker` | `!! /` | Common bash commands |
| `file-picker` | `!! .` | File picker (demo) |

Disable examples with environment variable:

```bash
PI_INTERACTION_EXAMPLES=0 pi
```

## Commands

| Command | Description |
|---------|-------------|
| `/triggers` | List registered triggers |
| `/trigger-enable <id>` | Enable a trigger |
| `/trigger-disable <id>` | Disable a trigger |
| `/trigger-diag` | Show detailed diagnostics |
| `/trigger-pick` | Manually trigger a picker |
| `/trigger-reload` | Clear and reload triggers |

## API for Extension Authors

### High-level Helper (recommended)

Use `registerPickerInteraction` for picker-style flows (parse → load → rank → select → apply) with runtime boundary validation:

```typescript
import { registerPickerInteraction, splitQueryAndContext } from "@tryinget/pi-interaction";

registerPickerInteraction({
  id: "my-picker",
  description: "Template picker",
  match: /^\$\$\s*\/(.*)$/,
  loadCandidates: async ({ parsed }) => {
    // return { candidates, reason?, metadata? }
    return {
      candidates: [
        { id: "nexus", label: "/nexus", detail: "High-leverage intervention" },
      ],
    };
  },
  parseInput: (match) => {
    const parsed = splitQueryAndContext(String(match?.groups?.[0] ?? ""));
    return { query: parsed.query, context: parsed.context, raw: String(match?.groups?.[0] ?? "") };
  },
  applySelection: ({ selected, api }) => {
    api.setText(`$$ /${selected.id} `);
  },
});
```

Boundary guarantees in `registerPickerInteraction`:
- unknown config keys are rejected
- non-finite numeric options are rejected
- malformed candidate payloads (including invalid `id`) are rejected deterministically

Inline custom overlay behavior:
- reports fallback mode explicitly when inline filtering is active
- returns `no-match` consistently when nothing matches
- treats `maxOptions` as a visible-row cap (not a search-space cap)

### Register a Trigger

```typescript
import { getBroker, type InputTrigger } from "@tryinget/pi-interaction";

const trigger: InputTrigger = {
  id: "unique-id",
  description: "Human-readable description",
  priority: 100,  // Higher = checked first
  match: /^\$\$\s*\//,  // Regex, string prefix, or custom function
  requireCursorAtEnd: true,  // Only fire if cursor at end
  debounceMs: 150,  // Delay before firing
  showInPicker: true,  // Show in /trigger-pick
  pickerLabel: "$$ / picker",
  pickerDetail: "Template selector",
  handler: async (match, context, api) => {
    // match.matchedText - the matched text
    // match.groups - regex capture groups
    // context.textBeforeCursor - text before cursor
    // context.cursorLine, context.cursorColumn
    // api.select(), api.confirm(), api.input()
    // api.setText(), api.insertText(), api.notify()
  }
};

const result = getBroker().register(trigger);
if (result.success) {
  console.log(`Registered: ${result.id}`);
}
```

### Match Types

```typescript
// String prefix (exact match at cursor position)
match: "$$ /"

// Regex (must end at cursor)
match: /^\$\$\s*\/(.*)$/

// Custom function
match: (context) => {
  if (context.textBeforeCursor.endsWith("$$ /")) {
    return {
      matchedText: "$$ /",
      startIndex: context.textBeforeCursor.length - 3,
      endIndex: context.textBeforeCursor.length,
      data: { custom: "info" }
    };
  }
  return null;
}
```

### Handler API

```typescript
handler: async (match, context, api) => {
  // Get/set editor text
  const text = api.getText();
  api.setText("new text");
  api.insertText("inserted");

  // Notifications
  api.notify("Message", "info");  // "info" | "warning" | "error"

  // Interactive dialogs
  const selected = await api.select("Title", ["A", "B", "C"]);
  const confirmed = await api.confirm("Title", "Are you sure?");
  const input = await api.input("Title", "placeholder");

  // Access full context
  const ctx = api.ctx;  // ExtensionContext
}
```

### Unregister

```typescript
getBroker().unregister("my-trigger");
```

### List/Diagnostics

```typescript
const triggers = getBroker().list();
const diagnostics = getBroker().diagnostics();
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_INTERACTION_ENABLED` | `1` | Set to `0` to disable |
| `PI_INTERACTION_LEGACY_MODE` | `0` | Set to `1` to skip editor override |
| `PI_INTERACTION_EXAMPLES` | `1` | Set to `0` to disable example triggers |

Legacy aliases (`PI_INPUT_TRIGGERS_*`) remain accepted for migration compatibility.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     TriggerEditor                            │
│  (CustomEditor that watches keystrokes)                      │
│                                                              │
│  handleInput() ──► TriggerBroker.checkAndFire()             │
│                                                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     TriggerBroker                            │
│  (Central registry for triggers)                             │
│                                                              │
│  triggers: Map<id, RegisteredTrigger>                       │
│  register(), unregister(), list(), checkAndFire()           │
│                                                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 External Extensions                          │
│                                                              │
│  import { getBroker } from "@tryinget/pi-interaction"       │
│  getBroker().register({ ... })                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Development

```bash
npm install
npm run check
node --test tests/*.test.mjs
```

Type-safety gate notes:
- `npm run typecheck` now validates both extension TypeScript and runtime JavaScript modules (`checkJs` + strict mode).
- Internal `vault-client` source-path imports are disallowed; use package API surfaces only.

### Sync to Live

```bash
./scripts/sync-to-live.sh
```

Then `/reload` in pi.

## Troubleshooting

### "Trigger not firing"
1. Check `/triggers` to see if registered
2. Check `/trigger-diag` for errors
3. Verify `requireCursorAtEnd` matches your cursor position
4. Wait for debounce (default 150ms)

### "Conflict with other extension"
Only one extension can own `setEditorComponent`. If another extension needs the editor:
1. Set `PI_INTERACTION_LEGACY_MODE=1` to skip editor override
2. Or integrate that extension's functionality into triggers

### "Picker not appearing"
1. Ensure `ctx.hasUI` is true (not in non-interactive mode)
2. Check that your handler calls `api.select()`

## License

MIT
