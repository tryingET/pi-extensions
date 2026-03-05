---
summary: "Lifecycle SOP for pi-interaction extension."
read_when:
  - "Planning, implementing, verifying, releasing, or maintaining this extension."
system4d:
  container: "End-to-end extension operating procedure."
  compass: "Consistent quality from idea to maintenance."
  engine: "plan -> implement -> verify -> release -> maintain."
  fog: "Unknowns resolved through incremental validation loops."
---

# Extension SOP - pi-interaction

## 1) Plan

- Define scope: new trigger, handler feature, or integration?
- Check `/triggers` command in live pi to see current state
- Review `docs/dev/status.md` for current progress
- Capture work in git issues or `NEXT_SESSION_PROMPT.md`

## 2) Implement

### Adding a New Trigger

```typescript
// In extensions/input-triggers.ts or via external extension
import { getBroker } from "@tryinget/pi-interaction";

getBroker().register({
  id: "my-trigger",
  description: "Description",
  match: /^pattern$/,  // Regex, string, or function
  handler: async (match, context, api) => {
    const selected = await api.select("Title", ["A", "B"]);
    if (selected) api.setText(`result: ${selected}`);
  }
});
```

### Key Files

| File | Purpose |
|------|---------|
| `extensions/input-triggers.ts` | Main extension, commands, built-in triggers |
| `src/TriggerBroker.js` | Core registry logic |
| `src/TriggerEditor.js` | CustomEditor keystroke watching |
| `tests/trigger-broker.test.mjs` | Unit tests |

### Patterns

- **Debounce**: Always set `debounceMs` (default 100ms) to avoid rapid fires
- **Priority**: Higher = checked first; use for more specific patterns
- **Cursor position**: Use `requireCursorAtEnd: true` for most triggers

## 3) Verify

```bash
# Run unit tests
node --test tests/*.test.mjs

# Quality check
npm run check

# Manual testing in pi
./scripts/sync-to-live.sh
# Then in pi: /reload
# Type: $$ /
```

### Test Checklist

- [ ] New trigger appears in `/triggers` output
- [ ] Trigger fires at correct pattern
- [ ] Trigger doesn't fire on similar patterns
- [ ] Handler API works (select, setText, etc.)
- [ ] Debounce prevents rapid fires
- [ ] Priority ordering is correct

## 4) Release

```bash
# Pre-release check
npm run release:check

# Sync to live for testing
./scripts/sync-to-live.sh

# Commit and push
git add -A && git commit -m "feat: description"
git push

# Merge release-please PR when ready
# Publish workflow runs automatically
```

## 5) Maintain

- Monitor for conflicts with other `setEditorComponent` extensions
- Keep built-in triggers useful but minimal
- Document new trigger patterns in README
- Update `docs/dev/status.md` after changes

## Troubleshooting

### Trigger not appearing
1. Check `/triggers` command
2. Check `/trigger-diag` for errors
3. Verify registration code runs (add console.log)

### Conflicts with other extensions
- Only one extension can use `setEditorComponent`
- Set `PI_INTERACTION_LEGACY_MODE=1` to disable editor override
- Integrate other extension's triggers into this broker

### Tests failing
1. Check debounce timing in tests (150ms wait)
2. Verify mock API has all required methods
3. Check regex patterns match expected text
