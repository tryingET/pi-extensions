---
summary: "AK8273: persistent ribbon presentation without broadening keyboard permission."
read_when:
  - "Checking why browser, overlay or empty-workspace focus no longer hides the strip."
task_id: 8273
---

# Persistent presentation

Operator request: keep the strip present and the desktop steady, preserving the existing
appearance. No visual redesign, new design tokens, desktop configuration edits or SDK adoption.

Default presentation now remains mapped once a focused Niri workspace is known, even without
cards or ordinary window focus. The native panel respects that view instead of independently
hiding empty views. Its existing 84px exclusive zone plus 8px top margin stays constant.
Other compositor layers keep their normal stacking; this is not an always-on-top Overlay layer.
`PI_ACTIVITY_STRIP_VISIBILITY=focus` retains the former hide/reclaim behavior.

Input remains a separate decision. Existing source/epoch/request checks still revoke keyboard
permission on source loss. A passive visible strip over a browser does not gain keyboard
permission. Existing presence-app controls, hover interaction and exact card activation are
unchanged. Stopping/crashing the panel still releases its reservation.

## Verification before activation

Evidence directory: `/data/agnt/worktrees/ak8273-evidence/` (local execution evidence, not authority).

- New controller regression: five expected failures before the controller change, then six
  passes. Expanded input coverage subsequently passed eight cases, including admitted claims,
  native input release under NULL focus, stale acknowledgement refusal and empty workspaces.
- Native GTK: the new empty-view test failed the old card-count guard at
  `visible=true must map even without cards`; the same test passed the new implementation.
  It also checks populated/empty transitions, real receiver typing, explicit capture release,
  and explicit hide. Rust 1.98 unit/build checks passed; the binary and receipt were rebuilt.
- Actual production controller + receipted native binary in an owned private headless Niri:
  ten phases cover agent/browser/Obsidian fixtures, competing exclusive overlay, empty workspace,
  return and takeover from actual explicit strip capture. Across 162 sampled geometry checks,
  window heights remained 596px from a 688px unreserved height; protocol tracing found no
  transient hide during the measured switches. Browser and both overlay paths received typing.
  Helper inner/outer cleanup reported clean. See `controller-03.txt` and its retained state tar.
- Initial overlay fixture attempt failed because Python loaded layer-shell too late. Corrected
  only the fixture with explicit library preload and an actual-layer assertion; the original
  geometry assertion was retained. That failed attempt is not counted as behavior evidence.
- Independent source inspection found the old GUI suite needed explicit legacy focus mode;
  fixed without changing its assertions. It also prompted stronger admitted-input assertions
  and the actual explicit-capture overlay takeover check.

Limits: fixtures are real GTK windows, not the operator's browser/Obsidian. The headless lane
uses Cairo, not host GPU rendering. Multi-output placement remains unimplemented. Existing
rapid hover/remap limitations are not claimed repaired. Package/root checks and actual live
adoption are recorded separately in AK8273 evidence; this note is not a completion verdict.
