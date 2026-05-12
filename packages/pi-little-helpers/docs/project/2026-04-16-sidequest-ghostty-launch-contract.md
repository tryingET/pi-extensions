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
2. If the current Pi session is already running inside the Ghostty sidequest fork binary, use the **Ghostty sidequest wrapper** so `+new-tab` targets that same fork/class instead of a different Ghostty world.
3. Only fall back to the Ghostty sidequest wrapper by default when no current-session Ghostty ancestor can be resolved.
4. Only attempt same-window tab attach when all of the following are true:
   - platform is Linux
   - Pi is running inside Ghostty (`TERM_PROGRAM=ghostty`)
   - the chosen Ghostty command advertises `+new-tab`
5. `GHOSTTY_SURFACE_ID` is an optional targeting hint, not a hard prerequisite. Pass it only when present **and** the chosen Ghostty build supports the `+new-tab --surface-id` action flag (Ghostty 1.4+); do not force a window fallback solely because it is absent or unsupported.
6. Do **not** force Ghostty `--title=...` for sidequest launches, because Ghostty treats that as a fixed title and will ignore later dynamic title updates. Seed the desired base title through `PI_SESSION_PRESENCE_TITLE_BASE` instead so `session-presence` can append the live `· <session-id-short>` suffix.
7. Do not trust Ghostty `+new-tab --working-directory=...` alone for peer cwd correctness; receiving tabs can inherit the current surface cwd. The launched shell command must explicitly `cd` into the requested cwd before starting Pi.
8. For **new window** launches, do **not** rely on `ghostty +new-window -e ...` to carry the command payload. Launch a fresh Ghostty window directly with `ghostty -e ...` (plus working-directory/config args) so Pi actually starts in that window.
9. If any hard prerequisite is missing, launch a new Ghostty window directly instead of attempting same-window tab attach.
10. If a live `+new-tab` launch still fails, retry with a direct new Ghostty window launch in the same pass.
11. Never report success before Ghostty returns a successful launch result.

## Non-goals

- `/sidequest` does **not** talk to Niri directly.
- `/sidequest` does **not** invent or recover a missing `GHOSTTY_SURFACE_ID`; it only forwards one when the environment already provides it and the active Ghostty build supports that action flag.
- `/sidequest` does **not** force a different Ghostty build/class to attach a tab into the current Ghostty session. If the current Pi session is running in stock Ghostty and only the sidequest fork supports `+new-tab`, opening a same-window tab is not truthful; the correct fallback is a new window.

## Verification expectations

Minimum verification for changes that touch this path:

```bash
cd packages/pi-little-helpers
node --test tests/sidequest.test.mjs
npm run check
npm run release:check:quick
```

For full installed-artifact validation, `npm run release:check` should also execute the package `scripts/release-smoke.sh` path and confirm the published extension still registers `/sidequest` from the installed package surface.
