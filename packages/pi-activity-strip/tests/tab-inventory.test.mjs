// ---
// summary: "verifies AT-SPI tab inventory mapping, helper transport, and the offline helper contract"
// read_when:
//   - "changing hidden-tab discovery or its capability gating"
// ---

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  detectTabInventorySupport,
  mapTabInventoryToBindings,
  probeGhosttyTabInventory,
  TAB_INVENTORY_SCRIPT,
} from "../src/native/tab-inventory.mjs";

const execFileAsync = promisify(execFile);
const fixtureRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-atspi",
);
const token = "019fa4d071427fb48d30f98e951f0513";
const ghostty = (id, title, pid = 4000, extra = {}) => ({
  id,
  title,
  pid,
  app_id: "com.mitchellh.ghostty",
  workspace_id: 2,
  ...extra,
});

test("tab inventory maps frames to unique same-process windows and binds only surface labels", () => {
  const windows = [
    ghostty(44, `π - dspx · gs:main:16 · ${token}`),
    ghostty(45, "~/programming"),
    ghostty(46, "~/programming"),
    ghostty(47, "solo", 4001),
    { ...ghostty(48, "not ghostty"), app_id: "brave-browser" },
  ];
  const frames = [
    {
      pid: 4000,
      name: windows[0].title,
      tabs: [
        windows[0].title,
        `π - other · gs:main:17 · ${token}`,
        "plain shell",
        `bad · gs:legacy:18 · ${token}`,
      ],
    },
    { pid: 4000, name: "~/programming", tabs: [`π - dup · gs:main:19 · ${token}`] },
    { pid: 4001, name: "solo", tabs: [] },
    { pid: 4002, name: windows[0].title, tabs: [`π - stranger · gs:main:20 · ${token}`] },
  ];
  assert.deepEqual(
    mapTabInventoryToBindings(frames, windows).map((binding) => binding.bindingKey),
    ["ghostty:main:16", `pi-session:${token}`, "ghostty:main:17"],
    "the drifting surface key and the stable session key are both learned",
  );
  assert.deepEqual(mapTabInventoryToBindings(frames, windows)[0], {
    bindingKey: "ghostty:main:16",
    windowId: 44,
    windowPid: 4000,
    appId: "com.mitchellh.ghostty",
  });
  const conflicting = [
    { pid: 4000, name: windows[0].title, tabs: [`π - a · gs:main:21 · ${token}`] },
    { pid: 4001, name: "solo", tabs: [`π - a · gs:main:21 · ${token}`] },
  ];
  assert.deepEqual(
    mapTabInventoryToBindings(conflicting, windows),
    [],
    "two windows claiming one surface fail closed",
  );
});

test("tab inventory probe distinguishes unavailable bindings from transient helper failures", async () => {
  const calls = [];
  const okExec = async (file, args, options) => {
    calls.push([file, args, options.timeout]);
    return {
      stdout: JSON.stringify({
        ok: true,
        frames: [{ pid: 4000, name: "x", tabs: ["a"] }, { pid: "bad" }],
      }),
    };
  };
  const result = await probeGhosttyTabInventory({
    execFileAsync: okExec,
    env: { PI_ACTIVITY_STRIP_PYTHON: "/opt/py" },
    pids: [4000, 4000, 0, 4001],
    scriptPath: "/pkg/helper.py",
    timeout: 750,
  });
  assert.deepEqual(result, { ok: true, frames: [{ pid: 4000, name: "x", tabs: ["a"] }] });
  assert.deepEqual(calls[0], ["/opt/py", ["/pkg/helper.py", "4000", "4001"], 750]);
  assert.deepEqual(await probeGhosttyTabInventory({ execFileAsync: okExec, pids: [] }), {
    ok: true,
    frames: [],
  });

  const unavailable = async () => {
    const error = new Error("exit 3");
    error.code = 3;
    error.stdout = JSON.stringify({
      ok: false,
      error: "AT-SPI bindings unavailable: No module named gi",
    });
    throw error;
  };
  assert.deepEqual(await probeGhosttyTabInventory({ execFileAsync: unavailable, pids: [1] }), {
    ok: false,
    unavailable: true,
    error: "AT-SPI bindings unavailable: No module named gi",
  });
  const missing = async () => {
    const error = new Error("spawn python3 ENOENT");
    error.code = "ENOENT";
    throw error;
  };
  const missingResult = await probeGhosttyTabInventory({
    execFileAsync: missing,
    pids: [1],
    pythonBin: "python3",
  });
  assert.equal(missingResult.unavailable, true);
  assert.match(missingResult.error, /python3 is not installed/);
  const timedOut = async () => {
    const error = new Error("killed");
    error.killed = true;
    error.code = null;
    throw error;
  };
  assert.deepEqual(await probeGhosttyTabInventory({ execFileAsync: timedOut, pids: [1] }), {
    ok: false,
    unavailable: false,
    error: "the tab inventory helper timed out",
  });
  const garbage = async () => ({ stdout: "not json" });
  assert.equal(
    (await probeGhosttyTabInventory({ execFileAsync: garbage, pids: [1] })).unavailable,
    false,
  );
  const empty = async () => ({ stdout: JSON.stringify({ ok: false }) });
  assert.match(
    (await probeGhosttyTabInventory({ execFileAsync: empty, pids: [1] })).error,
    /returned no frames/,
  );

  assert.deepEqual(
    await detectTabInventorySupport({
      execFileAsync: okExec,
      env: { PI_ACTIVITY_STRIP_TAB_INVENTORY: "0" },
    }),
    { available: false, detail: "disabled by PI_ACTIVITY_STRIP_TAB_INVENTORY=0" },
  );
  assert.equal(
    (await detectTabInventorySupport({ execFileAsync: okExec, env: {} })).available,
    true,
  );
  assert.equal(
    (await detectTabInventorySupport({ execFileAsync: missing, env: {} })).available,
    false,
  );
});

test("the AT-SPI helper reports only frames of requested pids and their page tabs", async () => {
  const tree = {
    children: [
      {
        pid: 4000,
        children: [
          {
            role: "frame",
            name: `π - dspx · gs:main:16 · ${token}`,
            children: [
              {
                children: [
                  { role: "page tab", name: `π - dspx · gs:main:16 · ${token}` },
                  { role: "page tab", name: "shell" },
                ],
              },
              {
                role: "page tab",
                name: `π - hidden · gs:main:17 · ${token}`,
                children: [{ role: "page tab", name: "nested" }],
              },
            ],
          },
          { role: "dialog", name: "ignored" },
        ],
      },
      { pid: 4001, children: [{ role: "frame", name: "other", children: [] }] },
    ],
  };
  const treePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fake-atspi-")), "tree.json");
  fs.writeFileSync(treePath, JSON.stringify(tree));
  const env = { ...process.env, PYTHONPATH: fixtureRoot, FAKE_ATSPI_TREE: treePath };
  const result = await probeGhosttyTabInventory({
    execFileAsync,
    env,
    pids: [4000],
    timeout: 10_000,
  });
  assert.deepEqual(result, {
    ok: true,
    frames: [
      {
        pid: 4000,
        name: `π - dspx · gs:main:16 · ${token}`,
        tabs: [`π - hidden · gs:main:17 · ${token}`, "shell", `π - dspx · gs:main:16 · ${token}`],
      },
    ],
  });

  const unavailable = await probeGhosttyTabInventory({
    execFileAsync,
    env: {
      ...process.env,
      PYTHONPATH: fs.mkdtempSync(path.join(os.tmpdir(), "no-gi-")),
      PYTHONNOUSERSITE: "1",
      PYTHONSAFEPATH: "1",
    },
    pythonBin: process.execPath,
    scriptPath: path.join(fixtureRoot, "exit-3.mjs"),
    pids: [4000],
    timeout: 10_000,
  });
  assert.equal(unavailable.unavailable, true);
  assert.equal(fs.existsSync(TAB_INVENTORY_SCRIPT), true);
});
