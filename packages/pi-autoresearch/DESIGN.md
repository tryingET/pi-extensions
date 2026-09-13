---
summary: "Research Observatory: offline chart-first performance design contract for AK5626."
read_when:
  - "Changing autoresearch dashboard HTML, CSS, or evidence presentation."
name: Research Observatory
version: alpha
description: Compact dark performance instrumentation with secondary experiment exploration.
colors:
  primary: "#E7ECEF"
  secondary: "#9BA8B2"
  neutral: "#0C1015"
  surface: "#171D23"
  on-surface: "#E7ECEF"
  muted: "#303841"
  success: "#4ADE80"
  warning: "#F4BC45"
  error: "#F07878"
  accent: "#7BACFF"
typography:
  display:
    fontFamily: '"Aptos", "Candara", "Trebuchet MS", sans-serif'
    fontSize: 22px
    fontWeight: 500
    lineHeight: 1.05
  h2:
    fontFamily: '"Aptos", "Candara", "Trebuchet MS", sans-serif'
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.2
  body-md:
    fontFamily: '"Aptos", "Candara", "Trebuchet MS", sans-serif'
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.5
rounded:
  sm: 4px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  2xl: 64px
components:
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: 16px
  evidence-against:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.error}"
    padding: 16px
motion:
  reducedMotion: prefer-static
system4d:
  container: "Offline HTML within the existing autoresearch export surface."
  compass: "Readable empirical uncertainty, never implied permission or liveness."
  engine: "Contract -> typed observation -> semantic editorial HTML."
  fog: "Local projections are neither authenticated provenance nor live proof."
---

# Research Observatory

## Intent
Compact dark performance instrumentation: title and exact scope, baseline → best,
improvement, report counts, chronology chart and dense chronological table.
Design patch: [AK5626 performance view](docs/project/2026-09-10-dashboard-performance-view.md).
Reference numbers appear only in clearly labelled synthetic test fixtures.
No external assets, network dependencies, execution controls or invented measurements.

## Typography
Local Aptos/Candara/Trebuchet sans for headings and readable prose. Title 22px,
section headings 18px, body 14px with 1.5 line height; mono numerics and source IDs.
No serif masthead, giant headline or decorative slogan. Wrap long identities.

## Color
Near-black background, graphite cards and quiet borders. Green marks best eligible
measurements and keep dispositions (distinct labels); amber marks discard/uncertainty;
red marks failures; blue marks the chronological run path and focus. Color always
accompanies words. Focus is a 3px blue outline with 3px offset.

## Layout
Maximum canvas 1280px; 24px gutters (16px mobile). Compact header and refresh controls,
exact campaign/cell/lane/metric or comparison group selector, four stat cards,
320px-high offline SVG run chronology, five-column table and one compact inspector.
At narrow widths stats form two columns; table scrolls within its own labelled region.
Atlas and stack lab are retained in collapsed exploration below performance; requirements,
owner gates and complete notebook/audit follow in disclosures. No safety essay above chart.

## Components
Baseline/best and percentage require an explicit unique eligible positive baseline in
an existing valid comparison group. Best is measurement-derived, not keep disposition;
ties are labelled. Runs count reports, kept counts dispositions, neither is improvement.
Raw metric dots may be shown in an exact isolated scope with comparison unverified;
no connected path, normalization or best selection without group authority. Unknown
chronology has no connected trend. Quarantine, failures and duplicate reports remain
readable without becoming best. Planned lanes show no measurements and retain hypotheses.

## Atlas and stack lab
Retain containment, all attempts, evidence inspector, search, contribution filters and
stack comparison. No causal edges or inferred stackability. All pairs remain
“Compatibility unknown — not tested together”. No combined gain or execute controls.

## Interaction and accessibility
Fixed CSP-hashed scripts only; source text stays escaped inert DOM. Native links and
details work without JavaScript; all scopes and source details remain readable. Enhanced
scope/mode/selection controls appear only after initialization. Linked point/row/inspector
selection is keyboard accessible, with 44px control targets. Refresh pauses on interaction,
preserves exact scope/run/mode and reading state, never reassigns missing identities;
selective storage failures disable automatic refresh, not manual reload/exploration.
No network polling. Reduced motion stays static. No hover-only evidence.

## Boundaries
Only clean existing owner ledger evidence may say owner-reported running, always
source/as-of labelled, never heartbeat verified. Controller cursors are not execution.
Owner gates, provenance and complete receipts remain available below the primary view.
Comparability continues to be owned by comparisonGroups; absent per-run evaluator
provenance normally withholds production comparisons. No aggregate cross-campaign best.
