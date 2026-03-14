---
summary: "Bounded plan for replacing the provider/auth-dependent installed-package smoke with a headless installed-runtime harness."
read_when:
  - "Implementing the hermetic installed-runtime smoke slice from NEXT_SESSION_PROMPT.md."
  - "Reviewing why release-check no longer needs ambient Pi auth or a live provider host for installed-package smoke."
system4d:
  container: "Single-slice execution plan for release-smoke hardening."
  compass: "Keep the installed-package proof while removing avoidable ambient host dependencies."
  engine: "Install tarball -> load installed extension directly -> drive bounded tool/command smoke in-process."
  fog: "The main risk is silently downgrading coverage while making the harness more deterministic."
---

# Hermetic installed release smoke — 2026-03-11

## Scope

Complete only the first bounded pack from `NEXT_SESSION_PROMPT.md`:
- make installed-package release smoke more hermetic
- preserve proof for timeout, truncation, and team-mismatch behavior
- remove dependency on ambient Pi auth and real provider execution for this smoke layer

## Acceptance criteria

1. `npm run release:check` still installs the packed tarball into an isolated Pi agent dir.
2. Installed-package smoke loads the installed extension package, not local source files.
3. Smoke still proves:
   - direct dispatch timeout classification
   - bounded assistant-output truncation behavior
   - loop/team mismatch fail-closed behavior
4. Smoke no longer requires `~/.pi/agent/auth.json` or a live provider-backed prompt execution.
5. README + handoff docs reflect the new harness and the next remaining bounded work.

## Chosen approach

- Keep `pi install` for installed-package proof.
- Replace real-host prompt-driven smoke with a headless Node harness that:
  - reads the exact `PACKAGE_SPEC` from isolated Pi settings
  - unpacks the tarball and verifies the installed global package still matches that packaged content
  - imports the installed extension entrypoint only after artifact-identity proof
  - registers tools/commands into a small Pi stub
  - points runtime env to temporary isolated dependencies
  - uses a fake `pi` binary for subagent timeout/truncation cases
  - uses a fake `ak` binary that records/asserts expected evidence-write argv
  - uses a temporary Dolt prompt-vault fixture for cognitive tool lookup
- Preserve loop/team mismatch coverage by driving `/agents-team` + `loop_execute` against the same installed extension instance.

## Risks / non-goals

- Do not broaden into the unified execution/evidence contract slice yet.
- Do not change public tool semantics beyond the release-check harness.
- Do not remove the `pi install` step from release-check; the goal is headless installed-runtime smoke, not pack-only validation.
