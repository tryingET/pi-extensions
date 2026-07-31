---
summary: "Runtime contract for how /sidequest chooses Ghostty binaries, decides tab attach eligibility, and falls back to new windows."
read_when:
  - "You are changing /sidequest launch behavior or debugging why it did not open in the current Ghostty window."
  - "You need the operator-facing truth for Ghostty surface ids, fallback rules, or release smoke expectations."
system4d:
  container: "Package-local runtime contract for the sidequest Ghostty launch path."
  compass: "Keep /sidequest honest: same-window tab attach only when the active Ghostty session can actually support it."
  engine: "Resolve the active Ghostty binary -> validate tab-attach prerequisites -> execute -> fall back to new window if needed -> verify in tests and release smoke."
  fog: "Ghostty CLI help, local wrapper installs, and live session surface state can drift apart unless the contract is explicit."
---

# Sidequest Ghostty launch contract

## Operator truth

`/sidequest` should only claim **same-window tab attach** when the current session can actually do it.

If the active Ghostty session cannot prove that, `/sidequest` must open a **new Ghostty window** and say why.

## Launch rules

1. Prefer the **current Ghostty session binary** when the current Pi session is already running inside Ghostty and the ancestor Ghostty process can be resolved.
2. If the current Pi session is already running inside the Ghostty sidequest fork binary and exposes `GHOSTTY_SURFACE_ID`, target the controller Ghostty process's unique user-D-Bus peer for `org.gtk.Actions new-tab`. Send that activation with `busctl --expect-reply=no`: delivery is the launch boundary, and waiting for the action reply can keep the launcher attached until its timeout kills the live peer. Terminate `busctl` option parsing before the embedded Ghostty argv so flags such as `--working-directory` reach Ghostty rather than being consumed by `busctl`. Do not assume the well-known `com.tryinget.ghosttysidequest` broker owns the controller surface: a standalone controller process and the broker can share the same class while owning different windows. Use the wrapper CLI only when exact controller-process targeting is unavailable, and retain the post-launch placement check.
3. If the current session binary is stock/older Ghostty and does not advertise `+new-tab`, but the local sidequest wrapper exists and does advertise `+new-tab`, use that wrapper for the tab launch before falling back to a new window. This keeps visible peer/visible-loop launches visible as tabs on systems where the wrapper is the tab-capable launcher.
4. Only fall back to the Ghostty sidequest wrapper by default when no current-session Ghostty ancestor can be resolved.
5. Only attempt same-window tab attach when all of the following are true:
   - platform is Linux
   - Pi is running inside Ghostty (`TERM_PROGRAM=ghostty`)
   - the chosen Ghostty command advertises `+new-tab`
6. `GHOSTTY_SURFACE_ID` is an optional targeting hint, not a hard prerequisite. Pass it only when present **and** the chosen Ghostty build supports the `+new-tab --surface-id` action flag (Ghostty 1.4+); do not force a window fallback solely because it is absent or unsupported.
7. Do **not** force Ghostty `--title=...` for sidequest launches, because Ghostty treats that as a fixed title and will ignore later dynamic title updates. Seed the desired base title through `PI_SESSION_PRESENCE_TITLE_BASE` instead so `session-presence` can append the live `· <full-32-hex-session-id-token>` suffix.
8. Do not trust Ghostty `+new-tab --working-directory=...` alone for peer cwd correctness; receiving tabs can inherit the current surface cwd. The launched shell command must explicitly `cd` into the requested cwd before starting Pi.
9. For **new window** launches, do **not** rely on `ghostty +new-window -e ...` to carry the command payload. Launch a fresh Ghostty window directly with `ghostty -e ...` (plus working-directory/config args) so Pi actually starts in that window.
10. If any hard prerequisite is missing, launch a new Ghostty window directly instead of attempting same-window tab attach.
11. If a live `+new-tab` launch still fails, retry with a direct new Ghostty window launch in the same pass.
12. Never report success before Ghostty returns a successful launch result. An executor result marked `killed` is a launch failure even if its normalized exit code is zero.
13. After a successful tab launch request, perform a brief best-effort placement check through `session-presence`: match the launched Pi session by cwd/title, compare the controller and child Ghostty ancestor PIDs, and warn when the child landed under a different Ghostty window/process. This check corrects the operator-facing message; it does not turn terminal placement into task/evidence authority.
14. Controller-process D-Bus targeting must resolve a single unique bus name whose reported PID equals the observed Ghostty ancestor PID, encode the surface id as a bounded unsigned 64-bit integer, pass launch arguments as argv elements rather than shell-concatenating a `busctl` command, terminate `busctl` option parsing before those embedded arguments, and avoid waiting for the action reply. If direct activation fails or is killed, use the existing honest new-window fallback.

## Non-goals

- `/sidequest` does **not** talk to Niri directly.
- `/sidequest` does **not** invent or recover a missing `GHOSTTY_SURFACE_ID`; it only forwards one when the environment already provides it and the active Ghostty build supports that action flag.
- `/sidequest` does **not** claim tab success unless the chosen Ghostty command returns success for the `+new-tab` launch. If the sidequest wrapper is available and tab-capable, it may be the chosen command even when the ancestor Ghostty binary is older/stock.
- The post-launch placement check is best-effort and local-only. If no matching `session-presence` sidecar appears before the short timeout, `/sidequest` leaves the original launch result intact instead of blocking the child session.

## Verification expectations

Minimum verification for changes that touch this path:

```bash
cd packages/pi-little-helpers
node --test tests/sidequest.test.mjs
npm run check
npm run release:check:quick
```

For full installed-artifact validation, `npm run release:check` should also execute the package `scripts/release-smoke.sh` path and confirm the published extension still registers `/sidequest` from the installed package surface.
