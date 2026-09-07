---
summary: "The ribbon now draws itself in Ghostty's own theme and follows the desktop between light and dark."
read_when:
  - "Changing ribbon appearance or how it follows the terminal theme."
type: "feature"
---

# The ribbon wears Ghostty's theme

The operator called the ribbon two ugly boxes and asked it to match Ghostty, day and night.

## What it looked like

Two heavy rounded containers floating over the wallpaper, in a hardcoded navy that shared nothing with the terminal. Their Ghostty runs Everforest, light or dark by system preference, so nothing matched.

## Where colours come from now

Ghostty stores its palette as plain `key = value` lines in its config and theme files, and a theme setting can name one theme per colour scheme. The desktop portal reports which scheme is wanted. The ribbon reads the same files the terminal reads, so the two cannot drift.

The panel receives only eight named colours. Everything else is derived in GTK CSS with `mix()` and `alpha()`, which invert correctly between schemes on their own: a raised surface comes out lighter on a dark theme and darker on a light one. That is what makes one stylesheet serve both without a second palette to maintain.

State colours reuse the terminal's own meanings, so a card reads like output in the tab it points at: green settled, yellow working, red failed, and the cursor colour for a session waiting on you.

## Two traps

The installed Ghostty release under `current` ships no theme files at all, so lookup has to search user themes first and then every installed build rather than trusting one path. And `cargo fmt --check` gates the artifact build, so a formatting slip silently leaves the old panel running while the new stylesheet appears to have no effect.

## The redesign

One continuous bar with a hairline edge, reading as desktop chrome. The identity block lost its box and its marketing line. Cards became flat chips whose left edge carries their state.

Evidence, including captures in both schemes, is in [Verification](../packages/pi-activity-strip/docs/project/verification.md).
