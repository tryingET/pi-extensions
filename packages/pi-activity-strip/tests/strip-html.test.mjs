/**
summary: "Tests the generated strip's calm ordering, rich detail, and accessible interaction contract."
read_when:
  - "Changing strip card rendering, ordering cadence, hover details, or keyboard interactions."
*/
import assert from "node:assert/strict";
import test from "node:test";
import { shouldRetainExpandedCard } from "../src/common/card-display.mjs";
import { createStripHtml } from "../src/ui/strip-html.mjs";

test("strip keeps freshness live while ordering refreshes on a calm cadence", () => {
  const html = createStripHtml();

  assert.match(html, /function formatLastSeen\(session\)/);
  assert.match(html, /updatedAt \|\| snapshot\.generatedAt/);
  assert.match(html, /const ORDER_REFRESH_MS = 15000/);
  assert.match(html, /reconcileActivityOrder\(sessions, orderedIds, \{ regroup \}\)/);
  assert.match(html, /function isMonitoringSession\(session\)/);
  assert.match(html, /card\.dataset\.group = isMonitoringSession\(session\)/);
  assert.match(html, /Date\.now\(\) >= nextOrderRefreshAt/);
});

test("stalled wedged sessions render as stalled instead of live activity", () => {
  const html = createStripHtml();

  assert.match(html, /const EVENT_STALL_MS = \d+/);
  assert.match(html, /function isStalledSession\(session, nowMs, stallMs\)/);
  assert.match(html, /isStalledSession\(session, Date\.now\(\), EVENT_STALL_MS\)/);
  assert.match(html, /card\.dataset\.stalled = stalled \? "true" : "false"/);
  assert.match(html, /stalled \? "stalled" : STATE_LABELS\[session\.state\]/);
  assert.match(html, /\.card\[data-stalled="true"\] \{ opacity: 0\.72; \}/);
});

test("last-seen tracks the last real event, not heartbeat republishes", () => {
  const html = createStripHtml();

  assert.match(html, /session\.lastEventAt \|\| session\.updatedAt \|\| snapshot\.generatedAt/);
});

test("duplicate repo labels gain a process disambiguator", () => {
  const html = createStripHtml();

  assert.match(html, /function findDuplicateLabels\(sessions\)/);
  assert.match(html, /const duplicateLabels = findDuplicateLabels\(sessions\)/);
  assert.match(html, /function disambiguatedRepoLabel\(session, duplicateLabels\)/);
  assert.match(html, /updateCard\(card, session, duplicateLabels\)/);
});

test("stale card focus cannot retain expansion after the strip loses focus", () => {
  assert.equal(
    shouldRetainExpandedCard({ hovered: false, activeElement: true, documentFocused: false }),
    false,
  );
  assert.equal(
    shouldRetainExpandedCard({ hovered: false, activeElement: true, documentFocused: true }),
    true,
  );
  assert.equal(
    shouldRetainExpandedCard({ hovered: true, activeElement: false, documentFocused: false }),
    true,
  );
});

test("interactive cards expose hover detail, exact activation, and focus-scoped keyboard control", () => {
  const html = createStripHtml();

  assert.match(html, /role="tooltip"/);
  assert.match(html, /aria-describedby/);
  assert.match(html, /card\.setAttribute\("aria-expanded", "false"\)/);
  assert.match(html, /candidate\.setAttribute\("aria-expanded", isOpen \? "true" : "false"\)/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /api\.activate\(session\.cardId \|\| session\.sessionId\)/);
  assert.match(html, /api\.setExpanded\(Boolean\(expanded\)\)/);
  assert.match(html, /event\.key !== "ArrowLeft"/);
  assert.match(html, /event\.shiftKey/);
  assert.match(html, /moveOrderItem\(orderedIds/);
  assert.match(html, /cards\.querySelector\("\.placeholder"\)\?\.remove\(\)/);
  assert.match(html, /const cardById = new Map/);
  assert.match(html, /if \(nodeAtTarget !== card\) cards\.insertBefore\(card, nodeAtTarget\)/);
  assert.doesNotMatch(html, /cards\.append\(card\)/);
  assert.match(html, /!cards\.querySelector\('\.card\[data-open="true"\]'\)/);
  assert.match(html, /const engagedCard = \[\.\.\.cards\.querySelectorAll/);
  assert.match(html, /shouldRetainExpandedCard\(\{/);
  assert.match(html, /window\.addEventListener\("blur"/);
  assert.match(html, /document\.addEventListener\("pointerleave"/);
  assert.match(html, /api\.onCollapse/);
  assert.match(html, /!card\.contains\(event\.relatedTarget\)/);
  assert.match(html, /Focus bridge failed; nothing focused/);
  assert.match(html, /height: 60px/);
  assert.match(html, /height: 228px/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /--shadow: none/);
  assert.match(html, /focusedCardId/);
  assert.match(html, /card\.dataset\.cardId/);
  assert.match(html, /card\.dataset\.current = isCurrent \? "true" : "false"/);
  assert.match(html, /card\.setAttribute\("aria-current", "true"\)/);
  assert.match(html, /card\.removeAttribute\("aria-current"\)/);
  assert.doesNotMatch(html, /class="card__current"/);
  assert.doesNotMatch(html, /--current-surface/);
  assert.match(html, /\.card\[data-current="true"\]/);
  assert.match(html, /\.card\[data-current="true"\]:focus-visible/);
  assert.match(html, /outline: 2px solid var\(--current-line\)/);
});

test("click-through rendering remains an explicit escape hatch", () => {
  const hidden = createStripHtml({ initiallyVisible: false });
  assert.match(hidden, /<html data-strip-visible="false">/);
  assert.match(hidden, /html\[data-strip-visible="false"\] \{ visibility: hidden; \}/);
  assert.match(hidden, /api\.onVisibility\?\.\(async \(visible, isCurrent/);
  assert.match(hidden, /document\.documentElement\.dataset\.stripVisible/);
  assert.match(hidden, /if \(document\.hidden\) return isCurrent\(\)/);
  assert.match(hidden, /if \(!isCurrent\(\)\) return false/);
  assert.match(hidden, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/);

  assert.match(createStripHtml({ interactive: false }), /pointer-events: none/);
  assert.match(createStripHtml({ interactive: true }), /pointer-events: auto/);
});
