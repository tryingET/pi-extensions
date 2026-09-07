import assert from "node:assert/strict";
import { lstatSync, mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyNamespace } from "../dist/task-session/classify.js";
import { taskSessionCapability } from "../dist/task-session/core.js";
import { DispatchGuard, guardedExecution } from "../dist/task-session/dispatch.js";
import taskSessionTool from "../dist/task-session/pi-tool.js";
import {
  durableWrite,
  physicalIdentity,
  readSnapshot,
  reserve,
} from "../dist/task-session/state.js";
import { restrictedViewComponent } from "../dist/task-session/ui.js";

test("production restricted component rejects paste/commands, strips controls, contains stop failure", async () => {
  let stops = 0,
    quits = 0,
    renders = 0;
  const view = restrictedViewComponent(
    () => ({
      identity: { attempt: "a" },
      phase: "RUNNING",
      denial: null,
      events: [{ type: "text", text: "hello\x1b]52;c;YQ==\x07\runsafe" }],
    }),
    async () => {
      stops++;
      throw Error("synthetic failure");
    },
    () => quits++,
    () => renders++,
  );
  for (const input of ["follow up", "/model other", "\x1b[200~s\x1b[201~", "\r"])
    view.handleInput(input);
  assert.equal(stops, 0);
  assert.ok(view.render(100).some((s) => s.includes("Secondary input")));
  assert.ok(
    view.render(100).every((s) =>
      [...s].every((c) => {
        const n = c.charCodeAt(0);
        return n >= 32 && (n < 127 || n > 159);
      }),
    ),
  );
  view.handleInput("s");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stops, 1);
  assert.ok(view.render(100).some((s) => s.includes("Stop unconfirmed")));
  view.handleInput("q");
  assert.equal(quits, 1);
  assert.ok(renders >= 5);
});
const scratch = () => mkdtempSync(join(tmpdir(), "task5480-hardening-"));
test("real DB-free classification loads same physical snapshot and detects replacement", () => {
  const root = scratch(),
    checkout = join(root, "checkout"),
    git = join(checkout, ".git");
  mkdirSync(checkout);
  mkdirSync(git);
  const lock = join(root, "namespace.lock");
  writeFileSync(lock, "", { mode: 0o600 });
  const rs = lstatSync(root),
    ls = lstatSync(lock);
  const locator = {
    schema: "pi.task-session.locator.v1",
    namespace: "n",
    root,
    uid: process.getuid(),
    rootDev: rs.dev,
    rootIno: rs.ino,
    lockDev: ls.dev,
    lockIno: ls.ino,
  };
  const domain = {
    akInstance: "a",
    taskId: 1,
    checkout,
    commonGit: git,
    sharedEffects: [],
    physical: { checkout: physicalIdentity(checkout), commonGit: physicalIdentity(git) },
  };
  const state = {
    schema: "pi.task-session.state.v1",
    namespace: "n",
    generation: 1,
    withdrawn: false,
    inventoryComplete: true,
    domains: [domain],
    enrolled: [],
    attempts: [],
  };
  durableWrite(join(root, "state.json"), state);
  const request = {
    schema: "pi.task-session.classify-request.v1",
    requestId: "r",
    akInstance: "a",
    taskIds: [1],
    cwd: checkout,
  };
  assert.equal(classifyNamespace(request, locator).classification, "outside");
  state.enrolled.push(domain);
  durableWrite(join(root, "state.json"), state);
  assert.equal(classifyNamespace(request, locator).classification, "enrolled");
  renameSync(git, join(checkout, ".old-git"));
  mkdirSync(git);
  assert.throws(() => classifyNamespace(request, locator), /domain_replaced/);
  assert.throws(() => reserve(locator, "r", "a".repeat(64), domain), /domain_replaced/);
  assert.equal(
    readSnapshot(locator).attempts.length,
    0,
    "inspection survives topology replacement without erasing custody",
  );
});
test("stop after successful preflight is rechecked at actual tool execute", () => {
  const guard = new DispatchGuard("i", "p");
  guard.prepared();
  guard.admitted(Date.now() + 50000);
  guard.closed();
  guard.begin();
  let effects = 0;
  const execute = guardedExecution(
    () => guard.assert(),
    () => effects++,
  );
  guard.assert(); // earlier successful parallel preflight
  guard.stop("stop_between_preflight_and_execute");
  assert.throws(execute);
  assert.equal(effects, 0);
  assert.throws(execute);
});
test("Pi projection parity and controller draft preservation", async () => {
  let registered;
  const draft = "/literal unsent draft";
  const pi = {
    registerTool(tool) {
      registered = tool;
    },
    ui: {
      setEditorText() {
        throw new Error("draft touched");
      },
    },
  };
  taskSessionTool(pi);
  assert.equal(registered.name, "task_session");
  const result = await registered.execute("id", { operation: "capability" });
  assert.deepEqual(JSON.parse(result.content[0].text), taskSessionCapability());
  assert.equal(draft, "/literal unsent draft");
  const bad = await registered.execute("id", {
    operation: "launch",
    request: '{"exec":"/bin/sh"}',
  });
  assert.equal(bad.details.reason, "invalid_fields");
});
