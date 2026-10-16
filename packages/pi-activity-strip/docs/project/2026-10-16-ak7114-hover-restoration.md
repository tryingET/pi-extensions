---
summary: "AK7114 inactive hover-and-type restoration candidate; handshake design and verification evidence. Not activated."
read_when:
  - "Inspecting or reproducing the user-authorized hover-and-type restoration."
---

# AK7114 — user-explicit hover-and-type restoration

**Superseded candidate evidence.** Independent inspection found publisher-order identity churn,
an accepted-jump/own-release race, and an incompatible private protocol v1 change. The results
and artifact hashes below describe the earlier candidate, not the repaired source. See the
[current independent-review repair](2026-10-16-ak7114-independent-review-repair.md).

Candidate worktree: `/home/tryinget/.local/state/pi-quests/tmp/ak7114-hover-restore.e8cbK2/worktree`,
base `5d12a2a7b6c548e1a9a7744b29e38d97649471d2`. Only `packages/pi-activity-strip/**` changes.
The user explicitly requested restoration after being told that the previous repair removed hover
keyboard capture. That changes the interaction choice, not the focused-agent admission boundary.
The [October 15 record](2026-10-15-ak7114-focus-hover.md) is historical and is not rewritten.

No commits, publication, AK/ontology mutations, canonical changes, Pi installation/reload, or live
activation are performed by this candidate. The active worktree and operator PIDs 3290373/3290412
are outside its mutation/process boundary. Release 7076 and startup 7095 remain separate and held.

## Implementation

- The native panel requests hover permission only from a validated mapped/interactable pointer
  region or fresh click intent. The Node controller checks current exact production eligibility,
  applied visibility and click-through state, and reserves ownership **before** writing a grant.
  Niri NULL focus before an acknowledgement therefore cannot make the panel hide itself.
- Ownership is `none`, `hover`, or `explicit`. A shortcut upgrades hover; the next shortcut exits
  explicit mode. Hover does not inherit arrow/manual movement or unlisted-window permission.
  Unsupported hover keys release capture and are not replayed. Physical Shift permits capital
  search characters without itself extending idle ownership.
- Native attempt tokens are unique per panel lifetime, including multiple attempts within one
  data revision. Controller claims have separate unique ids. Grants also carry a controller
  identity epoch; ordinary telemetry revisions do not invalidate ownership. The legacy
  keyboard command/ack `revision` wire key carries the unique controller claim id, not the
  `view.revision` data counter. Treat this controller and native artifact as a matched pair;
  older controller/panel combinations are not verified. The existing `InteractionLifetime`
  still invalidates delayed scroll callbacks on data changes.
- The panel accepts a grant only for its pending token/current epoch, while visible, mapped,
  interactive and actually containing the pointer. GTK activity alone never authorizes expansion
  or capture. Old grants/cancels/acknowledgements cannot override an explicit upgrade or restore
  invalidated context. Panel restart resets the hover binding, not controller claim uniqueness.
- Body/brand/card/directory crossings share one region. Escape, real leave, activation/jump,
  focus loss/hide or bounded idle clears the query/list and releases keyboard ownership. The
  permission wait is bounded to three seconds, authorized compositor-grab acquisition to ten
  seconds, and actual typing idle to three seconds (monotonic time, checked by the one-second
  GTK tick). Only an already-authorized grab can be confirmed by GTK `is-active`; that confirmation
  starts idle and emits the active acknowledgement. Relevant search keys reset idle; a nonempty
  query does not suspend it. GTK/compositor scheduling can delay dispatch; these are deadlines,
  not hard real-time guarantees. Telemetry never requests a new grab. A mapped pointer absence or fresh click rearms intent after release; a stationary pointer on remap is
  not a fresh keyboard request.
- Numeric hover targets must remain in the admitted directory. The production jump binding
  rechecks actual full-window admission after its IPC read and rejects a revoked source epoch.
  Only an owned explicit request permits an existing unlisted id. Existing card/hidden-tab
  activation continues through production exact identity resolution.
- Complete cached-window/source-fact revalidation in `placement.mjs` and `workspace-events.mjs`
  is retained unchanged. No CSS, theme, tokens or ontology files change. Read-only package ontology
  inspection found no existing keyboard-ownership/activity-ribbon entry.

Key surfaces: `src/native/{focus-visibility,hover-keyboard,keyboard-entry,panel-projection,
window-jump,main}.mjs` and `native/panel/src/{hover_keyboard,app,protocol,runtime}.rs`.

## Verification status

| Check | Observed final result |
| --- | --- |
| Pinned Node 22.23.3 / npm 12.0.2 `npm run check` | Exit 0; **325 tests / 36 files**, lint/typecheck/package/file-budget checks passed. [Log](ak7114-hover-evidence/package-check.txt). The declared publish **dry-run** tolerated its existing 0.9.0 registry version guard and skipped Pi smoke; no publication or Pi activation occurred. |
| Focused six-file production/state regressions | **152/152 passed**. [Log](ak7114-hover-evidence/focused-regressions.txt). Includes normal/NULL-before-ack, same-revision unique attempts, stale cancel/ack after explicit upgrade, failed writes, hidden/click-through denial, source loss/replacement/ambiguity and prior production invalidation cases. |
| `native:check` + `native:build`, Rust 1.98.0, private target, `heavy-job --task 7114` | Exit 0; **38 Rust tests passed**, isolated GTK test deliberately ignored in this ordinary lane. [Log](ak7114-hover-evidence/native-check-build.txt). |
| Full isolated GTK + REAL Node controller + Niri run | **Exit 0**; separately selected actual GTK test passed, then all production-controller assertions passed. Not a controller-only diagnostic selection. [Log](ak7114-hover-evidence/isolated-gui.txt). |
| Virtual pointer/keyboard fixture compilation | `cc -Wall -Wextra -Werror`, successful; real Wayland protocols, not injected `AppMsg` keys. [Commands](ak7114-hover-evidence/fixture-build.txt). |
| Running native executable / complete source receipt | Actual fixture PID **188408** executed this worktree's new binary; `/proc/188408/exe`, staged binary, complete source and Cargo lock hashes matched the receipt. [Record](ak7114-hover-evidence/artifact-match.txt). |
| Isolation cleanup / operator boundary | No nested fixture windows or layers remained; helper stopped. Operator PIDs **3290373/3290412** retained their October 15 start times; host AT-SPI socket inode remained **18947**. Git index empty. [Record](ak7114-hover-evidence/isolation-boundary.txt). |

The full controller run exercised hover **without a shortcut**, typed the listed target window
number and Enter, asserted that exact other-workspace window focus, and confirmed subsequent text
reached its GTK receiver. The same real-controller path verified project-name activation,
leave/Escape/idle clearing a genuinely nonempty native query, subsequent typing after release,
no idle/telemetry recapture with the pointer still inside, no stale expansion with the pointer
gone, unlisted-number refusal, hover-to-explicit upgrade/toggle, known non-agent hiding,
explicit NULL focus, empty-workspace refusal and closing the exact keyboard owner.

The first actual hover interaction lasted **16,003 ms** from applied-focus acknowledgement to
jump, with **54 ordinary view updates**, one hover request/grant, **zero** inactive acknowledgements
before the jump and **zero** hidden views during that active span. Actual Niri NULL focus and
Exclusive mode were checked while real numeric edits kept idle legitimately renewed. This covers
more than two 1500 ms fallback polls, not a passing single-frame proxy.
[Summary](ak7114-hover-evidence/protocol-summary.json) /
[ownership, visibility and native query-length events](ak7114-hover-evidence/protocol-events.jsonl).
The unabridged local journal remains at `native/panel/target/gui-fixture/panel-protocol.jsonl`.

Final native artifact (inactive worktree only, **not Git-staged**):

- Binary SHA-256: `2f9fad94b5a6078136d191c92c8478c0045c35ade636cdbbb9844aec27097bb1`
- Complete Rust/CSS/Cargo source SHA-256: `56195e5c12dfc7b075b429a7371787e42df81058b349fc5487fd8d15dcbc4007`
- Cargo lock SHA-256: `f8ebc11bc721c569af982169e448a5ea4fed15bc06001017d97acda22b1c890b`
- Compiler: `rustc 1.98.0 (88d9e12ae 2026-08-18)`
- Receipt/binary: `native/bin/linux-x64-gnu/{artifact.json,pi-activity-strip-panel}`

The actual controller path exposed an acquisition/idle race: selecting a GTK focus widget is
not proof that Niri has committed exclusive keyboard ownership. The parked compositor delayed
that commit long enough for a grant-started idle timer to release before typing could begin.
The implementation now separates bounded acquisition from actual typing idle and acknowledges
only applied focus under the existing controller permission. Ordinary GTK activity still grants
nothing. Early diagnostic runs failed and are not passing evidence.

Fixture-only corrections retain real checks: the Rust stale-scroll assertion waits for actual
row overflow/allocation; the native demo proves no capture without permission and late-grant
rejection, not Node admission. The controller test observes its real pipe acknowledgement before
typing, and sends relevant numeric edits during slow nested IPC inspection so inspection itself
does not accidentally consume the intended three-second idle period. Starting a new `wtype`
client after hover also produced no root key events before idle expiry in diagnostics. The
controller fixture now initializes one real Wayland virtual keyboard **before** hover, keeps its
US keymap/device alive, and sends actual press/release events through the compositor, not synthetic
`AppMsg` keys. ASCII fixture input is covered; other layouts/IME are not. Actual Niri focus/mode,
exact-target activation, idle release and subsequent typing are asserted separately. The explicit
Escape and owner-close checks likewise wait for actual Niri NULL focus, not just model expansion.
The existing expansion event now includes the actual query length (never its text), allowing the
harness to assert nonempty input and zero after cleanup. Temporary key diagnostics were removed
before the final build/full run.

## Isolation and coverage limits

The canonical `nested-niri-gui-isolation` skill/helper is used for `up/env/check/down`. Every GUI
client/IPC call targets the owned nested display/socket. Only the helper parks its own outer
window. Clients have private HOME/config/runtime/session bus, remove inherited AT-SPI/starter/X11
addresses and Wayland fd overrides, and use `GTK_A11Y=none` / `NO_AT_BRIDGE=1`. The renderer is Cairo.
Host AT-SPI, host GPU rendering, multi-output behavior, actual Ghostty hidden tabs and actual
browser/Obsidian/Pi TUI applications are not newly verified by these fixtures. Click-to-rearm is
implemented through the shared admitted pointer-intent path but is not separately GUI-driven here.
GTK emitted min/natural-height warnings in the fixture; no CSS changes suppress them. Validation
was package-scoped; monorepo-wide CI was not run.

The full controller fixture uses two GTK terminal-identity fixtures with explicit injected
publisher records, plus three non-agent GTK fixtures, not operator applications. It directly
loads the new receipted native binary. `tests/support/trace-panel.mjs` is a passive fixture-only
observer of the real controller/native pipes: it does not queue/rewrite messages or change binary
selection/write results. Its synchronous fixture logging can affect timing; no uninstrumented
operator-runtime timing claim is made. The standalone Rust demo cannot establish Node admission and is
not represented as that proof. Controlled Node event/IPC doubles establish immediate invalidation
and stale-token races; those are not actual desktop automation.

The harness now rejects unexpected resident-child exit **0** or signals, not only nonzero exit.
Expected test/cleanup exits are explicit. A per-condition 30-second assertion watchdog exceeds
all production panel startup retries/backoffs plus two fallback polls; it fails broken GUI
assertions instead of spinning forever. It is not a task/build time budget.

## Reproduction

From this candidate package root, with Node 22.23.3 / npm 12.0.2 on PATH and the canonical helper
already read. Honor the inherited managed `TMPDIR`. No package installation outside this package:

```bash
npm ci --ignore-scripts
heavy-job run --label ak7114-hover-native --task 7114 -- \
  env CARGO_TARGET_DIR="$PWD/native/panel/target" RUSTUP_TOOLCHAIN=1.98.0 \
  bash -c 'npm run native:check && npm run native:build'
D="$PWD/native/panel/target/gui-fixture"
mkdir -p "$D"
REGISTRY="${CARGO_HOME:-$HOME/.cargo}/registry/src"
P=$(find "$REGISTRY" -path '*/wayland-protocols-wlr-0.3.12/wlr-protocols/unstable/wlr-virtual-pointer-unstable-v1.xml' -print -quit)
K=$(find "$REGISTRY" -path '*/wayland-protocols-misc-0.3.12/protocols/virtual-keyboard-unstable-v1.xml' -print -quit)
test -n "$P" && test -n "$K"
wayland-scanner client-header "$P" "$D/virtual-pointer-client.h"
wayland-scanner private-code "$P" "$D/virtual-pointer.c"
cc -Wall -Wextra -Werror -I"$D" tests/support/virtual-pointer.c \
  "$D/virtual-pointer.c" $(pkg-config --cflags --libs wayland-client) -o "$D/virtual-pointer"
wayland-scanner client-header "$K" "$D/virtual-keyboard-client.h"
wayland-scanner private-code "$K" "$D/virtual-keyboard.c"
cc -Wall -Wextra -Werror -I"$D" tests/support/virtual-keyboard.c \
  "$D/virtual-keyboard.c" $(pkg-config --cflags --libs wayland-client xkbcommon) -o "$D/virtual-keyboard"
H="$HOME/ai-society/softwareco/infra/workstation/.pi/skills/nested-niri-gui-isolation/scripts/nested-niri.sh"
ST="$PWD/native/panel/target/gui-fixture/nested-fresh"
"$H" up "$ST"
eval "$("$H" env "$ST")"
PI_ACTIVITY_STRIP_GUI_STATE="$ST/state.json" \
  CARGO_TARGET_DIR="$PWD/native/panel/target" node tests/support/isolated-niri-check.mjs
"$H" check "$ST"
"$H" down "$ST" # Also required on failure, after harness child cleanup.
npm run check
```

`--controller-only` remains a labelled diagnostic selection, not full-run proof. Fresh helper
state is required per run. Native binaries/receipt remain in this inactive worktree only; nothing
is staged in Git by these commands.

## Parent next steps

Inspect the final source diff, artifact receipt and actual final logs, obtain independent
inspection, then commit only the authorized candidate scope. The parent owns any user-authorized
temporary **ribbon-only** process switch; this child does not perform it. Do not move canonical,
settings, other extensions, release 7076 or startup 7095 as part of this restoration. No AK
lifecycle closeout is asserted here.
