---
summary: "Ribbon churn stranded window heights; non-Pi agent tabs were invisible. Both fixed with measured evidence."
read_when:
  - "Investigating windows stuck 84px short, or a missing card for a Claude Code tab."
  - "Changing height repair or non-Pi agent discovery."
type: "fix"
---

# Stranded heights and invisible agent tabs

The operator reported two symptoms on one workspace: windows at the wrong height with nothing correcting them, and a Claude Code window that produced no card and no resize when moved there.

## Measured cause

The output is 1200px. A tile is 1168px with no ribbon and 1084px while the ribbon holds its 84px exclusive zone. With the ribbon unmapped, seven of nine windows still measured 1084px. Showing or hiding the ribbon changes the output working area, and a window whose height is not automatic keeps the absolute value from the previous working area. No correction existed in the package; the old helper that reset every tiled window had been removed as destructive.

The Claude Code window produced no card because only Pi published to the broker. A workspace with Ghostty tabs but no Pi session had zero cards, hence no ribbon, hence no working-area change and no relayout. The two symptoms were the same root cause.

## What made the fix exact

Repair needed evidence, not a blanket reset. A window is treated as stranded only when it did not move while others did **and** it still sits at a height those movers just vacated. That is positive evidence of the old working area, so a deliberately chosen height is never touched. Repaired windows are reset to automatic, so they follow the working area forever after and the problem retires itself.

Agent tabs needed identity. Accessibility exposes Ghostty tabs as anonymous `GhosttyTab` nodes with no surface id, so the tab bar cannot identify a tab. Claude Code, however, holds its per-session scratchpad open, and that path carries the session id; the transcript then records the exact text Claude Code put in the terminal title. Matching that title against window titles placed all three live Claude tabs in exactly one window each.

## Result

One show-and-hide cycle reset 8 windows to automatic, after which all ten windows on the workspace measured the correct 1168px. Three Claude Code tabs were discovered in 23ms and placed exactly, including the moved window, which finally gave that workspace a card, a ribbon, and a correct resize.

## Boundaries

Non-Pi agents publish no telemetry, so their cards show agent, directory, elapsed time and pid only. Only Claude Code exposes a per-tab title identity, so another agent hidden inside a multi-window Ghostty process is counted as unplaced rather than guessed. A workspace whose Ghostty tabs run neither Pi nor a recognized agent still shows no ribbon.

Exact figures are in [Verification](../packages/pi-activity-strip/docs/project/verification.md).
