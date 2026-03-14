---
summary: "Current status snapshot for pi-society-orchestrator after runtime hardening, lower-plane boundary hardening, and headless installed-package release-smoke coverage."
read_when:
  - "Checking package health before changing runtime behavior or release validation."
  - "Preparing handoff after a pi-society-orchestrator implementation slice."
system4d:
  container: "Status report for the current package state."
  compass: "Keep control-plane behavior explicit, fail-closed, and release-safe while broader convergence continues."
  engine: "State current guarantees -> state verified checks -> state remaining uncertainty."
  fog: "The main risk is resuming from stale pre-hardening or pre-harness assumptions."
---

# Status

- Runtime hardening in place:
  - fail-closed agent/team routing
  - session-identity-scoped team state with bounded key retention
  - shared execution status classification (`done`, `aborted`, `timed_out`, `error`)
  - shared execution/evidence policy across direct dispatch and loops
    - abort skips evidence writes
    - timeout/protocol failure records fail evidence
    - SQL fallback eligibility is consistent across callers
  - abortable, timeout-bound, capture-bounded `ak` and Pi subprocess supervision
  - explicit malformed-event failure handling for Pi subagent streams
- Query boundary hardening in place:
  - `society_query` is read-only only and now accepts valid read-only `WITH ... SELECT ...` diagnostics in addition to `SELECT` / `EXPLAIN` / non-mutating `PRAGMA`
  - runtime `sqlite3`, `dolt`, and `rocs-cli` reads now flow through async, timeout-bound supervised helpers instead of synchronous runtime `execFileSync` calls
  - `ontology_context` and `/ontology` now resolve through a shared `rocs-cli` adapter path instead of the local `society.db` ontology table
  - prompt-vault lookups share package-local helper boundaries, and cognitive-tool lookup by name is now cognitive-only
  - explicit `societyDb` targeting now outranks ambient `AK_DB` for `ak`-backed runtime calls
- Release/runtime verification now includes:
  - `npm run check`
  - `npm run release:check`
  - isolated tarball install into Pi
  - installed-package headless timeout smoke
  - installed-package headless truncation smoke
  - installed-package headless loop/team-mismatch smoke
- Installed-package smoke behavior:
  - smoke binds to the exact `PACKAGE_SPEC` recorded in isolated Pi settings
  - smoke installs into an isolated `NPM_CONFIG_PREFIX` instead of the user's default global npm package space
  - smoke verifies the installed package contents still match that tarball before execution
  - smoke loads the installed extension package, not local source files
  - smoke no longer requires `~/.pi/agent/auth.json`
  - smoke no longer depends on a live provider-backed prompt execution host
  - smoke uses a fake subagent `pi`, a deterministic fake `ak`, and a temporary vault fixture to keep the proof bounded
  - the fake `ak` now records/asserts expected evidence-write argv for the direct-dispatch smoke path
- Remaining uncertainty:
  - `recordEvidence(...)` still retains SQL fallback
  - real interactive `/reload` parity for the installed package is not part of the routine release-check harness
  - raw society read/query migration (`society_query`, `/evidence`) is still outstanding even though the temporary sqlite path is now bounded by the shared async helper layer
- Explicit boundary:
  - `pi-society-orchestrator` still owns coordination/control-plane logic only
  - `ak`, `rocs-cli`, `pi-vault-client`, and ASC remain the intended lower-plane owners as broader convergence continues
