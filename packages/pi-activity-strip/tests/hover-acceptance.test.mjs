// ---
// summary: "Acceptance-instrument controls: expired ownership and transient recapture cannot count as GUI success."
// read_when:
//   - "Changing the real-GUI hover acceptance trace guards."
// ---
import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoRecapture,
  assertRevocationBeforeIdle,
  bindHoverCapture,
  captureBeforeFocus,
} from "./support/hover-acceptance.mjs";

const ack = (at, active, revision = 2, direction = "from-panel") => ({
  at,
  direction,
  message: { type: "keyboard-active", active, revision },
});
const view = () => ({
  direction: "to-panel",
  message: {
    type: "view",
    visible: true,
    interactionEpoch: 11,
    focusedCardId: "source",
    sessions: [{ cardId: "source", windowId: 6 }],
  },
});
const request = () => ({
  direction: "from-panel",
  message: { type: "hover-request", token: 3, epoch: 11 },
});
const grant = () => ({
  direction: "to-panel",
  message: { type: "hover-grant", token: 3, epoch: 11, request: 2 },
});
const interaction = (capture = ack(1000, true)) => [view(), request(), grant(), capture];
const bound = (capture = ack(1000, true)) => bindHoverCapture(interaction(capture), 1, 6);

test("Given active ownership, When exact revocation precedes idle, Then the temporal guard accepts", () => {
  const capture = captureBeforeFocus(interaction(), 1500, bound());
  assert.equal(assertRevocationBeforeIdle([ack(1600, false)], capture, 1500).at, 1600);
});

test("Given the retained real idle-first timeline, Then it cannot certify active-before-non-agent", () => {
  // Observation-only excerpt from ak7454-headless-niri-2ybwhda1 panel-protocol.jsonl:
  // capture1792776675176, hidden view1792776678745, inactive1792776678749.
  // Original native instrumentation separately located idle expiry first. These public
  // trace timestamps alone already reject an active-revocation claim (>3000ms).
  const capture = ack(1792776675176, true);
  assert.throws(
    () => captureBeforeFocus(interaction(capture), 1792776678745, bound(capture)),
    /before.*idle/,
  );
  assert.throws(
    () => assertRevocationBeforeIdle([ack(1792776678749, false)], capture, 1792776678745),
    /precede idle/,
  );
});

for (const [label, before, focusAt] of [
  ["already released", [ack(1000, true), ack(1200, false)], 1400],
  ["controller echo", [ack(1000, true, 2, "to-panel")], 1400],
  ["clock reversal", [ack(1500, true)], 1400],
  ["missing capture", [], 1400],
  ["unsafe timestamp", [ack(Number.POSITIVE_INFINITY, true)], 1400],
])
  test(`Given ${label}, Then setup refuses rather than claiming active capture`, () => {
    const clockControl = label === "clock reversal" || label === "unsafe timestamp";
    const binding = clockControl ? bound(before[0]) : bound();
    assert.throws(
      () => captureBeforeFocus([view(), ...before], focusAt, binding),
      clockControl ? /focus must be issued before.*idle/ : undefined,
    );
  });

for (const [label, after] of [
  ["wrong revision", [ack(1600, false, 1)]],
  ["controller echo", [ack(1600, false, 2, "to-panel")]],
  ["before command", [ack(1400, false)]],
  ["exact idle boundary", [ack(4000, false)]],
  ["missing revocation", []],
])
  test(`Given ${label}, Then it does not certify this ownership revocation`, () => {
    assert.throws(() => assertRevocationBeforeIdle(after, ack(1000, true), 1500));
  });

test("Given stationary post-jump telemetry, Then absence of new requests is accepted", () => {
  assertNoRecapture([ack(1000, false), { message: { type: "view" } }]);
});
for (const [label, events] of [
  ["transient ownership", [ack(1000, true), ack(1100, false)]],
  ["ungranted request", [{ message: { type: "hover-request", token: 3 } }]],
])
  test(`Given ${label}, Then a later released state cannot hide recapture`, () => {
    assert.throws(() => assertNoRecapture(events), /transient request/);
  });

for (const [label, change] of [
  ["stale request before interaction", (events) => events.splice(1, 1)],
  ["extra request", (events) => events.push(request())],
  ["missing token", (events) => delete events[1].message.token],
  ["wrong epoch", (events) => events[1].message.epoch++],
  ["wrong source", (events) => events[0].message.sessions[0].windowId++],
  ["unfocused source", (events) => (events[0].message.focusedCardId = "foreign")],
  ["hidden source", (events) => (events[0].message.visible = false)],
  ["unrelated grant", (events) => events[2].message.token++],
  ["missing grant revision", (events) => delete events[2].message.request],
  ["missing ack revision", (events) => delete events[3].message.revision],
  ["unrelated acknowledgement", (events) => events[3].message.revision++],
])
  test(`Given ${label}, Then unrelated trace records cannot certify this hover`, () => {
    const events = interaction();
    change(events);
    assert.throws(() => bindHoverCapture(events, 1, 6));
  });

test("Given a bound hover, Then later source revocation or unrelated capture is refused", () => {
  const binding = bound();
  assert.throws(() => captureBeforeFocus([...interaction(), ack(1100, true, 9)], 1400, binding));
  const next = view();
  next.message.interactionEpoch++;
  assert.throws(() => captureBeforeFocus([...interaction(), next], 1400, binding));
  const nullFocus = view();
  nullFocus.message.focusedCardId = null;
  assert.equal(
    captureBeforeFocus([...interaction(), nullFocus], 1400, binding).message.active,
    true,
  );
  const foreignFocus = view();
  foreignFocus.message.focusedCardId = "foreign";
  assert.throws(
    () => captureBeforeFocus([...interaction(), foreignFocus], 1400, binding),
    /source context/,
  );
  delete foreignFocus.message.focusedCardId;
  assert.throws(
    () => captureBeforeFocus([...interaction(), foreignFocus], 1400, binding),
    /source context/,
  );
  const missingRevision = ack(1000, true);
  delete missingRevision.message.revision;
  assert.throws(() => assertRevocationBeforeIdle([ack(1600, false)], missingRevision, 1400));
});

test("Given a prefixed trace, Then the immediate post-jump event remains in the inspected slice", () => {
  const prefix = [{ message: { type: "ready" } }, view()];
  const during = [
    request(),
    grant(),
    ack(1000, true),
    { message: { type: "jump" } },
    request(),
    ack(1200, false),
  ];
  const jumpIndex = during.findIndex((event) => event.message.type === "jump");
  assert.throws(() =>
    assertNoRecapture([...prefix, ...during].slice(prefix.length + jumpIndex + 1)),
  );
});
