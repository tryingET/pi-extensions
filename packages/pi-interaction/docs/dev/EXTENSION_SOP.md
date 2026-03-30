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
- Review `README.md` and `next_session_prompt.md` for current package-group truth and active work
- Capture work in git issues or `next_session_prompt.md`

## 2) Implement

### Adding a New Trigger

```typescript
// In extensions/input-triggers.ts or via external extension
import { getBroker } from "@tryinget/pi-interaction";

getBroker().register({
  id: "my-trigger",
  description: "Description",
  match: /^pattern$/,
  handler: async (match, context, api) => {
    const selected = await api.select("Title", ["A", "B"]);
    if (selected) api.setText(`result: ${selected}`);
  }
});
```

### Key Files

| File | Purpose |
|------|---------|
| `pi-interaction/extensions/input-triggers.ts` | Main umbrella extension entrypoint |
| `pi-trigger-adapter/` | Trigger broker + picker registration package |
| `pi-interaction-kit/` | Shared fuzzy/selection helpers |
| `pi-editor-registry/` | Editor mounting/runtime ownership |

### Patterns

- **Debounce**: Always set `debounceMs` (default 100ms) to avoid rapid fires
- **Priority**: Higher = checked first; use for more specific patterns
- **Cursor position**: Use `requireCursorAtEnd: true` for most triggers

## 3) Verify

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction
npm run check

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction
npm run fix
npm run check
npm run release:check:quick

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator
npm run check
```

### Manual testing in pi

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-prompt-template-accelerator
# Then in pi: /reload
# Then test: /triggers and $$ /
```

### Test Checklist

- [ ] `pi-interaction` commands appear in `/triggers` output
- [ ] PTX trigger appears when both packages are loaded
- [ ] `$$ /` opens the picker in a live session
- [ ] Selection writes back into the editor
- [ ] Similar non-matching input does not trigger unexpectedly

## 4) Release

Use [release-workflow.md](release-workflow.md) as the source of truth.

Minimum release gate:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
npm run quality:pre-push

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction
npm run release:check:quick
npm audit
```

## 5) Maintain

- Monitor for conflicts with other trigger/editor extensions
- Keep built-in triggers useful but minimal
- Document new trigger patterns in the umbrella README
- Update `README.md` and `next_session_prompt.md` when package-group truth or active handoff changes
- Keep release docs aligned with monorepo root/package ownership rules

## Troubleshooting

### Trigger not appearing
1. Check `/triggers` command
2. Check `/trigger-diag` for errors
3. Verify registration code runs

### Conflicts with other extensions
- Only one extension can own the editor override path at a time
- Set `PI_INTERACTION_LEGACY_MODE=1` to disable editor override
- Integrate other extension's triggers into the shared broker where appropriate

### Release confusion
1. Publish only `packages/pi-interaction/pi-interaction`
2. Do not publish the `packages/pi-interaction` group root
3. Re-check `repository.directory` and `x-pi-template` metadata before release
