import assert from "node:assert/strict";
import test from "node:test";
import { productionFixture } from "./support/production-panel-fixture.mjs";

for (const mode of ["hover", "explicit"]) {
  test(`Given captured ${mode} input, When a competing overlay takes focus and native releases input, Then never unmap or reacquire`, () => {
    const f = productionFixture({});
    const request = f.claim(mode);
    assert.notEqual(request, null);
    assert.equal(f.projection.keyboardChanged(request, true), true);
    f.focus(null);
    assert.equal(f.projection.keyboardChanged(request, false), true);
    f.refresh();
    assert.equal(f.views.at(-1).visible, true);
    assert.equal(f.projection.keyboardMode(), "none");
    assert.equal(f.projection.requestKeyboard(), null);
    assert.equal(f.projection.keyboardChanged(request, true), false);
  });
}

for (const mode of ["passive", "hover", "explicit"]) {
  test(`Given a ${mode} ribbon, When browser or another overlay takes focus, Then keep presentation but revoke input`, () => {
    const f = productionFixture({});
    const request = mode === "passive" ? null : f.claim(mode);
    if (mode !== "passive") {
      assert.notEqual(request, null, "SETUP: keyboard request was admitted");
      assert.equal(f.projection.keyboardChanged(request, true), true);
      assert.equal(f.projection.keyboardMode(), mode);
    }
    assert.equal(f.views.at(-1).visible, true);
    const boundary = f.views.length;
    f.focus(99);
    assert.equal(f.projection.keyboardMode(), "none");
    assert.equal(f.projection.requestKeyboard(), null);
    assert.equal(
      f.projection.requestHoverKeyboard(f.projection.getInteractionEpoch(), 91, false),
      null,
    );
    if (request !== null) assert.equal(f.projection.keyboardChanged(request, true), false);
    f.focus(null);
    f.refresh();
    assert.equal(f.projection.keyboardMode(), "none");
    assert.ok(
      f.views.slice(boundary).every((view) => view.visible),
      "no hide/zone removal during focus loss",
    );
    f.focus(44);
    f.refresh();
    assert.equal(f.projection.keyboardMode(), "none", "focus return does not capture typing");
  });
}

test("Given an idle ribbon, When an unrelated overlay reports NULL focus, Then it stays present without keyboard authority", () => {
  const f = productionFixture({});
  f.focus(null);
  f.refresh();
  assert.equal(f.views.at(-1).visible, true);
  assert.equal(f.projection.requestKeyboard(), null);
  assert.equal(f.projection.keyboardMode(), "none");
});

test("Given a ribbon, When changing to an empty workspace or losing its last card, Then retain the compact surface without input", () => {
  const f = productionFixture({});
  f.projection.publishWorkspaceView({
    workspace: { id: 9, is_focused: true },
    sessions: [],
    focusedSessionId: null,
    focusKind: "none",
  });
  assert.equal(f.views.at(-1).visible, true);
  assert.equal(f.views.at(-1).sessions.length, 0);
  assert.equal(f.projection.requestKeyboard(), null);
  f.update([]);
  assert.equal(f.views.at(-1).visible, true);
  assert.equal(f.projection.keyboardMode(), "none");
});

test("Given explicit focus visibility mode, When browser takes focus, Then retain the previous hide behavior", () => {
  const f = productionFixture({ PI_ACTIVITY_STRIP_VISIBILITY: "focus" });
  f.focus(99);
  assert.equal(f.views.at(-1).visible, false);
  assert.equal(f.projection.requestKeyboard(), null);
});
