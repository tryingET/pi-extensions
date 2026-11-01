// Shared independent expectations, distinct production adapters; never a second lifecycle reducer.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createHoverKeyboard } from "../src/native/hover-keyboard.mjs";
import { productionFixture } from "./support/production-panel-fixture.mjs";

const cases = JSON.parse(
  fs.readFileSync(
    new URL("../native/panel/src/hover-lifecycle-fixtures.json", import.meta.url),
    "utf8",
  ),
);
for (const scenario of cases) {
  test(`Given shared Node/Rust lifecycle ${scenario.name}, When replaying production transitions, Then ownership matches each independent step`, () => {
    const f = productionFixture();
    const writes = [];
    const hover = createHoverKeyboard({
      projection: f.projection,
      runtimeStatus: { windowVisible: true },
      writePanel: (message) => {
        writes.push(message);
        return true;
      },
    });
    let token = 0,
      current = 0,
      old = 0;
    for (const [operation, expected] of scenario.steps) {
      if (operation === "grant") {
        old = current;
        assert.equal(hover.request(++token, f.projection.getInteractionEpoch()), true);
        current = writes.at(-1).request;
      } else if (operation === "capture") f.projection.keyboardChanged(current, true);
      else if (operation === "release") f.projection.keyboardChanged(current, false);
      else if (operation === "source-revoked") f.focus(99);
      else if (operation === "stale-permission")
        assert.equal(f.projection.keyboardChanged(old, true), false);
      else assert.fail(`unknown fixture operation ${operation}`);
      assert.equal(
        f.projection.ownsKeyboardRequest(current),
        expected,
        `${scenario.name}: ${operation}`,
      );
      assert.equal(f.projection.keyboardMode(), expected ? "hover" : "none");
    }
  });
}
