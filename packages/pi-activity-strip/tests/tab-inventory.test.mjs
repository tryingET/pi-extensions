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
const privateSentinel = "PRIVATE_ATSPI_SENTINEL/path/title/env";
const diagnostic = (
  reason,
  { code = "unknown", signal = "unknown", stage = "unknown", helperReason = "unknown" } = {},
) =>
  `the tab inventory helper failed (reason=${reason}, code=${code}, signal=${signal}, stage=${stage}, helperReason=${helperReason})`;

function fixtureEnv(t, tree, extra = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fake-atspi-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const treePath = path.join(directory, "tree.json");
  fs.writeFileSync(treePath, JSON.stringify(tree));
  return {
    ...process.env,
    PYTHONPATH: fixtureRoot,
    PYTHONDONTWRITEBYTECODE: "1",
    FAKE_ATSPI_TREE: treePath,
    FAKE_ATSPI_IMPORT_FAILURE: "0",
    ...extra,
  };
}

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
    // Legacy raw helper text is not a safe diagnostic vocabulary.
    error: diagnostic("import-unavailable", { code: 3 }),
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
  assert.equal(missingResult.error, diagnostic("missing-interpreter"));
  // execFile marks only its own deadline kill as killed; output limits and aborts reject with a
  // string code instead (measured on Node 22.23.3 and 26.13.0).
  const terminated = async () => {
    const error = new Error("killed");
    error.killed = true;
    error.code = null;
    throw error;
  };
  assert.deepEqual(await probeGhosttyTabInventory({ execFileAsync: terminated, pids: [1] }), {
    ok: false,
    unavailable: false,
    error: diagnostic("timeout"),
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

test("the AT-SPI helper reports only frames of requested pids and their page tabs", async (t) => {
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
  const env = fixtureEnv(t, tree);
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
    pythonBin: process.execPath,
    scriptPath: path.join(fixtureRoot, "exit-3.mjs"),
    pids: [4000],
    timeout: 10_000,
  });
  assert.equal(unavailable.unavailable, true);
  assert.equal(fs.existsSync(TAB_INVENTORY_SCRIPT), true);
});

test("Given transport rejection, When stdout varies, Then safe metadata wins independently of JSON", async (t) => {
  const cases = [
    ["killed with valid object", { killed: true, stdout: "{}" }, "timeout", {}],
    ["missing with valid object", { code: "ENOENT", stdout: "{}" }, "missing-interpreter", {}],
    ["exit one empty", { code: 1, stdout: "" }, "exit-status", { code: 1 }],
    ["access denied", { code: "EACCES", stdout: "{}" }, "access-denied", {}],
    ["operation denied", { code: "EPERM" }, "access-denied", {}],
    [
      "output limit",
      { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", killed: true },
      "output-limit",
      {},
    ],
    // execFile's own timeout rejects with exactly this shape (code null, killed true).
    [
      "parent kill without code",
      { code: null, signal: "SIGTERM", killed: true },
      "timeout",
      { signal: "SIGTERM" },
    ],
    [
      "parent kill the child handled",
      { code: 143, signal: null, killed: true },
      "timeout",
      { code: 143 },
    ],
    [
      "external signal",
      { code: null, signal: "SIGTERM", killed: false },
      "signal",
      { signal: "SIGTERM" },
    ],
    ["known signal without killed", { signal: "SIGKILL" }, "signal", { signal: "SIGKILL" }],
    ["seccomp signal", { signal: "SIGSYS" }, "signal", { signal: "SIGSYS" }],
    ["unknown signal", { signal: privateSentinel, killed: true }, "timeout", {}],
    ["killed with unknown code", { code: privateSentinel, killed: true }, "terminated-unknown", {}],
    ["unknown code", { code: privateSentinel }, "unknown", {}],
    ["string numeric code", { code: "1" }, "unknown", {}],
    ["fractional code", { code: 1.5 }, "unknown", {}],
    ["unbounded code", { code: 1e100 }, "unknown", {}],
    ["negative code", { code: -7 }, "exit-status", { code: -7 }],
    [
      "largest safe integer",
      { code: Number.MAX_SAFE_INTEGER },
      "exit-status",
      { code: Number.MAX_SAFE_INTEGER },
    ],
    [
      "arbitrary error JSON",
      {
        code: 1,
        stdout: JSON.stringify({
          error: privateSentinel,
          stage: privateSentinel,
          reason: privateSentinel,
        }),
      },
      "exit-status",
      { code: 1 },
    ],
    [
      "safe helper fields",
      {
        code: 1,
        stdout: JSON.stringify({
          ok: false,
          stage: "desktop-count",
          reason: "enumeration-failed",
          error: privateSentinel,
        }),
      },
      "exit-status",
      { code: 1, stage: "desktop-count", helperReason: "enumeration-failed" },
    ],
    [
      "unsafe helper reason",
      { code: 1, stdout: JSON.stringify({ stage: "desktop-count", reason: privateSentinel }) },
      "exit-status",
      { code: 1, stage: "desktop-count" },
    ],
    [
      "legacy unavailable",
      { code: 3, stdout: JSON.stringify({ error: privateSentinel }) },
      "import-unavailable",
      { code: 3 },
    ],
    [
      "exit cannot become success",
      { code: 1, stdout: JSON.stringify({ ok: true, frames: [] }) },
      "exit-status",
      { code: 1 },
    ],
    ["unknown with raw stdout", { stdout: privateSentinel }, "unknown", {}],
    ["null JSON", { stdout: "null" }, "unknown", {}],
  ];
  for (const [name, metadata, reason, fields] of cases) {
    await t.test(name, async () => {
      const result = await probeGhosttyTabInventory({
        pids: [1],
        pythonBin: privateSentinel,
        execFileAsync: async () => {
          throw Object.assign(new Error(privateSentinel), { stderr: privateSentinel }, metadata);
        },
      });
      assert.deepEqual(result, {
        ok: false,
        unavailable: reason === "missing-interpreter" || reason === "import-unavailable",
        error: diagnostic(reason, fields),
      });
      assert.equal(JSON.stringify(result).includes(privateSentinel), false);
    });
  }
  for (const code of ["ENOENT", "EACCES", 1]) {
    await t.test(`capability failure redacts interpreter for ${code}`, async () => {
      const result = await detectTabInventorySupport({
        env: { PI_ACTIVITY_STRIP_PYTHON: privateSentinel },
        execFileAsync: async () => {
          throw Object.assign(new Error(privateSentinel), { code, stderr: privateSentinel });
        },
      });
      assert.equal(result.available, false);
      assert.equal(JSON.stringify(result).includes(privateSentinel), false);
    });
  }
});

test("Given the helper's failure vocabulary, When it fails with any of it, Then the probe keeps it", async (t) => {
  const source = fs.readFileSync(TAB_INVENTORY_SCRIPT, "utf8");
  const literals = (pattern) => [...source.matchAll(pattern)].flatMap((match) => match.slice(1));
  const stages = new Set(literals(/\bstage = "([a-z-]+)"|\bfail\("([a-z-]+)"/g).filter(Boolean));
  const reasons = new Set(
    literals(
      /\bfail\((?:stage|"[a-z-]+"), "([a-z-]+)"|"([a-z-]+)" if isinstance\(.*?\) else "([a-z-]+)"/g,
    ).filter(Boolean),
  );
  assert.equal(stages.size, 6, `helper stages: ${[...stages]}`);
  assert.equal(reasons.size, 4, `helper reasons: ${[...reasons]}`);
  const probe = (stage, reason) =>
    probeGhosttyTabInventory({
      pids: [1],
      execFileAsync: async () => {
        throw Object.assign(new Error("exit 1"), {
          code: 1,
          stdout: JSON.stringify({ ok: false, stage, reason }),
        });
      },
    });
  for (const stage of stages) {
    await t.test(`stage ${stage}`, async () => {
      assert.equal(
        (await probe(stage, "enumeration-failed")).error,
        diagnostic("exit-status", { code: 1, stage, helperReason: "enumeration-failed" }),
      );
    });
  }
  for (const reason of reasons) {
    await t.test(`reason ${reason}`, async () => {
      assert.equal(
        (await probe("desktop-count", reason)).error,
        diagnostic("exit-status", { code: 1, stage: "desktop-count", helperReason: reason }),
      );
    });
  }
});

test("Given the real execFile transport, When a helper is stopped, Then only the probe's own deadline reads as timeout", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tab-inventory-transport-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const helper = (name, source) => {
    const file = path.join(directory, name);
    fs.writeFileSync(file, source);
    return file;
  };
  const outlives = helper("outlives.mjs", "setTimeout(() => {}, 30_000);\n");
  const killedElsewhere = helper(
    "killed-elsewhere.mjs",
    "process.kill(process.pid, 'SIGTERM');\nsetTimeout(() => {}, 30_000);\n",
  );
  // An interpreter wrapper that traps SIGTERM exits with a status instead of the signal.
  const handlesTerm = helper(
    "handles-term.mjs",
    "process.on('SIGTERM', () => process.exit(143));\nsetTimeout(() => {}, 30_000);\n",
  );
  const probe = (scriptPath, timeout) =>
    probeGhosttyTabInventory({
      execFileAsync,
      env: { PATH: process.env.PATH ?? "" },
      pids: [1],
      pythonBin: process.execPath,
      scriptPath,
      timeout,
    });

  await t.test(
    "Given a helper that outlives the deadline, When the probe stops it, Then reason=timeout",
    async () => {
      assert.deepEqual(await probe(outlives, 250), {
        ok: false,
        unavailable: false,
        error: diagnostic("timeout", { signal: "SIGTERM" }),
      });
    },
  );
  await t.test(
    "Given a helper that exits on SIGTERM, When the deadline stops it, Then reason=timeout keeps its status",
    async () => {
      assert.deepEqual(await probe(handlesTerm, 250), {
        ok: false,
        unavailable: false,
        error: diagnostic("timeout", { code: 143 }),
      });
    },
  );
  await t.test(
    "Given a helper terminated by another process, When it dies of SIGTERM, Then reason=signal",
    async () => {
      assert.deepEqual(await probe(killedElsewhere, 30_000), {
        ok: false,
        unavailable: false,
        error: diagnostic("signal", { signal: "SIGTERM" }),
      });
    },
  );
});

test("Given fatal AT-SPI boundaries, When enumeration fails, Then emit fixed JSON and never partial success", async (t) => {
  const frame = { role: "frame", name: "good", children: [{ role: "page tab", name: "tab" }] };
  const app = { pid: 4000, children: [frame] };
  const cases = [
    ["desktop raises", { desktop: "raise" }, "desktop-lookup", "enumeration-failed"],
    ["desktop absent", { desktop: "none" }, "desktop-lookup", "desktop-unavailable"],
    ["desktop count", { faults: { count: "raise" } }, "desktop-count", "enumeration-failed"],
    [
      "desktop index after a good app",
      { children: [app, app], faults: { "index:1": "raise" } },
      "desktop-index",
      "enumeration-failed",
    ],
    [
      "target app count",
      { children: [{ ...app, faults: { count: "raise" } }] },
      "application-count",
      "enumeration-failed",
    ],
    [
      "target app index after a good frame",
      { children: [{ ...app, children: [frame, frame], faults: { "index:1": "raise" } }] },
      "application-index",
      "enumeration-failed",
    ],
    ["permission denied", { faults: { count: "denied" } }, "desktop-count", "access-denied"],
    [
      "bindings import",
      {},
      "import",
      "bindings-unavailable",
      { FAKE_ATSPI_IMPORT_FAILURE: "1" },
      3,
    ],
  ];
  for (const [name, tree, stage, reason, extra = {}, code = 1] of cases) {
    await t.test(name, async (t) => {
      const env = fixtureEnv(t, tree, extra);
      let failure;
      try {
        await execFileAsync("python3", [TAB_INVENTORY_SCRIPT, "4000"], { env, timeout: 10000 });
      } catch (error) {
        failure = error;
      }
      assert.ok(failure, "fatal boundary must exit nonzero");
      assert.equal(failure.code, code);
      assert.equal(failure.stderr, "", "no traceback/private exception text");
      assert.deepEqual(JSON.parse(failure.stdout), { ok: false, stage, reason });
      assert.equal(failure.stdout.includes(privateSentinel), false);
      const result = await probeGhosttyTabInventory({
        execFileAsync,
        env,
        pids: [4000],
        timeout: 10000,
      });
      assert.deepEqual(result, {
        ok: false,
        unavailable: code === 3,
        error: diagnostic(code === 3 ? "import-unavailable" : "exit-status", {
          code,
          stage,
          helperReason: reason,
        }),
      });
    });
  }
});

test("Given vanished transient nodes and non-target apps, When traversing, Then preserve skip logic", async (t) => {
  const tree = {
    children: [
      { pid: 9999, faults: { count: "raise", "index:0": "raise" } },
      { faults: { pid: "raise" } },
      {
        pid: 4000,
        children: [
          { role: "frame", faults: { role: "raise" } },
          { role: "frame", faults: { name: "raise" } },
          {
            role: "frame",
            name: "ok",
            children: [
              { faults: { role: "raise" } },
              { faults: { count: "raise" } },
              { children: [{}], faults: { "index:0": "raise" } },
              { children: [null] },
              { role: "page tab", faults: { name: "raise" } },
              { role: "page tab", name: "kept" },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(
    await probeGhosttyTabInventory({ execFileAsync, env: fixtureEnv(t, tree), pids: [4000] }),
    { ok: true, frames: [{ pid: 4000, name: "ok", tabs: ["kept"] }] },
  );
});

for (const boundary of ["desktop-child", "frame-sibling"]) {
  test(`Given healthy siblings and null ${boundary}, When enumerating, Then keep healthy frames and exact bindings`, async (t) => {
    const label = `hidden · gs:main:17 · ${token}`;
    const frame = {
      role: "frame",
      name: "healthy window",
      children: [{ role: "page tab", name: label }],
    };
    const app = {
      pid: 4000,
      children: boundary === "frame-sibling" ? [null, frame, null] : [frame],
    };
    const tree = { children: boundary === "desktop-child" ? [null, app, null] : [app] };
    const result = await probeGhosttyTabInventory({
      execFileAsync,
      env: fixtureEnv(t, tree),
      pids: [4000],
      timeout: 10_000,
    });
    assert.deepEqual(
      result,
      {
        ok: true,
        frames: [{ pid: 4000, name: "healthy window", tabs: [label] }],
      },
      "null siblings must not discard a healthy target or trigger failure backoff",
    );
    assert.deepEqual(mapTabInventoryToBindings(result.frames, [ghostty(44, "healthy window")]), [
      {
        bindingKey: "ghostty:main:17",
        windowId: 44,
        windowPid: 4000,
        appId: "com.mitchellh.ghostty",
      },
      {
        bindingKey: `pi-session:${token}`,
        windowId: 44,
        windowPid: 4000,
        appId: "com.mitchellh.ghostty",
      },
    ]);
  });
}
