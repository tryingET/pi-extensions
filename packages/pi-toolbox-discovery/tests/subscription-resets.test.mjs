// summary: discover and activate the registered read-only reset inventory without elevating risk.
// read_when: changing subscription reset catalog membership or activation policy.

import assert from "node:assert/strict";
import test from "node:test";
import extension, { CATALOG } from "../extensions/toolbox.ts";
import { ALWAYS_ACTIVE_TOOLS } from "../src/toolbox-contract.ts";

function harness(registered = true) {
  let active = [...ALWAYS_ACTIVE_TOOLS],
    tool;
  const all = [...ALWAYS_ACTIVE_TOOLS, ...(registered ? ["subscription_resets"] : [])];
  extension({
    on: () => {},
    registerCommand: () => {},
    registerTool: (value) => {
      tool = value;
    },
    getAllTools: () => all.map((name) => ({ name, description: name, parameters: {} })),
    getActiveTools: () => [...active],
    setActiveTools: (names) => {
      active = [...names];
    },
    sendMessage: async () => {},
  });
  return {
    get active() {
      return active;
    },
    run: (params) => tool.execute("id", params, new AbortController().signal),
  };
}
test("subscription reset inventory is discoverable, latent, and read-only activatable", async () => {
  const h = harness();
  assert.equal(h.active.includes("subscription_resets"), false);
  for (const query of ["reset", "zai", "grok"]) {
    const found = await h.run({ action: "search", query });
    assert.match(found.content[0].text, /subscription-resets/);
  }
  const bundle = CATALOG.find((b) => b.id === "subscription-resets");
  assert.equal(bundle.ownerPackage, "packages/pi-little-helpers");
  assert.equal(bundle.profiles[0].risk, "read");
  assert.deepEqual(bundle.profiles[0].tools, ["subscription_resets"]);
  await h.run({ action: "activate", bundle: "subscription-resets", autoContinue: false });
  assert.equal(h.active.includes("subscription_resets"), true);
});
test("missing owner registration fails before active-set mutation", async () => {
  const h = harness(false),
    before = [...h.active];
  const result = await h.run({ action: "activate", bundle: "subscription-resets" });
  assert.equal(result.details.ok, false);
  assert.deepEqual(h.active, before);
});
