---
summary: "Diagnosed the /sidequest and /fresh-handoff tab-attach outage (split-brain Ghostty fleet after the AK #5405 rebuild), probed surface-id capability instead of trusting version strings, relinked current, and hardened PATH."
read_when:
  - "You are debugging why sidequest/fresh-handoff opens new windows instead of tabs."
  - "You are changing surface-id capability probing or rebuilding ghostty-origin-main."
  - "You are checking why bare `ghostty` from PATH matters for sidequest fallbacks."
type: "implementation"
---

# Sidequest tab-attach outage: split-brain Ghostty fleet + version-gate miscalibration

## Scope

- Package: `packages/pi-little-helpers` (`sidequestGhostty.ts`, contract doc, tests)
- Environment: `~/.local/opt/ghostty-origin-main/`, `~/.local/bin/ghostty` shim, PATH

## What happened

The operator reported `/sidequest` and `/fresh-handoff` "not working". Investigation found
the extension itself healthy (peers launched, worked, and reported back via intercom); the
failure was **same-window tab attach**, which fail-closed everywhere except one window:

1. The Ghostty rebuild on 2026-09-05 (AK #5405) promoted `current` -> `492300ca` while the
   running single-instance daemon (pid 6912) still ran the Aug build `9d8fbd15`. The exact-
   build D-Bus owner check in `resolveControllerGhosttyDbusTarget` correctly refuses to send
   a controller surface id + argv to a different build, so every window of a different build
   fell back to new-window launches.
2. New-window fallback resolves bare `ghostty` from PATH -> `/usr/bin/ghostty` (system
   1.3.1, no `+new-tab` at all), spawning more 1.3.1 windows in which sidequest could never
   tab-attach — a window cascade (observed pairs at 19:11 and 23:25).
3. Version archaeology: Ghostty embeds `<semver>-<branch>-+<sha>`; upstream main's manifest
   says `1.3.2-dev` both before and after the Aug snapshot. The old build's `1.4.0-origin-main`
   label came from its build-time tree state, not an upstream 1.4 release (latest tag is
   `v1.3.1`). Both origin-main binaries contain the surface-id feature; only the reported
   version strings differ.

## Changes

1. **Rearlink** `~/.local/opt/ghostty-origin-main/current` -> `9d8fbd15` (the 1.4.0-reporting
   build still running as the bus owner), restoring one consistent fleet without restarting
   the old daemon.
2. **Capability probing** in `supportsGhosttySurfaceId` (`extensions/sidequestGhostty.ts`):
   probe `+new-tab --surface-id=<invalid sentinel>` (exported
   `SURFACE_ID_CAPABILITY_PROBE_VALUE`); a nonzero exit with `Error parsing args: error.*`
   proves the flag exists without creating any tab (verified against both origin-main builds;
   system 1.3.1 fails with `unknown CLI action`). Inconclusive/errored probes fall through to
   the legacy >=1.4 version-string gate instead of failing closed. Pure helper
   `ghosttySurfaceIdProbeIndicatesSupport` exported for tests. Contract doc rule 6 updated,
   including the residual risk note (a hypothetical build with `+new-tab` that silently
   ignores unknown flags could execute one stray tab during the probe; no such build exists).
3. **PATH hardening**: `~/.local/bin/ghostty` -> `ghostty-origin-main/current/bin/ghostty`
   symlink, so bare-`ghostty` fallback launches can never open system 1.3.1 windows again;
   `/proc/<pid>/exe` still resolves to the real commit path, keeping the exact-build check
   consistent for shim-launched windows.

## Test fallout pattern

The probe call (`+new-tab --surface-id=<sentinel>`) is a `+new-tab` exec that is not a
launch. Ten tests selected calls via `args[0] === "+new-tab"` or asserted exact call
sequences; they now select launches via the `sidequest-pi` marker or branch stubs on the
sentinel. Probe-success stubs skip `+version`, keeping sequence assertions tight.

## Verification

- `node --test tests/` in pi-little-helpers: **406 pass, 0 fail** (baseline 406 pass
  before the change).
- Fresh one-shot `pi -p` session loads the module surface cleanly.
- Live probe against real binaries: old `1.4.0` -> true, new `1.3.2-main-+492300cad` ->
  true (previously false via version gate), system `1.3.1-arch2` -> false.
- Fresh PATH lookup resolves `ghostty` -> shim -> `current` -> `9d8fbd15` real path.

## Follow-ups

- Close the remaining `/usr/bin/ghostty` fallback windows so the fleet is one build.
- Next rebuild promotion (`rebuild.sh` manual `mv` + `ln -sfn`) is now safe for targeting:
  the probe recognizes the flag regardless of the dev version string, but the running
  daemon must still be restarted onto the promoted build for the exact-build check.
- Probe side effects during diagnosis: `+new-tab --help` and an unknown-flag run produced
  empty output and may have opened one stray tab/window; nothing else executed.
