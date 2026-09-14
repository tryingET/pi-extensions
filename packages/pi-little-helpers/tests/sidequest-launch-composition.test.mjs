// summary: verifies the Fleet Phase-3 launchPiQuestSession composition seams (modelArgs, extraPiArgs, additive provenance).
// read_when:
//   - changing standing-agent child argv composition or controller-context propagation policy.
import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBoundedLaunchArgv,
  launchPiQuestSession,
  STANDING_AGENT_DISPATCH_GUARD_VERSION,
  STANDING_AGENT_TRANSPORT_VERSION,
} from "../extensions/sidequestLaunch.ts";
import { buildCandidatePeerSpawnPrompt } from "../extensions/sidequestPeerPrompts.ts";
import { createExecStub, extractPiArgs } from "./sidequest-harness.mjs";

function createLaunchHarness({ targetCwd, parentCwd, company } = {}) {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n" };
    }
    if (args[0]?.startsWith("--working-directory=")) {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });
  const pi = {
    exec: execStub.exec,
    getThinkingLevel: () => "low",
  };
  const env = {
    TERM_PROGRAM: "ghostty",
    GHOSTTY_BIN_DIR: "/usr/bin",
    PI_SIDEQUEST_PI_BIN: "pi",
    ...(company ? { PI_COMPANY: company } : {}),
  };
  return { execStub, pi, env, targetCwd, parentCwd };
}

test("modelArgs override and extraPiArgs compose a manifest-owned standing-agent argv", async () => {
  const harness = createLaunchHarness({ targetCwd: "/agents/agent-x", parentCwd: "/work/repo" });
  const outcome = await launchPiQuestSession({
    pi: harness.pi,
    ctx: { model: { provider: "openai", id: "gpt-4o" }, cwd: harness.parentCwd },
    options: { env: harness.env, exec: harness.execStub.exec, pathExists: () => true },
    defaultPiBin: "pi",
    prompt: "# Standing agent launch: agent-x",
    titlePrompt: "Standing: X",
    cwd: harness.targetCwd,
    modelArgs: ["--model", "zai/glm-5.3", "--thinking", "medium"],
    extraPiArgs: ["--system-prompt", "persona bytes", "--tools", "read,bash,intercom"],
  });
  assert.equal(outcome.ok, true);
  const piArgs = extractPiArgs(harness.execStub.calls.at(-1).args);
  assert.deepEqual(piArgs, [
    "pi",
    "--model",
    "zai/glm-5.3",
    "--thinking",
    "medium",
    "--system-prompt",
    "persona bytes",
    "--tools",
    "read,bash,intercom",
    "# Standing agent launch: agent-x",
  ]);
});

test("standing-agent provenance is child-only and additive to company provenance", async () => {
  const harness = createLaunchHarness({
    targetCwd: "/agents/agent-x",
    parentCwd: "/home/op/ai-society/softwareco/owned/pi-extensions",
  });
  const outcome = await launchPiQuestSession({
    pi: harness.pi,
    ctx: { model: { provider: "openai", id: "gpt-4o" }, cwd: harness.parentCwd },
    options: { env: harness.env, exec: harness.execStub.exec, pathExists: () => true },
    defaultPiBin: "pi",
    prompt: "# Standing agent launch: agent-x",
    titlePrompt: "Standing: X",
    cwd: harness.targetCwd,
    modelArgs: ["--thinking", "medium"],
    childProvenanceEnv: {
      PI_PROVENANCE_STANDING_AGENT_VISIBLE_LAUNCH: "standingagent-fixture-abcd1234:ak-5133:agent-x",
    },
  });
  assert.equal(outcome.ok, true);
  const piArgs = extractPiArgs(harness.execStub.calls.at(-1).args);
  assert.equal(piArgs[0], "env");
  assert.ok(piArgs.includes("PI_COMPANY=software"));
  assert.ok(piArgs.includes("PI_COMPANY_PROVENANCE=parent_cwd"));
  assert.ok(
    piArgs.includes(
      "PI_PROVENANCE_STANDING_AGENT_VISIBLE_LAUNCH=standingagent-fixture-abcd1234:ak-5133:agent-x",
    ),
  );
  assert.equal(harness.env.PI_PROVENANCE_STANDING_AGENT_VISIBLE_LAUNCH, undefined);
});

test("unscoped child cwds still receive controller company provenance by default", async () => {
  const harness = createLaunchHarness({
    targetCwd: "/agents/agent-x",
    parentCwd: "/home/op/ai-society/softwareco/owned/pi-extensions",
  });
  const outcome = await launchPiQuestSession({
    pi: harness.pi,
    ctx: { model: { provider: "openai", id: "gpt-4o" }, cwd: harness.parentCwd },
    options: { env: harness.env, exec: harness.execStub.exec, pathExists: () => true },
    defaultPiBin: "pi",
    prompt: "objective",
    titlePrompt: "Standing: X",
    cwd: harness.targetCwd,
  });
  assert.equal(outcome.ok, true);
  const piArgs = extractPiArgs(harness.execStub.calls.at(-1).args);
  assert.equal(piArgs[0], "env");
  assert.ok(piArgs.includes("PI_COMPANY=software"));
});

test("extraPiArgs are not injected into fork sessions", async () => {
  const harness = createLaunchHarness({
    targetCwd: "/work/repo",
    parentCwd: "/work/repo",
  });
  const outcome = await launchPiQuestSession({
    pi: harness.pi,
    ctx: { model: { provider: "openai", id: "gpt-4o" }, cwd: harness.parentCwd },
    options: { env: harness.env, exec: harness.execStub.exec, pathExists: () => true },
    defaultPiBin: "pi",
    prompt: "objective",
    titlePrompt: "Standing: X",
    cwd: harness.targetCwd,
    sourceSessionFile: "/sessions/parent.jsonl",
    extraPiArgs: ["--system-prompt", "persona bytes"],
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.sessionMode, "fork");
  const piArgs = extractPiArgs(harness.execStub.calls.at(-1).args);
  assert.equal(piArgs.includes("persona bytes"), false);
  assert.ok(piArgs.includes("--fork"));
});

function requestFor(harness, patch = {}, options = {}) {
  return {
    pi: harness.pi,
    ctx: { cwd: "/repo" },
    options: { env: harness.env, exec: harness.execStub.exec, pathExists: () => true, ...options },
    defaultPiBin: "pi",
    prompt: "# SECRET launch prompt",
    titlePrompt: "Standing: fixture",
    cwd: "/repo",
    childProvenanceEnv: {
      PI_PROVENANCE_STANDING_AGENT_VISIBLE_LAUNCH: "standingagent-fixture-abcd1234:ak-5133:agent-x",
    },
    ...patch,
  };
}

test("transport exports exact reviewed standing-agent capability version", () => {
  assert.equal(STANDING_AGENT_TRANSPORT_VERSION, 1);
  assert.equal(STANDING_AGENT_DISPATCH_GUARD_VERSION, 1);
});

test("child environment cannot replace PATH/company or accept malformed provenance entries", async () => {
  for (const childProvenanceEnv of [
    { PATH: "/untrusted" },
    { PI_COMPANY: "holding" },
    { "PI_PROVENANCE_A=B": "SECRET" },
    { PI_PROVENANCE_A: null },
    { PI_PROVENANCE_A: "SECRET\0" },
  ]) {
    const h = createLaunchHarness();
    const result = await launchPiQuestSession(requestFor(h, { childProvenanceEnv }));
    assertRefused(result);
    assert.doesNotMatch(JSON.stringify(result), /SECRET/);
    assert.equal(h.execStub.calls.length, 0);
  }
});

test("every supplied argv value has strict UTF-8/NUL and per-argument/total limits", async () => {
  for (const patch of [
    { prompt: "SECRET\0" },
    { cwd: "SECRET\0" },
    { titlePrompt: "SECRET\ud800" },
    { defaultPiBin: "SECRET\0" },
    { titlePrefix: "SECRET\0" },
    { modelArgs: ["--model", "SECRET\0"] },
    { extraPiArgs: ["--skill", "SECRET\0"] },
    { extraPiArgs: ["--system-prompt", "é".repeat(65536)] },
    { extraPiArgs: Array.from({ length: 5 }, () => "x".repeat(60000)) },
  ]) {
    const h = createLaunchHarness();
    const result = await launchPiQuestSession(requestFor(h, patch));
    assertRefused(result);
    assert.doesNotMatch(JSON.stringify(result), /SECRET/);
    assert.equal(h.execStub.calls.length, 0);
  }
  assert.throws(() => assertBoundedLaunchArgv(["x".repeat(131071)]));
  assert.throws(() => assertBoundedLaunchArgv(Array(1025).fill("")));
  assert.doesNotThrow(() => assertBoundedLaunchArgv(["é".repeat(65000)]));
});

test("final env-derived argv is validated before launcher effects", async () => {
  const h = createLaunchHarness();
  h.env.PI_SIDEQUEST_PI_BIN = "SECRET\0";
  const result = await launchPiQuestSession(requestFor(h));
  assertRefused(result);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  assert.equal(h.execStub.calls.length, 0);
});

test("cancellation checked after asynchronous transport probing and immediately before admission", async () => {
  const h = createLaunchHarness();
  const controller = new AbortController();
  const exec = async (...args) => {
    const result = await h.execStub.exec(...args);
    controller.abort();
    return result;
  };
  const result = await launchPiQuestSession(requestFor(h, { signal: controller.signal }, { exec }));
  assert.equal(result.ok, false);
  assert.equal(result.effectDisposition, "confirmed_no_effects");
  assert.ok(h.execStub.calls.every(({ args }) => args[0] === "+help"));
});

test("launch exec throws remain indeterminate with no automatic retry and no prompt leakage", async () => {
  const h = createLaunchHarness();
  let effects = 0;
  const exec = async (command, args, options) => {
    if (args[0] === "+help") return h.execStub.exec(command, args, options);
    effects++;
    throw Error(`SECRET ${args.join(" ")}`);
  };
  const result = await launchPiQuestSession(requestFor(h, {}, { exec }));
  assert.equal(result.ok, false);
  assert.equal(result.effectDisposition, "effect_indeterminate");
  assert.equal(effects, 1);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});

test("detached transport receives validated complete final argv and both provenances", async () => {
  const h = createLaunchHarness({
    parentCwd: "/home/op/ai-society/softwareco/owned/pi-extensions",
  });
  let captured;
  const detachedGhosttyWindowLaunch = async (request) => {
    captured = request.buildArgs();
    assert.doesNotThrow(() => assertBoundedLaunchArgv([request.command, ...captured]));
    return {
      ok: true,
      effectDisposition: "settled",
      code: 0,
      stdout: "",
      stderr: "",
      killed: false,
    };
  };
  const result = await launchPiQuestSession(
    requestFor(h, { ctx: { cwd: h.parentCwd } }, { detachedGhosttyWindowLaunch }),
  );
  assert.equal(result.ok, true);
  const piArgs = extractPiArgs(captured);
  assert.ok(piArgs.includes("PI_COMPANY=software"));
  assert.ok(piArgs.some((arg) => arg.startsWith("PI_PROVENANCE_STANDING_AGENT_VISIBLE_LAUNCH=")));
});

function assertRefused(result) {
  assert.equal(result.ok, false);
  assert.equal(result.effectDisposition, "confirmed_no_effects");
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function tabHarness({ describe = async () => {}, list = () => {} } = {}) {
  const calls = [];
  const exec = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === "+help") return { code: 0, stdout: "+new-tab\n+new-window" };
    assert.equal(command, "busctl");
    if (args[1] === "list") {
      list();
      return {
        code: 0,
        stdout:
          ":1.99 111 ghostty user :1.99 unit - -\n" +
          "com.mitchellh.ghostty 111 ghostty user :1.99 unit - -\n",
      };
    }
    if (args.includes("Describe")) {
      await describe();
      return { code: 0, stdout: '(bgav) true "(tas)" 0' };
    }
    assert.ok(args.includes("Activate"), `Unexpected command: ${args.join(" ")}`);
    return { code: 0, stdout: "" };
  };
  const env = {
    TERM_PROGRAM: "ghostty",
    GHOSTTY_SURFACE_ID: "1",
    PI_SIDEQUEST_LAUNCH_STAGGER_MS: "1",
  };
  const options = {
    exec,
    env,
    pathExists: () => true,
    currentGhosttyAncestor: { pid: 111, exe: "/usr/bin/ghostty" },
    readProcessExecutable: (pid) => (pid === 111 ? "/usr/bin/ghostty" : undefined),
  };
  return {
    calls,
    effects: () => calls.filter(({ args }) => args.includes("Activate")),
    launch: (patch = {}) =>
      launchPiQuestSession({
        pi: { getThinkingLevel: () => "low" },
        ctx: { cwd: "/repo" },
        options,
        defaultPiBin: "pi",
        cwd: "/repo",
        prompt: "# bounded",
        titlePrompt: "fixture",
        ...patch,
      }),
  };
}

test("oversized candidate constraint returns through the ordinary caller failure branch", async () => {
  const h = createLaunchHarness();
  const worktree = {
    parentCwd: "/parent",
    worktreePath: "/worktree",
    branchName: "candidate/test",
    baseRef: "HEAD",
  };
  const request = { constraints: [`SECRET${"x".repeat(131071)}`] };
  const prompt = buildCandidatePeerSpawnPrompt({
    objective: "Bounded candidate",
    request,
    worktree,
    reportBack: "manual",
    questId: "fixture",
  });
  // Model the unchanged reserve/create/bind -> await launch -> returned-failure projection seam.
  const events = ["reserved", "worktree-created", "bound"];
  const result = await launchPiQuestSession(requestFor(h, { prompt }));
  if (!result.ok) events.push("failure-recorded");
  assert.deepEqual(events, ["reserved", "worktree-created", "bound", "failure-recorded"]);
  assertRefused(result);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  assert.equal(h.execStub.calls.length, 0);
});

test("oversized final shell framing refuses before transport and releases FIFO", async () => {
  const h = tabHarness();
  // cwd is individually legal; shell quoting expands it beyond the per-argument bound.
  const result = await h.launch({ cwd: "'".repeat(30000) });
  assertRefused(result);
  assert.equal(h.effects().length, 0);
  assert.equal((await h.launch()).ok, true);
  assert.equal(h.effects().length, 1);
});

test("lease expiry during Describe refuses dispatch without a fallback, then follower runs", async (t) => {
  let clock = 100;
  t.mock.method(Date, "now", () => clock);
  const entered = deferred(),
    release = deferred();
  let first = true;
  const h = tabHarness({
    describe: async () => {
      if (first) {
        first = false;
        entered.resolve();
        await release.promise;
      }
    },
  });
  const pending = h.launch({ beforeDispatch: async () => true, dispatchDeadlineMs: 150 });
  await entered.promise;
  clock = 200;
  release.resolve();
  assertRefused(await pending);
  assert.equal(h.effects().length, 0);
  assert.equal(
    (await h.launch({ beforeDispatch: async () => true, dispatchDeadlineMs: 300 })).ok,
    true,
  );
  assert.equal(h.effects().length, 1);
});

test("lease expiry while queued cannot reuse pre-queue authorization; follower still runs", async (t) => {
  let clock = 100;
  t.mock.method(Date, "now", () => clock);
  const entered = deferred(),
    release = deferred(),
    secondListed = deferred();
  let lists = 0;
  const h = tabHarness({
    list: () => {
      if (++lists === 3) secondListed.resolve();
    },
  });
  const first = h.launch({
    beforeDispatch: async () => {
      entered.resolve();
      await release.promise;
      return true;
    },
    dispatchDeadlineMs: 1000,
  });
  await entered.promise; // Slot stays held across the final owner read.
  const expired = h.launch({ beforeDispatch: async () => true, dispatchDeadlineMs: 150 });
  await secondListed.promise;
  const follower = h.launch({ beforeDispatch: async () => true, dispatchDeadlineMs: 1000 });
  clock = 200;
  release.resolve();
  assert.equal((await first).ok, true);
  assertRefused(await expired);
  assert.equal((await follower).ok, true);
  assert.equal(h.effects().length, 2);
});

test("guard runs after final identity read and synchronous deadline catches expiry inside guard", async (t) => {
  let clock = 100;
  t.mock.method(Date, "now", () => clock);
  const h = tabHarness();
  const result = await h.launch({
    beforeDispatch: async () => {
      assert.equal(h.calls.at(-1).args[1], "list");
      assert.equal(h.calls.filter(({ args }) => args.includes("Describe")).length, 1);
      clock = 200;
      return true; // A stale successful async read cannot override the original deadline.
    },
    dispatchDeadlineMs: 150,
  });
  assertRefused(result);
  assert.equal(h.effects().length, 0);
});

test("guard refusal, throwing guard and cancellation release slot without leaking or invoking", async () => {
  const h = tabHarness();
  for (const action of ["deny", "throw", "cancel"]) {
    const controller = new AbortController();
    const result = await h.launch({
      dispatchDeadlineMs: Date.now() + 60000,
      signal: controller.signal,
      beforeDispatch: async () => {
        if (action === "throw") throw Error("SECRET owner failure");
        if (action === "cancel") controller.abort();
        return action !== "deny";
      },
    });
    assertRefused(result);
    assert.doesNotMatch(JSON.stringify(result), /SECRET/);
    assert.equal(h.effects().length, 0);
  }
  assert.equal((await h.launch()).ok, true);
  assert.equal(h.effects().length, 1);
});

test("guarded detached invocation throws remain indeterminate, never reclassified as refusal", async () => {
  const h = createLaunchHarness();
  let attempts = 0;
  const result = await launchPiQuestSession(
    requestFor(
      h,
      {
        beforeDispatch: async () => true,
        dispatchDeadlineMs: Date.now() + 60000,
      },
      {
        detachedGhosttyWindowLaunch: () => {
          attempts++;
          throw Error("SECRET after invocation");
        },
      },
    ),
  );
  assert.equal(result.ok, false);
  assert.equal(result.effectDisposition, "effect_indeterminate");
  assert.equal(attempts, 1);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});

test("guard and finite deadline must be supplied together; malformed guard refuses without exec", async () => {
  for (const patch of [
    { beforeDispatch: async () => true },
    { dispatchDeadlineMs: Date.now() + 60000 },
    { beforeDispatch: true, dispatchDeadlineMs: Date.now() + 60000 },
    { beforeDispatch: async () => true, dispatchDeadlineMs: NaN },
  ]) {
    const h = createLaunchHarness();
    assertRefused(await launchPiQuestSession(requestFor(h, patch)));
    assert.equal(h.execStub.calls.length, 0);
  }
});
