---
summary: "Activity ribbon now shows Pi sessions in hidden Ghostty tabs; surface ids drift, session tokens do not."
read_when:
  - "Investigating why an activity-strip card is missing for a running Pi tab."
  - "Changing hidden-tab placement, window memory, or present-surface activation."
type: "fix"
---

# Activity ribbon missed every hidden Ghostty tab

The operator reported the ribbon should be present wherever a Ghostty tab exists, and was not. The strip was healthy: the defect was placement. A card was projected onto a workspace only when the Pi session's own title was the visible title of a Niri window. Niri reports one title per window, naming the active tab, so a Pi session sitting behind another tab of the same window belonged to no window and appeared on no workspace.

Measured live before the change: 40 broker sessions were bound to Ghostty surfaces and 2 matched a window title. The other 38 were invisible.

## What the platform actually offers

Niri exposes no per-tab entity. Ghostty's application action group exports `present-surface` taking a uint64 surface id; its per-window action groups expose only window-scoped actions, with nothing that selects a tab by index or id. Every Ghostty process, daemon or standalone, exports `org.gtk.Actions` on its own unique bus name, so activation can target the exact host process instead of a shared well-known name. AT-SPI is the only interface on this host that enumerates tabs that are not visible, as `page tab` descendants of each window frame.

## The trap

The first implementation keyed window memory by Ghostty surface id and placed nothing. Ghostty surface ids are per-process handles, and a long-lived Pi process keeps the value it captured at startup while the tab's own title can carry a different one. For session `01a07495-…`, the process environment and its presence sidecar both said `13657791177033636270` while the live tab label said `15422621806526138244`. Across the desktop, zero of 40 broker surface ids appeared in any of the 35 tab labels; every session token matched. Window memory now stores the surface key and the session-token key from each title and prefers the exact surface.

## Result

`unplaced hidden tabs` fell from 38 to 1 after restarting with erased memory. Live projection placed 33 cards on one workspace and 6 on another, where 2 existed before. Placement is fail-closed throughout: containment in a host process with exactly one window, otherwise the remembered window, otherwise nothing. Activating a hidden tab presents the surface on the host process's bus, focuses the window, and reports success only after the window title proves the tab became visible.

## Boundaries

A tab whose window was never observed, on a host without AT-SPI, stays unplaced and is counted rather than guessed. Two terminals resuming one logical session are separated only while their surface ids are visible; when only the shared token remains, both are placed in the one window claiming it. Multi-output replication remains unimplemented.

Evidence and exact live figures are recorded in [Verification](../packages/pi-activity-strip/docs/project/verification.md).
