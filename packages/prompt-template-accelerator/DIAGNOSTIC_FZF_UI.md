---
summary: "Diagnostic notes for `$$ /` picker behavior in PTX."
read_when:
  - "Investigating why the PTX `$$ /` flow does not open/select as expected."
system4d:
  container: "Ad-hoc diagnostic artifact."
  compass: "Preserve reproducible findings and likely causes."
  engine: "Observe runtime behavior -> isolate cause -> record remediation path."
  fog: "Findings may stale after upstream trigger/selector changes."
---

# Diagnostic: Why `$$ /` Doesn't Show UI Picker

## The Problem

When you type `$$ /` in the pi TUI and press Enter, nothing appears - no picker, no notification.

## Root Cause Investigation

### 1. Extension Conflict
The local extension is being **blocked** by the global installation:
```
Failed to load extension ".../ptx.ts": Command "/ptx" conflicts with ~/.pi/agent/extensions/prompt-template-accelerator/extensions/ptx.ts
```

**Result**: The GLOBAL extension loads, not your local development version.

### 2. Non-Interactive Mode Test
When I tested via script (piped input), the extension worked but showed:
```
hasUI=false
```

In non-UI mode, the code auto-selects the first candidate instead of showing a picker.

### 3. What Should Happen in TUI Mode
When you type `$$ /` in the actual pi TUI:
1. Press Enter to submit the command
2. Input event fires with `hasUI=true`
3. `pickTemplate()` is called with empty query
4. `selectFuzzyCandidate()` is called
5. **`ui.select()` should show a picker**

## Hypotheses

### H1: The global extension is outdated/buggy
- The global installation at `~/.pi/agent/extensions/prompt-template-accelerator/` might have an older version
- OR there's a bug in how `ui.select()` is being called

### H2: `ui.select()` is hanging or failing silently
- The async call might be timing out
- Or there's an error that's not being surfaced

### H3: You're not pressing Enter
- `$$ /` requires pressing Enter to trigger the input event
- It's NOT a live autocomplete that shows as you type

## Diagnostic Steps

### Step 1: Check which extension is actually loaded
Run this in the pi TUI:
```
/ptx-fzf-spike
```

If this command doesn't exist, the extension isn't loaded at all.

### Step 2: Sync local to global
```bash
./scripts/sync-to-live.sh
```

Then in pi:
```
/reload
```

### Step 3: Test with explicit query
Try typing:
```
$$ /inv
```

Then press Enter. This should show a picker filtered to "inv".

### Step 4: Check for errors
After typing `$$ /` and pressing Enter, check for any error notifications at the bottom of the screen.

## Expected Behavior

When working correctly:
1. Type `$$ /` and press Enter
2. See a notification like "selection mode=fzf" or "selection mode=fallback"
3. See a picker UI with all prompt templates
4. Select one
5. Editor text changes to `$$ /<selected-template>`

## Next Steps

Please run these diagnostics in the actual pi TUI (not via script) and report:
1. Does `/ptx-fzf-spike` command exist?
2. What happens when you type `$$ /inv` and press Enter?
3. Do you see any notifications at all?
4. After syncing with `./scripts/sync-to-live.sh`, does the behavior change?
