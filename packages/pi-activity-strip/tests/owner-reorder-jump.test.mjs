import assert from "node:assert/strict";
import test from "node:test";
import { productionFixture } from "./support/production-panel-fixture.mjs";

for (const mode of ["hover", "explicit"])
  for (const nullFocus of [false, true]) {
    test(`production broker publisher reorder retains ${mode}, NULL=${nullFocus}`, () => {
      const f = productionFixture(),
        p = f.projection;
      const request = f.claim(mode),
        epoch = p.getInteractionEpoch();
      assert.ok(request !== null);
      if (nullFocus) f.focus(null);
      assert.ok(p.keyboardChanged(request, true));
      const before = p.getDisplaySessions()[0].publisherRecordKeys;
      assert.ok(
        f.store.upsert({ ...f.b, updatedAt: 2000, lastEventAt: 2000, publisherSequence: 2 }, 2000),
      );
      p.updateSnapshot(f.store.snapshot(2000));
      assert.notDeepEqual(
        p.getDisplaySessions()[0].publisherRecordKeys,
        before,
        "actual production broker order changed",
      );
      f.refresh();
      assert.equal(p.getInteractionEpoch(), epoch);
      assert.equal(p.keyboardMode(), mode);
      assert.ok(p.ownsKeyboardRequest(request));
      assert.equal(f.views.at(-1).visible, true);
      for (const change of ["addition", "removal"]) {
        const g = productionFixture(),
          gp = g.projection,
          r = g.claim(mode),
          e = gp.getInteractionEpoch();
        if (nullFocus) g.focus(null);
        g.update(
          change === "addition"
            ? [g.a, g.b, { ...g.a, publisherId: "c" }, g.target]
            : [g.a, g.target],
        );
        assert.notEqual(gp.getInteractionEpoch(), e, change);
        assert.equal(gp.ownsKeyboardRequest(r), false, change);
        if (nullFocus) assert.equal(g.views.at(-1).visible, false, change);
      }
    });
  }

for (const mode of ["hover", "explicit"])
  for (const ordering of ["release-first", "focus-first"]) {
    for (const target of [55, 99])
      test(`production jump intent ${mode} ${ordering} target=${target}`, async () => {
        const f = productionFixture(),
          p = f.projection,
          request = f.claim(mode),
          epoch = p.getInteractionEpoch();
        f.focus(null);
        const result = f.jump({ windowId: target, request, epoch }); // same binding as consumePanelEvents
        assert.deepEqual(f.focused, [], "no action until fresh IPC read completes");
        if (ordering === "release-first") {
          assert.ok(p.keyboardChanged(request, false));
          assert.equal(p.isEligible(), false, "capture revoked, not held forever for the action");
          f.refresh(); // real fallback projection while NULL, before source restoration
          assert.equal(f.views.at(-1).visible, false);
          assert.equal(p.getInteractionEpoch(), epoch, "own NULL release is not identity loss");
          f.finish();
        } else {
          f.focus(44);
          assert.ok(p.keyboardChanged(request, false));
          f.refresh();
          f.finish();
        }
        const accepted = target === 55 || mode === "explicit";
        assert.equal((await result).ok, accepted);
        assert.deepEqual(f.focused, accepted ? [target] : []);
        assert.equal(p.keyboardMode(), "none");
        f.focus(44);
        assert.equal(p.getInteractionEpoch(), epoch);
        assert.equal(
          (await f.jump({ windowId: target, request, epoch })).ok,
          false,
          "one accepted action, not replayable authority",
        );
      });
  }

for (const mode of ["hover", "explicit"])
  for (const loss of [
    "non-agent",
    "workspace",
    "close",
    "replacement",
    "ambiguity",
    "membership",
    "cancel",
    "new-claim",
    "fresh-source",
    "fresh-source-pid",
    "fresh-target",
    "fresh-non-agent",
    "fresh-ambiguous-focus",
    "fresh-other-agent",
    "fresh-invalid-inventory",
  ]) {
    test(`in-flight ${mode} jump revoked by ${loss}`, async () => {
      const f = productionFixture(),
        p = f.projection,
        request = f.claim(mode),
        epoch = p.getInteractionEpoch();
      f.focus(null);
      const pending = f.jump({ windowId: 55, request, epoch });
      p.keyboardChanged(request, false);
      let fresh = f.windows();
      if (loss === "non-agent") f.focus(99);
      if (loss === "workspace") f.handlers.onFocusedWorkspace();
      if (loss === "close") f.handlers.onWindowClosed(44);
      if (loss === "replacement") f.handlers.onWindowChanged({ ...fresh[0], title: "plain shell" });
      if (loss === "ambiguity")
        f.handlers.onWindowChanged({ ...fresh[0], id: 66, is_focused: false });
      if (loss === "membership") f.update([f.a, f.target]);
      if (loss === "cancel") p.cancelKeyboard();
      if (loss === "new-claim") {
        f.focus(44);
        p.requestKeyboard();
      }
      if (loss === "fresh-source")
        fresh = fresh.map((w) => (w.id === 44 ? { ...w, title: "replaced before events" } : w));
      if (loss === "fresh-target")
        fresh = fresh.map((w) =>
          w.id === 55 ? { ...w, title: "target lost admission before events" } : w,
        );
      if (loss === "fresh-source-pid")
        fresh = fresh.map((w) => (w.id === 44 ? { ...w, pid: 9999 } : w));
      if (loss === "fresh-non-agent") fresh = fresh.map((w) => ({ ...w, is_focused: w.id === 99 }));
      if (loss === "fresh-ambiguous-focus")
        fresh = fresh.map((w) => ({ ...w, is_focused: w.id !== 55 }));
      if (loss === "fresh-other-agent")
        fresh = fresh.map((w) => ({ ...w, workspace_id: 7, is_focused: w.id === 55 }));
      if (loss === "fresh-invalid-inventory")
        fresh = [...fresh, { ...fresh.find((w) => w.id === 99) }];
      f.finish(fresh);
      assert.equal((await pending).ok, false);
      assert.deepEqual(f.focused, []);
    });
  }

for (const mode of ["hover", "explicit"])
  for (const loss of [
    "delayed-empty-workspace",
    "missing",
    "read-error",
    "malformed-list",
    "malformed-row",
    "missing-focus-flag",
    "malformed-focused-id",
    "missing-index-name",
    "ambiguous",
    "duplicate-id",
    "no-focused-workspace",
  ]) {
    test(`fresh workspace facts revoke ${mode} after own NULL release: ${loss}`, async () => {
      const f = productionFixture(),
        p = f.projection;
      const request = f.claim(mode),
        epoch = p.getInteractionEpoch();
      f.focus(null);
      const pending = f.jump({ windowId: 55, request, epoch });
      assert.ok(p.keyboardChanged(request, false));
      f.refresh();
      assert.equal(p.isEligible(), false);
      assert.equal(p.getInteractionEpoch(), epoch, "workspace notification has NOT arrived");
      let facts = f.workspaces();
      if (loss === "delayed-empty-workspace")
        facts = facts.map((w) => ({ ...w, is_focused: w.id === 9 }));
      if (loss === "missing") facts = [];
      if (loss === "read-error") facts = new Error("IPC failed");
      if (loss === "malformed-list") facts = {};
      if (loss === "malformed-row") facts.push(null);
      if (loss === "missing-focus-flag") delete facts[1].is_focused;
      if (loss === "malformed-focused-id") facts[0].id = "7";
      if (loss === "missing-index-name") delete facts[0].idx;
      if (loss === "ambiguous") facts[1].is_focused = true;
      if (loss === "duplicate-id") facts.push({ ...facts[0], is_focused: false });
      if (loss === "no-focused-workspace") facts[0].is_focused = false;
      f.finish(f.windows(), facts);
      assert.equal((await pending).ok, false);
      assert.deepEqual(f.focused, []);
    });
  }

for (const mode of ["hover", "explicit"])
  test(`fresh display-prefix update preserves accepted ${mode} jump`, async () => {
    const f = productionFixture(),
      p = f.projection,
      request = f.claim(mode),
      epoch = p.getInteractionEpoch();
    f.focus(null);
    const pending = f.jump({ windowId: 55, request, epoch });
    p.keyboardChanged(request, false);
    const fresh = f
      .windows()
      .map((w) => (w.id === 44 ? { ...w, title: w.title.replace("source", "renamed source") } : w));
    f.finish(fresh);
    assert.equal((await pending).ok, true);
    assert.deepEqual(f.focused, [55]);
  });
