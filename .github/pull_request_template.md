---
summary: "PR template for monorepo-root changes with explicit validation and rollback awareness."
read_when:
  - "Opening a pull request for review."
system4d:
  container: "Reviewer-ready pull request intake format."
  compass: "Clarity, verification, and rollback awareness."
  engine: "Summarize -> validate -> assess risk -> request review."
  fog: "Cross-package effects may appear after merge."
---

## Summary

- What changed?
- Why now?

## Validation

```bash
npm run quality:pre-push
```

Paste relevant output (and any additional package-specific checks) below.

## Risk and rollback

- Risk level: low / medium / high
- Rollback plan if this regresses monorepo behavior:

## Checklist

- [ ] Scope is focused and reviewable.
- [ ] Docs/handoffs updated when behavior changed.
- [ ] Root and package validation were run as appropriate.
- [ ] No secrets or credentials added.
