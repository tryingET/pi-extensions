---
summary: "AK5625: explicit Experiment Atlas design patch proposal, implementation and browser handoff."
read_when:
  - "Reviewing or testing the interactive Research Observatory atlas."
---

# AK5625 · Experiment Atlas

## Separate design patch proposal (recorded before DESIGN.md edit)

User-authorized creative direction: **the inked experiment atlas**. Preserve warm paper,
navy, serif/sans/mono stacks and all existing color/spacing tokens. Replace the
text-first hierarchy with a compact masthead, a graphic containment map and adjacent
inspector, contribution marks, then an exploratory stack lab. Keep requirements and
owner posture below the visual instrument; preserve the entire evidence notebook.

Proposed contract delta:
- Allow non-numeric graph geometry for campaign → cell → lane → attempt containment.
  No arrows, causal edges, force-layout proximity, inferred chronology or fake nodes.
- Make native experiment/attempt links and detail panels the accessible map. Distinct
  campaign islands never merge on matching labels. Local/unresolved receipts remain separate.
- Use equal-size outcome marks as a qualitative contribution mosaic, with literal
  report categories, not a success score or a falsification claim. Raw measurements
  remain individually labeled; only existing valid comparison groups get numeric plots.
- Add search, outcome filtering, selected-node inspector and read-only stack selection.
  Stack comparisons show hypotheses/scenarios and structured subject/base/file evidence;
  compatibility is unknown—not tested together. Matching bases or disjoint files prove nothing.
- Static HTML contains all nodes, lane membership, attempts, source audit and uncertainty.
  Fixed CSP-hashed scripts enhance it; source content enters only escaped inert DOM.
- Automatically pause refresh on interaction; preserve filters, selected nodes, stack
  selection, details, focus and scroll across explicit reload/resume. Storage failure
  disables automatic refresh, not exploration. No external assets, execution or owner writes.
- At 1440px use map/inspector asymmetry; at 390px stack in reading order. Visible cobalt
  focus, native labels, 44px targets; restrained selection transition, reduced-motion safe.

Decision: implement this authorized patch for AK5625, distinct from predecessor AK5621/5623.
Pre-edit Foundry lint/export completed before this proposal; validation details below
will distinguish tests from parent-owned browser/runtime proof.

Additional explicit design patch proposal (before applying): invert the focus outline
to the existing paper token inside the dark-ink stack panel. Cobalt remains the focus
color on paper; paper-on-ink avoids low-contrast cobalt-on-navy focus. No new tokens.
Decision: apply this accessibility refinement within the authorized atlas patch.

## Implemented behavior

- Graphic containment islands with every experiment, lane and attempt occurrence;
  same-named cells in different campaigns retain different stable IDs. Local receipts
  and unresolved reports remain isolated source collections, not inferred experiments.
- Native links select the evidence inspector; attempt marks open their exact report.
  Equal-size marks and categorical tallies show reported signal / against / unknown.
  Baselines and threshold reports are signal, **not improvement**. Attempt numbers on
  marks are display ordinals, not a claim of time order. Quarantined history stays labeled.
- Search (including structured identity fields), contribution filter, reset, read-only
  stack picks, arbitrary selected-pair exploration, and clear selection work locally.
  Pair selectors include campaign labels, including when experiment labels collide.
  No joint-test evidence is available; every compatibility verdict stays unknown.
- Matching hypotheses/scenarios/subjects/bases and overlapping/disjoint file lists are
  explicitly reported-field comparisons, not compatibility. Missing fields stay unknown.
  No evaluator gap is relaxed, no numeric series added, no gains summed.
- Complete predecessor notebook, level guide, owner posture, comparisons and raw audit
  remain beneath the atlas. Header metadata and level guide are native disclosures.
- Map and desktop inspector have bounded scroll regions; mobile inspector is in normal
  flow. All nodes and facts remain accessible through native links/details without JS.
- Pointer/key/input/wheel/touch interactions pause refresh until explicit resume. Both
  fixed scripts are independently CSP-hashed. Selection, filters, stack pair, identified
  focus, details, page scroll and map/inspector scroll survive reload. Changed layout
  pauses refresh; missing selected identity is not reassigned. Storage denial disables
  automatic refresh but leaves the atlas interactive.

## Changed files (this child only)

Paths relative to `packages/pi-autoresearch/`:

- `src/core/runtime-dashboard-atlas-model.ts` — view-only node IDs, facts, contribution categories.
- `src/core/runtime-dashboard-atlas.ts` — semantic map/inspector/stack HTML.
- `src/core/runtime-dashboard-atlas-style.ts` — token-preserving visual instrument.
- `src/core/runtime-dashboard-atlas-script.ts` — fixed interactive enhancement.
- `src/core/runtime-dashboard-html.ts` — composition, compact header, CSP; optional deterministic `asOf` argument.
- `src/core/runtime-dashboard-refresh.ts` — interaction pause and reading-state restore.
- `tests/runtime-dashboard-atlas-fixture.ts` — explicit synthetic view seam.
- `tests/runtime-dashboard-atlas-dom.ts` — minimal DOM test harness (not a browser).
- `tests/runtime-dashboard-atlas.test.ts` — adversarial/model/interaction regressions.
- `tests/runtime-dashboard-html.test.ts` — existing contract updated for native filters and two pinned scripts.
- `tests/runtime-dashboard-refresh.test.ts` — existing refresh harness/hash assertions retained and adapted.
- `DESIGN.md` — authorized contract update, following the separate proposal above.
- `docs/project/2026-09-10-dashboard-visual-atlas.md` — this proposal/evidence/handoff.

No owner model/discovery/evaluator files were changed by this child. Existing predecessor
changes were preserved. No staging, commits, AK writes, installs or candidate launches.

## Verification evidence

Evidence root: `$TMPDIR/ak5625-atlas` (this session resolves to
`/home/tryinget/.local/state/pi-quests/tmp/ak5625-atlas`).

- `focused-tests.log`: `node --import tsx --test tests/runtime-dashboard*.test.ts`;
  49 tests passed, zero failed/skipped. Includes both fixed-script hashes, HTML/fact
  injection, retained graph occurrences, isolation, no invented numeric plot, unknown
  stack pairs, same-base/disjoint-files non-proof, filtering, keyboard-event selection,
  focus/scroll/detail restoration, missing identity, layout changes and denied storage.
- `typecheck.log`: local `tsgo --noEmit`, exit 0.
- `scoped-lint.log`: Biome check of dashboard source/tests, exit 0.
- `package-check.log`: `npm run check`, exit 0; 310 tests, 309 passed, zero failed,
  one skipped. The skipped live Prompt Vault test reports missing governed execution
  binding. Gate includes local-link/host pins, formatting/type checks, budgets and quick
  packaging. Existing four unrelated file-budget exceptions remain. Quick packaging
  explicitly tolerates the already-published `0.5.1` registry version guard; Pi smoke and
  npm-view checks are intentionally skipped by that quick gate. No publication occurred.

These are source/VM/package checks, **not Chromium layout, actual CSP enforcement, live
Pi activation or operator proof**. The minimal test DOM cannot validate layout, native
select behavior, fragment scrolling, real Tab order or browser reload timing. Parent owns
those checks, installation and AK evidence. All new individual files are below 500 LOC.

### Foundry findings (exact posture)

Contract: `packages/pi-autoresearch/DESIGN.md`. Foundry active tools were unavailable;
used the existing CLI at `~/ai-society/softwareco/owned/designmd-foundry/dist/cli.js`.
No Foundry package build or external repo mutation was performed.

- Before: `design-before-lint.log`, **0 errors, 1 warning, 8 info**.
- After: `design-after-lint.log`, **0 errors, 1 warning, 8 info** (same findings).
- Warning `orphaned-tokens`, path `colors`: secondary, muted, success, warning, accent
  are not referenced by component tokens; retained intentionally with their prose roles.
- Info `contrast-ratio`: card navy-on-surface **13.84:1**, evidence-against vermilion-on-paper
  **5.54:1**; both pass the linter's WCAG AA normal-text target.
- Five `missing-section` info findings: `overview`, `colors`, `elevation and depth`,
  `shapes`, `dos and donts`. Existing `Intent`/`Color` sections are intentionally retained.
- One `token-summary` info: colors=10, typography=4, rounded=1, spacing=6, components=2,
  motion=1, interactions=0, accessibility=0, toolBindings=0.
- Implementation informed by `design-before-agent.md` (agent-prompt export) and
  `design-before.css`; final concrete tokens in `design-after.css`. Palette, spacing,
  radii and type stacks unchanged. Dark-panel paper focus is an explicit prose refinement.

## Parent Chromium fixture recipe

Ready-made **synthetic only** pages:

- `$TMPDIR/ak5625-atlas/synthetic-rich.html` — two isolated synthetic campaigns, six
  experiment nodes, twelve lanes, 24 attempt marks, two untested experiments; deliberately
  no comparable group. Includes baselines, reported improvement, regression, checks
  failure, inconclusive and censored observations; repeated experiment names cross-campaign.
- `$TMPDIR/ak5625-atlas/synthetic-empty.html` — no experiments or synthetic graph nodes.

Do not copy either over a real exported dashboard. They carry an explicit visible
SYNTHETIC FIXTURE banner. Fixture generation refuses non-empty input directories and
writes no owner packets. To regenerate from the package root:

```bash
node --import tsx --input-type=module <<'NODE'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderSyntheticAtlasFixture } from './tests/runtime-dashboard-atlas-fixture.ts';
const out = path.join(process.env.TMPDIR, 'ak5625-atlas');
mkdirSync(out, { recursive: true });
const input = mkdtempSync(path.join(out, 'empty-fixture-input-'));
writeFileSync(path.join(out, 'synthetic-rich.html'), renderSyntheticAtlasFixture(input));
writeFileSync(path.join(out, 'synthetic-empty.html'), renderSyntheticAtlasFixture(input, 'empty'));
NODE
```

API:
- `syntheticAtlasFixture(emptyScratchCwd, 'rich' | 'empty')` returns
  `{ status, closeout, matrix, model }` for adversarial test variants.
- `renderSyntheticAtlasFixture(emptyScratchCwd, variant?)` returns deterministic HTML.
- Production renderer accepts optional fourth `asOf` string for deterministic rendering;
  default remains actual export time. No production path imports fixture code.

### Selectors / actual browser checks to perform

Open via `file://` at **1440×1000** and **390×844**; also test empty, reduced motion and
JavaScript disabled. Record screenshots and console/CSP errors. Confirm no horizontal
page overflow; map vertical scrolling is intentional.

1. `.atlas-node` (six) selects an experiment. `.atlas-mark` (24) selects an attempt.
   The current panel is `[data-atlas-panel]:not([hidden])`; its selected attempt is
   `[data-atlas-attempt-detail][open]`. Check source descriptions, non-comparable raw
   values and accessible graph containment without relying on hover.
2. `#atlas-search` searches; `#atlas-filter` values: `all`, `signal`, `against`, `unknown`.
   Search `smaller invalidation` → two nodes. Search nonsense → `#atlas-no-results`.
   `#atlas-reset` restores six; `#research` is never filtered.
3. `[data-stack-pick]` indexes 0 and 1 → eligible reports show base/file values, but mixed invalid history
   keeps completeness unknown. Do not expect a complete same-base/disjoint-file verdict.
   Add index 3 (same experiment label in other campaign). Set `#stack-right` to that
   checkbox's `data-stack-pick` value → different-campaign isolation warning.
   Clear with `#stack-clear`; indexes 2 and 5 are untested but their pair is explorable.
   `#stack-evidence` shows missing structured evidence, never compatibility or a gain.
4. Tab/Shift-Tab through links, Space on stack checkboxes, Enter on attempt links;
   inspect visible focus, including paper focus in the dark stack panel. Native
   `#stack-left`/`#stack-right` selects support keyboard pair choice.
5. Interaction should change `#watch-toggle` to “Resume live view”; wait >2 seconds
   and confirm no reload. Change selection/filter/pair, scroll `#atlas-map` and
   `#atlas-inspector`, open a raw detail and manually reload: verify restoration.
   Explicit Resume should permit unattended reload while preserving the same state.
6. Disable JS: enhanced controls stay hidden; native map links, all inspector summaries,
   lane/attempt facts and the entire raw notebook remain available. Empty view has no
   `data-atlas-cell` nodes and makes no success/launch claim.


## Independent review correction · dispatch-1789051407197

This correction supersedes the original fact-completeness and storage-failure coverage
claims above. All three required findings were reproduced before implementation.

### Changes

1. **Fact contamination:** Subject, Base and Changed files now admit only experiment
   reports with matched packet binding, valid schema, valid lineage and valid measurement.
   Quarantined/unbound/invalid reports contribute no values. Their occurrences, and empty
   lanes, remain unknown placeholders when computing completeness: neither filtering nor
   an empty eligible subset can create completeness. Declared hypothesis/scenario remain
   separate plan facts. Every quarantined attempt and its raw audit remain inspectable.
   Source collections do not become experiment stack evidence.
2. **Partial storage failure:** Atlas read/write failures set a persistent document marker
   and emit a fixed local notification. Refresh checks the marker at startup and listens
   for later failure. Either path clears the timer, disables Resume, persists paused state
   where possible and displays a manual-reload warning. Failure is latched for that page,
   even if later smaller atlas writes succeed. The remaining atlas interactions work.
   This covers selective atlas-key quota failure while the reading-state key still works.
3. **Assistive-technology activation:** Captured semantic click events now pause refresh
   without needing pointer/key/input events. The explicit watch control and descendants
   are excluded; its click still resumes when storage is healthy.

Incremental source changes: runtime-dashboard-atlas-model.ts, runtime-dashboard-atlas.ts,
runtime-dashboard-atlas-script.ts, runtime-dashboard-refresh.ts. Tests: new
runtime-dashboard-atlas-review.test.ts; updated atlas DOM harness, atlas interaction
fixtures in tests, and standalone refresh mock. No owner schemas/evaluator gates changed.
DESIGN tokens/contract unchanged. Optional no-JS watch disabling was not included.

### Red → green evidence

All logs remain under the existing evidence root, separate from initial implementation logs:

- review-red.log: **6 tests, 6 failed** before production fixes. Failures directly showed
  foreign facts/completeness, invalid/unbound facts, two selective storage failures, and
  a click-only-triggered reload.
- review-green.log: **7 passed, zero failed**. Added valid-only/untested-lane completeness
  coverage as well as rendered quarantine inspection versus uncontaminated stack facts.
- review-focused.log: **56 dashboard tests passed**, no failures/skips.
- review-typecheck.log: local tsgo exit 0; package gate rechecked final source.
- review-format.log: targeted Biome exit 0.
- review-package-check.log: npm run check exit 0; **317 tests, 316 passed, zero failed,
  one skipped** for the existing missing governed Prompt Vault execution binding.
  Quick packaging again explicitly tolerated the existing 0.5.1 registry version guard;
  no publication or Pi activation occurred.

The ordinary synthetic rich fixture retains mixed validity, so its base/file completeness
now correctly reads unknown. The existing complete same-base/disjoint-file regression
uses an explicitly valid-only test input; it still never concludes compatibility.
Both synthetic-rich.html and synthetic-empty.html were regenerated at the same paths.

### Parent browser follow-up

- Verify foreign candidate fields remain in raw inspection but never enter the stack facts.
- Before navigation, override Storage.prototype.setItem to throw only when the key starts
  with autoresearch-atlas: and the value exceeds 512 characters. A long search should
  disable #watch-toggle and show the atlas-specific manual-reload warning, even though
  the autoresearch-observatory: key remains writable. Clear the search: Resume stays disabled.
- Dispatch a bubbling click on an attempt anchor without pointer/keyboard/input events;
  verify selection works, refresh pauses, and healthy explicit watch activation resumes.

These corrections have model/HTML/VM/package proof only. Actual Chromium timing,
assistive technology and selective-storage enforcement remain parent-owned browser proof.
No parent scratch proof files were touched; only this child's fixture pages/logs were written.

## Final parent browser and installed-command proof

Independent re-review `dispatch-1789051407197` accepted all three bounded corrections.
No remaining blocker was found in that re-review; it did not claim browser verification.

Parent then reinstalled the local `pi-autoresearch` package and used a fresh Pi RPC
process to invoke exact `/autoresearch export` and `/autoresearch export off` commands.
The export contained the atlas and the existing AK5623 blocked observation; periodic
rewrites started and stopped as expected. No model turn, owner tool call, new observation,
candidate launch or LayerManager measurement occurred. Fresh process loading, not this
controller's cached extension instance, supplies activation proof.

Real Chromium verification at 1440×1000 and 390×844 passed:
- six synthetic experiment nodes and 24 attempt markers, exact attempt selection;
- keyboard Enter on attempt links and Space on stack checkboxes; native select keys sent,
  with exact cross-campaign pair additionally selected by value for deterministic assertions;
- search, no-results, reset and contribution filter; stack evidence remains unknown;
- semantic click alone pauses for longer than the refresh interval;
- selected panel/filter/three picks/pair/search focus, 90px map scroll and 500px page scroll
  survive manual reload; explicit Resume allows automatic reload;
- no page or map horizontal overflow; sticky desktop inspector and static mobile inspector;
- reduced-motion transition removal; with scripts disabled all six native evidence panels
  remain available and enhanced controls remain hidden;
- atlas-key-only storage failure disables refresh while other storage still works;
- actual installed export contains a planned node and zero attempt marks;
- zero Chromium runtime/CSP errors in the recorded checks.

Evidence root remains `$TMPDIR/ak5625-atlas`:
`live-export-proof.json`, raw `live-export-events.jsonl`, and
`browser-1789052310600/proof.json` with desktop/mobile atlas and stack screenshots,
empty-state screenshot and actual-export screenshot. Browser and RPC proof scripts are
retained alongside. Owned verification processes were terminated; no unrelated process
cleanup was attempted. No subjective screenshot judgement or screen-reader session is
claimed. Rich fixture observations are explicitly SYNTHETIC and never enter real exports.

Two earlier browser-harness failures are retained: one expected the pre-correction
complete-file label despite mixed invalid history; the other assumed unchecked boxes
on the second viewport despite intentional persistence. The harness now asserts incomplete
evidence and explicitly clears selection before testing Space activation. Neither failure
was fixed by weakening production evidence gates.

Foundry used this package's DESIGN.md, CSS and agent-prompt exports; final findings stay
0 errors, 1 orphan-token warning and 8 informational findings. No new tokens were added.
The full package gate remains 316 passed / 1 existing skip; browser proof supplements its
explicitly skipped installed-tarball smoke. No commit, staging, merge or push is implied.

