---
summary: "Minimal live smoke flow for @tryinget/pi-context-overlay."
read_when:
  - "Running a package-level live verification pass."
system4d:
  container: "Tiny operator smoke example."
  compass: "Verify the package is wired into live Pi before deeper debugging."
  engine: "Reload -> open overlay -> verify prompt visibility."
  fog: "Packaging may pass while live host integration still drifts."
---

# Live smoke example

Use this package-level smoke flow after installing the package into Pi:

```text
/reload
/c
/context-report
```

Expected:
- `/c` opens the context inspector overlay
- footer key hints render without runtime errors
- `/context-report` is available as a prompt command
