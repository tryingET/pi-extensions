---
summary: "Investigation log for FZF-backed `$$ /` behavior in PTX."
read_when:
  - "Auditing PTX selector behavior changes across commits."
system4d:
  container: "Historical behavior analysis artifact."
  compass: "Track what changed and why user-visible behavior shifted."
  engine: "Compare previous implementation -> confirm current runtime semantics."
  fog: "Behavior interpretation can drift if assumptions about runtime mode are outdated."
---

# FZF Investigation for `$$ /`

## Summary

The fuzzy selector **IS** working for `$$ /`, but the behavior changed in commit `36a293a` (feat: migrate PTX to unified fuzzy selector flow).

## What Changed

### Before Migration (commit `36a293a^`)
- `$$ /template` directly looked up a template by name
- No fuzzy searching or selection UI
- Direct template expansion

### After Migration (commit `36a293a`)
- `$$ /<query>` now routes through a fuzzy selector
- `$$ /` (empty query) should show ALL templates in a picker UI
- Uses `fzf --filter` for ranking when available (fallback to deterministic ranker otherwise)
- Calls `ui.select()` to show the picker

## Current Behavior

### In UI Mode (TUI)
- `$$ /` should open a fuzzy picker showing all available prompt templates
- User selects one, then it auto-fills arguments from context
- Reports mode as `fzf` or `fallback` in notifications

### In Non-UI Mode (Scripts/CI)
- `$$ /` is now treated as an error: "expected slash command after '$$'"
- This is intentional per the CHANGELOG: "invalid selector invocations (including slash-only `$$ /`) now return deterministic `action: "transform"` error text"

## Why It Might Seem "Not Working"

1. **Extension Conflict**: The local extension conflicts with the globally installed version
   - Local: `~/programming/pi-extensions/pi-prompt-template-accelerator/extensions/ptx.ts`
   - Global: `~/.pi/agent/extensions/pi-prompt-template-accelerator/extensions/ptx.ts`
   - Global takes precedence due to load order

2. **FZF Probe Results** (from `/ptx-fzf-spike`):
   - Interactive mode: status != 0 (expected in TTY-less environment)
   - Filter mode: status == 0 ✓ (fzf ranking is available)

3. **Expected Workflow**:
   - Type `$$ /` in the pi TUI
   - Should see a picker UI with all prompt templates
   - Select one to auto-fill

## Git Commits Analyzed

- `281128d` - fix: transform non-template $$ commands in non-ui mode
- `36a293a` - feat: migrate PTX to unified fuzzy selector flow
- `7d04a8d` - docs: refresh PTX handoff after slice4 cleanup
- `71c8723` - refactor: complete slice4 cleanup and hardening

## Key Files

- `extensions/ptx.ts` - Main extension with input handler and selector logic
- `src/fuzzySelector.js` - FZF ranking + fallback logic + `ui.select()` integration
- `src/ptxCandidateAdapter.js` - Converts pi commands to selector candidates

## Root Cause Analysis

The fuzzy selector **IS** implemented and working. The confusion likely stems from:

1. **Behavior Change**: Old behavior was direct template lookup; new behavior requires fuzzy selection
2. **UI Dependency**: The picker only shows in UI mode (TUI), not in non-UI mode
3. **Empty Query Handling**: `$$ /` triggers the picker with ALL templates, not an error
4. **Extension Loading**: Global installation may mask local changes during development

## Recommendations

1. **Test in TUI**: Verify `$$ /` shows the picker in the actual pi TUI (not scripts)
2. **Check Notifications**: Look for "selection mode=fzf" or "selection mode=fallback" messages
3. **Verify Templates**: Ensure prompt templates are loaded (not using `--no-prompt-templates`)
4. **Sync to Global**: Run `./scripts/sync-to-live.sh` to update global installation with local changes

## Shadow Analysis (Per INVERSION Template)

### Hidden Bugs
- **Assumption**: User expects direct template lookup like before
  - **Pattern Genus**: Breaking UX change without clear migration path
  - **Fix**: Document behavior change prominently; consider backward-compat shim

- **Assumption**: Extension conflicts are visible to users
  - **Pattern Genus**: Silent failure mode in extension loading
  - **Fix**: Surface conflict warnings more prominently in TUI

### Genus Fixes
- **Pattern**: Breaking UX changes
  - **Systemic Fix**: Version the UX contract; provide migration guides in CHANGELOG

- **Pattern**: Extension conflict masking
  - **Systemic Fix**: Add `/ptx-status` command to show which version is active
