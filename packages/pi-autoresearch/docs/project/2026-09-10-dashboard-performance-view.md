---
summary: "AK5626: authorized dark chart-first design patch, truthful performance scopes and verification."
read_when:
  - "Changing or verifying the performance dashboard."
---

# AK5626 performance view

## Separate DESIGN patch proposal (recorded before DESIGN editing)
Decision: operator explicitly authorized replacing the light atlas-first hierarchy with
compact dark performance instrumentation. Reference descriptions are design examples,
not empirical data; no PNG/OCR was read. Foundry active integration is unavailable;
use the existing CLI read-only lint/export before and after, never mutate Foundry.

Proposed and accepted for this bounded manual edit: near-black #0C1015 background,
graphite #171D23 cards, #E7ECEF text, #9BA8B2 secondary, #303841 border,
#4ADE80 success, #F4BC45 warning, #F07878 failure, #7BACFF line/focus.
Local readable sans headings/body; mono numeric. Compact title/scope header, four
stats, 320px chronology chart, dense run table and linked inspector. Atlas and stack
lab move into collapsed secondary exploration. Owner gates and source caveats stay
available in contextual disclosures. No level/executor/evaluator/discovery change.
Motion is static selection/focus, reduced-motion safe. This supersedes AK5625's
paper/serif/atlas-primary choices, not its evidence boundary or exploration capability.

## Implementation

- `src/core/runtime-dashboard-performance-model.ts`: typed view-only scopes and rows.
  Exact campaign/cell/lane plus all measurement identity fields; deterministic identity
  fingerprints disambiguate native selector labels. Existing `comparisonGroups` remain
  authority. A group must be wholly contained in one resolved lane, have complete
  identity, eligible unique reports, a single comparison key and no withheld reasons.
  No evaluator identity is inferred or added to owner data.
- `runtime-dashboard-performance.ts`, `-style.ts`, `-script.ts`: four cards, offline SVG,
  native run links, five-column chronological table and one enhanced inspector. A
  comparable selector counts its member reports; separate source-report scopes retain
  all excluded/failure/quarantined occurrences. Counts are never independent samples.
- Timestamps must be finite, positive, in Date range and unique; otherwise unique positive
  integer iterations determine order. If neither is available, deterministic report
  positions are explicitly order-unknown and are never connected. Never uses mtime.
- Baseline must be the single explicit eligible baseline-reference report and positive.
  Zero/negative/missing/ambiguous/nonfinite baselines withhold baseline/best summary and
  normalization. Higher-is-better works; equal best values retain all ties. Best includes
  eligible discarded measurements, not just keeps. Overflow withholds percentage/best.
  Baseline-index mode additionally requires nonnegative finite normalized values.
- Raw scopes have isolated eligible dots only, no connected path, best or percentage.
  Failed checks, correctness failures, quarantine, invalid schema/lineage, missing metric
  metadata, and duplicate IDs are excluded from charts but remain readable as reports.
- `runtime-dashboard-html.ts`: primary performance, secondary collapsed atlas/stack,
  contextual owner/freshness and notebook disclosures. Owner gates remain present.
  The notebook comparison renderer uses the same validated group projection.
- `runtime-dashboard-refresh.ts`: explicit manual reload, storage-failure fail-closed
  integration, no reassignment of missing performance selections. Fixed scripts are
  atlas → performance → refresh, each with its own exact CSP hash. SVG mode visibility
  uses attributes (not the non-reflecting SVG `hidden` property). No source interpolation
  into JavaScript, network assets, execution controls, or additional dependencies.

## Synthetic artifacts and parent reuse

Owned output directory: `$TMPDIR/ak5626-performance` (this execution resolves to
`/home/tryinget/.local/state/pi-quests/tmp/ak5626-performance`).

- `showcase.html`: explicitly SYNTHETIC, 12 attempts, 3 discarded, 9 keep dispositions,
  same legitimate synthetic comparison key, baseline 19.1s, best 6.68s, 65.03% lower.
- `unsafe.html`: evaluator unknown, 12 reports, 10 chartable raw dots, quarantined history
  and a low-valued correctness failure; no connected trend, normalization or best.
- `empty.html`: planned hypothesis retained, empty chart, no running claim from a cursor.
- `fixtures.json`: output sizes, scope IDs, run IDs, exact synthetic summary values.
- `foundry-before/after-lint.txt`, `foundry-before/after.css`, `focused.log`, `check.log`.

Reusable exports from `tests/runtime-dashboard-performance-fixture.ts`:
`syntheticPerformanceFixture(cwd, variant)` and
`renderSyntheticPerformanceFixture(cwd, variant)`; variants `showcase | unsafe | empty`.
Pass an **empty owned scratch directory**, not a real repository. Returns typed test
objects / HTML only; no packets, worktrees, native benchmarks or candidate launches.
For example, from the package directory:

```js
// node --import tsx --input-type=module
import { renderSyntheticPerformanceFixture } from './tests/runtime-dashboard-performance-fixture.ts';
// writeFileSync(outputPath, renderSyntheticPerformanceFixture(emptyScratchPath, 'showcase'));
```

## Native browser selector recipe (parent-owned proof, not executed by child)

1. Open `showcase.html` with JavaScript enabled; click `#watch-toggle` to pause.
2. `#performance-scope` chooses the exact group or source-report scope; get its native
   selected value, then use `document.getElementById(value)` for the selected panel.
3. `#performance-mode` selects `baseline` or `raw`. In the selected panel, expect
   `[data-perf-chart="baseline"]:not([hidden])` and 12 `[data-perf-select]` SVG links;
   normalized ticks 100/67/33/0. Raw/unverified mode has no `polyline`.
4. Activate `svg:not([hidden]) a[data-perf-select]` with click or keyboard Enter.
   Its `data-perf-select` value is the stable run ID. Verify matching
   `tr[data-perf-row][aria-selected="true"]`, `[data-perf-detail]:not([hidden])`,
   and focus on `<run-id>-summary`. Table `<run-id>-link` selects the same point.
5. Change mode, open a nested source disclosure, scroll the table/reading view, use
   `#watch-reload`. Scope, run, mode, details and paused state must survive.
6. Open `#exploration > summary`; verify atlas selection, search and stack lab remain.
7. In `unsafe.html`, the mode label is hidden, chart has isolated dots and no best.
   In `empty.html`, no numeric SVG, hypothesis table row retained, no measuring claim.
8. Repeat at 1440px and 390px, keyboard-only and reduced-motion. Mobile table/chart
   scroll inside their regions, not the page. Disable JavaScript: every exact scope,
   native source disclosure and secondary atlas must remain readable. Refresh controls
   are hidden, and no automatic reload occurs.
9. Selectively reject writes to `autoresearch-performance:<pathname>`: refresh becomes
   unavailable while scope selection/native exploration and manual reload still work.
   Remove a saved scope/run: pause and show absence, never select a replacement.

## Verification and limits

Focused dashboard suite: **65 passed, 0 failed**. Includes the unchanged owner provenance,
retained history and ledger-running expectations, plus adversarial baseline/direction/
tie/duplicate/quarantine/mixed-identity/order/arithmetic and linked DOM/state tests.
The deterministic DOM seam is not Chromium, layout, focus rendering or CSP enforcement
proof. Actual installed export and Chromium/interactive proof remain with the parent.

Package `npm run check`: **exit 0; 326 tests, 325 passed, 1 skipped, 0 failed**.
Uses package-native `tsgo`; lint, file budgets and quick packaging completed. The skipped
live Prompt Vault test reports missing governed binding. Quick release checks skip Pi
smoke and tolerate the existing published-version guard in `npm publish --dry-run`.
No publication occurred. A separate initial `tsc --noEmit` probe reported 19 existing
out-of-scope command/editor mock return-type errors in `runtime-command-actions.test.ts`
and `runtime-command-ui.test.ts`; not changed here and not the canonical compiler gate.

Foundry read-only lint: **0 errors, 1 warning** before and after. Remaining warning is
component-unreferenced tokens whose roles are documented in prose. Exported contrast:
text/card 14.27:1; failure/background 6.96:1. These are token checks, not browser proof.
All touched TypeScript files remain below 500 LOC/50KB. Production comparisons generally
remain withheld because owner closeouts omit actual per-run evaluator provenance.

## Independent-review fixes · dispatch-1789054170622

Recorded five failing regression tests first (`review-red.log`), then fixed:

- Magnitude-aware numeric display: sub-centesimal values use significant digits;
  very small/large values use scientific notation, falling back to round-trippable
  notation when compact rounding would overflow. Nonzero signs and negative zero
  are preserved. `0.001s → 0.0005s` now stays readable beside `50% lower`.
  `.perf-numeric` supplies exact JavaScript numeric values in both `title` and
  `aria-label`, including metrics, normalized indexes, signed deltas and improvement.
  Chart point labels give exact raw measurements; axis labels also expose exact values.
  This preserves the source number, not precision absent from its IEEE-754 representation.
- Registered chart and table scroll regions restore **both** `scrollLeft` and
  `scrollTop`. Legacy saved ports without `x` default to zero. Nonfinite offsets
  restore as zero. Existing pause/layout/identity/storage-failure gates are retained.
- Table status now separates the green keep disposition from the empirical verdict:
  `.perf-outcome.against` shows regression/failure in red; `.perf-outcome.uncertain`
  shows uncertainty/censoring in amber. No disposition or verdict is rewritten.

Review gates: **70/70 focused dashboard tests**; `npm run check` **exit 0**, **331 tests,
330 passed, 1 skipped, 0 failed**. The same unavailable live Prompt Vault binding remains
skipped. Logs: `review-red.log`, `review-focused.log`, `review-check.log`. These are
static/DOM-seam tests, not Chromium proof. Parent owns actual mobile/browser verification.

Updated parent selectors (scope ID = native `#performance-scope` selected value):

- Chart scroll region: `#<scope-id>-chart[data-reading-scroll]`.
- Table scroll region: `#<scope-id>-table[data-reading-scroll]`.
- Exact numbers: `.perf-numeric[title][aria-label]`.
- Separate outcome: `tr[data-perf-row] .perf-outcome.against` or `.uncertain`.
- Showcase scope: `performance-3fc43c6b1e9e483d992b0f56` (same stable ID as before).

Fixtures regenerated under `$TMPDIR/ak5626-performance`; `tiny.html`, `contrary.html`
and `extremes.html` are additional explicitly synthetic review pages. They are view-only
mutations of the typed fixture, never production packets. `tiny.html` has 0.001→0.0005s;
`contrary.html` retains a keep+regression and keep+inconclusive row; `extremes.html` covers
signed subnormal and maximum finite values. `render-review-fixtures.mjs` reproduces them.

## Authorized density refinement (proposal recorded before editing)

Parent Chromium measurement reports chart/table starts at 395/815px at 1440px and
chart starts at 819px at 390px. These are parent observations, not child measurements.
Refine existing layout only: title row → one combined scope/mode/refresh toolbar →
roughly 100px desktop stat cards → unchanged 320px SVG → table. Target desktop table
near 600px and mobile chart within the first viewport; parent must remeasure.

No new palette/font tokens, evidence rules, selection/storage semantics or owner gates.
Move repository paths and full refresh explanation into owner disclosure. Keep exact
scope names in native options, accessible headings and disclosures; visually suppress
only the duplicate scope heading after enhancement. Keep comparison status visible.
Native controls stay at least 44px and wrap rather than creating long metadata paragraphs.

Density implementation/result:

- One `.perf-toolbar` owns scope, mode, pause/resume, reload and concise `aria-live`
  status. Refresh button copy is short; accessible action labels remain explicit.
  Refresh execution, timer, pause, storage, selection and failure logic are unchanged.
- Header is title plus Explore/Sources links. Exact repository path and complete
  unattended-refresh warning are in `#owner-context`; owner state remains disclosed
  there and labelled on the source link, never inferred from a cursor.
- The enhanced duplicate `.perf-scope-title` is visually clipped, not deleted, using
  the existing controls' visibility. Without JS it stays visible. Full exact identity
  is also available at `#<scope-id>-identity`, in native scope options and section labels.
- Desktop stat padding is 10×12px, numeric line-height 1.2; mobile uses 8×10px. Long
  numeric values still wrap rather than being clipped to a fixed card height. Desktop
  comparison status shares the chart heading row; on mobile it wraps at full width.
- At narrow widths the scope occupies one native-control row; mode/pause/reload share
  the next. No path or duplicate full-scope paragraph precedes the stat cards. The
  comparison badge, chart/table scroll IDs, 320px chart, evidence and secondary atlas
  remain intact. Synthetic showcase banner is shorter but remains explicitly synthetic.

Structural regression reproduced first (`density-red.log`), then **71/71** focused
checks passed (`density-focused.log`). `npm run check`: **exit 0**, **332 tests,
331 passed, 1 skipped, 0 failed** (`density-check.log`); the live Prompt Vault binding
skip remains. Fixtures and SHA-256 manifest regenerated. Browser coordinates are still
**unverified by this child**: parent should measure `.perf-chart`, `.perf-chart-card`,
`.perf-stats` and `.perf-table-wrap` at 1440px/390px using the refreshed HTML. The table
near 600px desktop and first-viewport mobile chart remain targets until that measurement.

## Final parent verification

Independent reviewer `dispatch-1789054170622` accepted the corrected numeric/scroll/outcome
slice, including 1,269 independent numeric rendering cases. The subsequent density change
was presentation-only and received its structural regression plus package gate above.

Parent reinstalled the local pi-autoresearch package and used a fresh Pi RPC process to
execute `/autoresearch export` and `/autoresearch export off`. File rewrites started/stopped
as expected. This re-exported the existing blocked AK5623 observation only: zero model
turns, zero tool calls, no new owner observation, no LayerManager/candidate execution.
The actual export shows the performance view with no measurements or fabricated trend.

Real Chromium at 1440×1000 and 390×844 passed linked SVG/table/inspector selection,
keyboard Enter/Tab, raw/index switching, semantic-click pause, explicit resume/reload,
secondary atlas, no-JS scopes, reduced motion, exact tiny-value labels, retained unsafe
reports, contrary outcomes, and selective performance-storage failure. Manual reload
restored the selected fifth run, baseline mode, 400px vertical position, and at 390px
chart/table horizontal positions 140/180px. No page horizontal overflow or runtime/CSP
errors were recorded. Native graph/table horizontal scrolling is deliberate on mobile.

Measured final layout, including the explicit synthetic banner:
- 1440px: chart card top 260.58px; SVG height 320px; table top 649.08px; stat height 107.78px.
- 390px: chart card top 429.98px (inside first viewport); SVG height 320px;
  table top 883.58px; two-row stat height 210.89px.

Evidence in `$TMPDIR/ak5626-performance`: `live-export-proof.json`, raw RPC event/stderr
logs, and `browser-1789055581803/proof.json` with performance/ledger desktop/mobile,
unsafe/empty/tiny and actual-export checks. Captured screenshots include desktop/mobile
performance and ledger, empty, tiny, and actual export; no unsafe screenshot was required.
Earlier failed browser harness output is retained: its reset cleared storage before
pagehide then pagehide correctly re-saved the previous scope; the corrected harness clears
storage before the next document scripts, not by changing production persistence.

Proof limits: synthetic comparable charts demonstrate the interface, not real research
gains or compatible stacked candidates. Current owner provenance still withholds production
comparisons. No screen-reader session or subjective pixel inspection is claimed. Owned
browser/RPC proof processes were terminated; unrelated sessions/processes were untouched.
No staging, commit, merge or push. Foundry contract remains 0 errors / 1 token warning;
CSS exports informed the new dark palette, with no subsequent token change for density.

