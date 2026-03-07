---
summary: "Diagnostic notes for `${@:4}` PTX argument fill behavior."
read_when:
  - "Investigating unexpected PTX extras argument defaults."
system4d:
  container: "Development diagnostic artifact."
  compass: "Explain argument mapping outcomes before changing inference rules."
  engine: "Reproduce -> trace mapping path -> isolate hardcoded/default source."
  fog: "May become stale once PTX mapping logic evolves."
---

# Diagnostic: Why `$$ /` Picker Shows "none" as Fourth argument

## Problem

When using `$$ /` to select a prompt template, the picker shows template names, and the PTX extension fills in the suggestion. However, the suggestion's fourth argument is `${@:4}` is being as `"none"` instead of being an empty string or actually reflecting the the template's fourth argument.

 `${@:4}` expects additional context like constraints, overrides, or freeform notes.

## Root Cause

In `extensions/ptx.ts`, line 373:

```typescript
extrasSummary: "none",
```

This value is hardcoded instead of being inferred from context. The `mapArgsByUsage` function uses this to fill the `${@:4}` in templates.

## Shadow Analysis (Per INVERSION)

- **Hidden bug**: `extrasSummary` hardcoded to `"none"`
  - **Assumption**: "Extras should have a default value"
  - **Pattern genus**: Hardcoded placeholder values that obscure actual context
  - **Fix**: Remove hardcoded value, use empty string or or smarter inference

## Genus Fixes

- **Hardcoded placeholders**: Replace with empty strings or conditional logic, allowing templates to handle missing values gracefully
