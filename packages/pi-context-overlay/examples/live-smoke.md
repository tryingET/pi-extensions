---
summary: "Minimal live smoke flow for @tryinget/pi-context-overlay."
read_when:
  - "Running a package-level live verification pass."
system4d:
  container: "Tiny operator smoke example."
  compass: "Verify the package is wired into live Pi before deeper debugging."
  engine: "Reload -> open overlay -> verify prompt visibility -> confirm live-session truth."
  fog: "Packaging may pass while live host integration still drifts or the overlay lags the active session."
---

# Live smoke example

Use this package-level smoke flow after installing the package into Pi:

```text
/reload
/c
/context-report
```

Expected baseline:
- `/c` opens the context inspector overlay
- footer key hints render without runtime errors
- `/context-report` is available as a prompt command

Recommended extended checks:
- navigate or compact the active session, then reopen `/c` and confirm the overlay reflects the current live session rather than stale prior state
- if the active session includes a file-backed context item, open it from the overlay and confirm the editor/zellij path succeeds or fails clearly
