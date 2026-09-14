// summary: all Phase-3 gates, admission races, immutable inputs and conservative observation; injected launch only.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { launchPiQuestSession as launchSharedTransport } from "../../pi-little-helpers/extensions/sidequestLaunch.ts";
import { registerStandingAgentSpawnTool } from "../extensions/standing-agent-spawn.ts";
import { sha256Hex } from "../src/dispatch-receipt.ts";
import { reserveVisibleLaunchPair } from "../src/visible-launch-admission.ts";
import { resolveTrustedVisibleLaunchBootstrap } from "../src/visible-launch-bootstrap.ts";
import {
  composeStandingAgentArgv,
  createStandingAgentRunId,
  redactArgvForReceipt,
  systemPromptWithinArgvBound,
} from "../src/visible-launch-compose.ts";
import {
  readVisibleLaunchReceipt,
  visibleLaunchReceiptFileName,
  writeImmutableVisibleLaunchReceipt,
} from "../src/visible-launch-receipt.ts";
import {
  createVisibleLaunchDispatchGuard,
  hasVisibleLaunchTransportCapability,
} from "../src/visible-launch-transport.ts";
import { PARENT_SESSION, setupWorld, transportResult } from "./visible-launch-fixtures.mjs";

function assertNoEffects(outcome, reason) {
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, reason);
  assert.equal(outcome.spawnAttempted, false);
  assert.equal(outcome.effectDisposition, "confirmed_no_effects");
}
function resourcesExist(world) {
  return world.launches.at(-1).skillDirs.every(existsSync);
}

test("exact task and bounded nonblank strict UTF-8 objective required; no standby", async (t) => {
  const w = await setupWorld(t);
  for (const patch of [
    { agent: " " },
    { agent: "../escape" },
    { task: undefined },
    { task: 0 },
    { task: 1.1 },
    { task: Number.MAX_SAFE_INTEGER + 1 },
    { objective: undefined },
    { objective: " " },
    { objective: 12 },
    { objective: "x\0private" },
    { objective: "\ud800" },
    { objective: "é".repeat(16385) },
    { cwd: "x\0" },
    { cwd: 2 },
    { reportBack: "invalid" },
    { parentPeerTarget: {} },
  ]) {
    assertNoEffects(await w.run(patch), "invalid_request");
  }
  assert.equal(w.calls.length, 0);
});

test("intercom requires exact controller target; manual/none still require objectives", async (t) => {
  const w = await setupWorld(t);
  for (const parentPeerTarget of [undefined, "controller", "session-nope"]) {
    assertNoEffects(await w.run({ parentPeerTarget }), "invalid_parent_peer_target");
  }
  const outcome = await w.run({ reportBack: "none", parentPeerTarget: undefined });
  assert.equal(outcome.ok, true);
  assert.match(w.calls[0].prompt, /No intercom boot ACK/);
  assert.doesNotMatch(w.calls[0].prompt, /Stand by visibly/);
});

test("child markers forbid recursive launch", async (t) => {
  const w = await setupWorld(t);
  for (const name of [
    "PI_PROVENANCE_STANDING_AGENT_VISIBLE_LAUNCH",
    "PI_PROVENANCE_STANDING_AGENT_DISPATCH",
  ]) {
    const previous = process.env[name];
    process.env[name] = "fixture";
    try {
      assertNoEffects(await w.run(), "recursive_launch");
    } finally {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
  }
});

test("unavailable transport, unknown agents and mutation tools fail closed", async (t) => {
  const w = await setupWorld(t);
  assertNoEffects(await w.run({}, { transport: null }), "visible_transport_unavailable");
  assertNoEffects(await w.run({ agent: "agent-missing" }), "unknown_agent");
  for (const tools of [[], ["read", "edit"], ["write"]]) {
    w.registry.get(w.agentName).tools = tools;
    assertNoEffects(await w.run(), "agent_not_read_only");
  }
});

test("exact-task origin/claim/lease gates reuse read-only AK task reads", async (t) => {
  const w = await setupWorld(t);
  for (const [patch, reason] of [
    [{ repo: w.agentRoot }, "task_repo_mismatch"],
    [{ status: "done" }, "task_not_claimed"],
    [{ claimed_by: null }, "task_not_claimed"],
    [{ lease_expires_at: null }, "task_lease_expired"],
    [{ lease_expires_at: "2000-01-01" }, "task_lease_expired"],
    [{ lease_expires_at: "bad" }, "task_lease_expired"],
    [{ id: 10 }, "task_not_found"],
  ]) {
    w.patchTask(patch);
    assertNoEffects(await w.run(), reason);
  }
  writeFileSync(w.taskFile, "not json");
  assertNoEffects(await w.run(), "ak_unavailable");
  w.patchTask({});
  assertNoEffects(await w.run({}, {}, { cwd: w.scratch }), "parent_repo_unobservable");
  assertNoEffects(await w.run({ cwd: w.agentRoot }), "task_repo_mismatch");
  assertNoEffects(await w.run({}, { akBinary: join(w.scratch, "missing-ak") }), "ak_unavailable");
  assert.equal(w.calls.length, 0);
  assert.ok(
    readFileSync(w.akCalls, "utf8")
      .trim()
      .split("\n")
      .every((line) => JSON.parse(line)[0] === "task"),
  );
});

test("manifest extensions and unavailable trusted/provider bootstrap reject without ambient fallback", async (t) => {
  const w = await setupWorld(t);
  assertNoEffects(
    await w.run({}, { resolveTrustedBootstrap: async () => undefined }),
    "bootstrap_unavailable",
  );
  assert.equal(resourcesExist(w), false);
  assertNoEffects(
    await w.run(
      {},
      {
        resolveTrustedBootstrap: async () => {
          throw Error("private");
        },
      },
    ),
    "bootstrap_unavailable",
  );
  assertNoEffects(await w.run({}, {}, { model: undefined }), "bootstrap_unavailable");
  w.registry.get(w.agentName).extensions = ["./unapproved.ts"];
  assertNoEffects(await w.run(), "manifest_extensions_unapproved");
});

test("dirty agent and stale cache against a new clean committed manifest fail closed", async (t) => {
  const w = await setupWorld(t);
  w.patchManifest({ display_name: "Changed after cache creation" });
  assertNoEffects(await w.run(), "agent_repo_drift");
  writeFileSync(join(w.agentRoot, "dirty.txt"), "dirty");
  assertNoEffects(await w.run(), "agent_repo_dirty");
});

test("normalized manifest comparison includes root and composed persona scope", async (t) => {
  const w = await setupWorld(t);
  const manifest = w.registry.get(w.agentName);
  manifest.root += "/.";
  assertNoEffects(await w.run(), "agent_repo_drift");
});

test("exact worktree persona check catches hidden Git assume-unchanged drift", async (t) => {
  const w = await setupWorld(t);
  const path = w.registry.get(w.agentName).system_prompt_file;
  execFileSync("git", ["-C", w.agentRoot, "update-index", "--assume-unchanged", path]);
  writeFileSync(join(w.agentRoot, path), "different persona\n");
  assert.equal(
    execFileSync("git", ["-C", w.agentRoot, "status", "--porcelain"], { encoding: "utf8" }),
    "",
  );
  assertNoEffects(await w.run(), "agent_repo_drift");
});

test("resolved prompt cannot differ even when worktree is restored before observation", async (t) => {
  const w = await setupWorld(t),
    resolve = w.registry.resolve;
  w.registry.resolve = async (name) => ({
    ...(await resolve(name)),
    systemPrompt: "uncommitted prompt SECRET",
  });
  assertNoEffects(await w.run(), "agent_repo_drift");
  assert.equal(resourcesExist(w), false);
});

test("resolution throws are redacted", async (t) => {
  const w = await setupWorld(t);
  w.registry.resolve = async () => {
    throw Error("SECRET persona");
  };
  const result = await w.run();
  assertNoEffects(result, "agent_resolution_failed");
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});

test("immediate pre-transport finish aborts drift introduced during bootstrap verification", async (t) => {
  const w = await setupWorld(t);
  w.bootstrap.verify = async () => {
    writeFileSync(join(w.agentRoot, "drift.txt"), "drift");
    return true;
  };
  const result = await w.run();
  assertNoEffects(result, "agent_repo_drift");
  assert.ok(result.runId);
  assert.equal(w.calls.length, 0);
  assert.equal(resourcesExist(w), false);
});

test("task snapshot is re-read before admission; a changed claim does not launch", async (t) => {
  const w = await setupWorld(t),
    resolve = w.registry.resolve;
  w.registry.resolve = async (name) => {
    const launch = await resolve(name);
    w.patchTask({ claimed_by: "changed-owner" });
    return launch;
  };
  assertNoEffects(await w.run(), "ak_unavailable");
  assert.equal(w.calls.length, 0);
});

test("transport admission binds source/composed hashes and task, never ACK/completion evidence", async (t) => {
  const w = await setupWorld(t),
    controller = new AbortController();
  const result = await w.run({}, {}, {}, controller.signal);
  assert.equal(result.ok, true);
  assert.equal(result.admission, "transport_admitted");
  const request = w.calls[0],
    receipt = result.receipt;
  assert.equal(request.cwd, w.parentRoot);
  assert.equal(request.signal, controller.signal);
  assert.equal(request.skipCompanyProvenance, undefined);
  assert.equal(
    request.childProvenanceEnv.PI_PROVENANCE_STANDING_AGENT_VISIBLE_LAUNCH,
    `${result.runId}:ak-5133:${w.agentName}`,
  );
  assert.deepEqual(request.modelArgs, [
    "--model",
    "anthropic/fixture-model",
    "--thinking",
    "medium",
  ]);
  assert.deepEqual(redactArgvForReceipt(request.extraPiArgs), [
    "--offline",
    "--no-extensions",
    "--no-skills",
    "--no-prompt-templates",
    "--system-prompt",
    "--tools",
    "--extension",
    "--extension",
    "--skill",
  ]);
  assert.equal(request.extraPiArgs.includes("--no-context-files"), false);
  assert.equal(request.sourceSessionFile, undefined);
  assert.match(request.prompt, /Exact AK-5133 bounded read-only objective/);
  assert.match(request.prompt, new RegExp(`PEER_ACK peer_run_id=${result.runId}`));
  assert.ok(request.prompt.includes(`to: "${PARENT_SESSION}"`));
  assert.match(request.prompt, /No file changes, AK mutations/);
  const systemPrompt = request.extraPiArgs[request.extraPiArgs.indexOf("--system-prompt") + 1];
  assert.equal(receipt.agent.composedSystemPromptSha256, sha256Hex(systemPrompt));
  for (const digest of [
    receipt.agent.manifestSha256,
    receipt.agent.systemPromptSha256,
    receipt.launch.composedArgvSha256,
    receipt.launch.promptSha256,
  ])
    assert.match(digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(receipt.task, w.task);
  assert.equal(receipt.launch.ack, "unproven");
  assert.equal(receipt.launch.sessionStarted, "unproven");
  assert.equal(receipt.launch.taskCompletion, "unproven");
  assert.equal(receipt.observation.agentRevisionStable, true);
  assert.match(receipt.observation.boundary, /not lifetime read-only proof/);
  assert.equal(statSync(result.receiptPath).mode & 0o777, 0o400);
  assert.equal(
    (await readVisibleLaunchReceipt(result.receiptPath)).receiptSha256,
    receipt.receiptSha256,
  );
  assert.equal(resourcesExist(w), true);
  assert.equal(readFileSync(w.akCalls, "utf8").trim().split("\n").length, 2);
});

test("simultaneous pair requests admit at most one and persistent reservation blocks every later retry", async (t) => {
  const w = await setupWorld(t);
  const results = await Promise.all([w.run(), w.run(), w.run()]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(w.calls.length, 1);
  const admitted = results.find((r) => r.ok);
  for (const result of results.filter((r) => !r.ok)) {
    assertNoEffects(result, "launch_already_reserved");
    // An in-progress writer may have an incomplete reservation; still fail closed.
    if (result.runId) assert.equal(result.runId, admitted.runId);
  }
  const retry = await w.run({
    objective: "Different objective cannot bypass the pair reservation.",
  });
  assertNoEffects(retry, "launch_already_reserved");
  assert.equal(retry.runId, admitted.runId);
  assert.equal(w.calls.length, 1);
});

test("unresolved/corrupt reservations fail closed; blocked storage prevents transport", async (t) => {
  const w = await setupWorld(t);
  await mkdir(w.receiptsDir);
  writeFileSync(join(w.receiptsDir, `pair-${w.agentName}.ak-5133.reservation.json`), "partial");
  assertNoEffects(await w.run(), "launch_already_reserved");
  const blocked = join(w.scratch, "blocked");
  writeFileSync(blocked, "file");
  assertNoEffects(await w.run({}, { receiptsDir: blocked }), "reservation_failed");
  assert.equal(w.calls.length, 0);
});

test("confirmed-no-effects failure cleans skills but does not authorize automatic retry", async (t) => {
  const w = await setupWorld(t);
  const transport = {
    launchPiQuestSession: async (r) =>
      transportResult(r, {
        ok: false,
        effectDisposition: "confirmed_no_effects",
        failure: r.prompt,
      }),
  };
  const result = await w.run({}, { transport });
  assert.equal(result.reason, "launch_failed");
  assert.equal(result.effectDisposition, "confirmed_no_effects");
  assert.equal(result.spawnAttempted, true);
  assert.equal(result.receipt.launch.admission, "not_admitted");
  assert.equal(resourcesExist(w), false);
  assertNoEffects(await w.run(), "launch_already_reserved");
});

test("transport throws retain attempt receipt and possible-child skills without leaking prompts", async (t) => {
  const w = await setupWorld(t);
  let attempts = 0;
  const transport = {
    launchPiQuestSession: async (r) => {
      attempts++;
      throw Error(`SECRET ${r.prompt} ${r.extraPiArgs.join(" ")}`);
    },
  };
  const result = await w.run({}, { transport });
  assert.equal(result.reason, "launch_indeterminate");
  assert.equal(result.effectDisposition, "effect_indeterminate");
  assert.equal(result.spawnAttempted, true);
  assert.ok(result.runId && result.receiptPath);
  assert.equal(result.receipt.launch.admission, "unproven");
  assert.equal(resourcesExist(w), true);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  assertNoEffects(await w.run({}, { transport }), "launch_already_reserved");
  assert.equal(attempts, 1);
});

for (const surface of ["agent", "origin", "bootstrap"]) {
  test(`post-transport ${surface} drift is unproven, never a false clean launch`, async (t) => {
    const w = await setupWorld(t);
    const transport = {
      launchPiQuestSession: async (r) => {
        if (surface === "bootstrap") w.bootstrap.verify = async () => false;
        else
          writeFileSync(
            join(surface === "agent" ? w.agentRoot : w.parentRoot, "drift.txt"),
            "drift",
          );
        return transportResult(r);
      },
    };
    const result = await w.run({}, { transport });
    assert.equal(result.reason, "launch_indeterminate");
    assert.equal(result.effectDisposition, "effect_indeterminate");
    assert.equal(result.receipt.transport.effectDisposition, "settled");
    assert.equal(result.receipt.launch.admission, "transport_admitted");
    assert.equal(resourcesExist(w), true);
  });
}

test("receipt publication failure preserves settled transport disposition and supervision run", async (t) => {
  const w = await setupWorld(t);
  const result = await w.run(
    {},
    {
      writeReceipt: async () => {
        throw Error("SECRET");
      },
    },
  );
  assert.equal(result.reason, "receipt_write_failed");
  assert.equal(result.effectDisposition, "settled");
  assert.equal(result.spawnAttempted, true);
  assert.ok(result.runId);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  assert.equal(resourcesExist(w), true);
  assertNoEffects(await w.run(), "launch_already_reserved");
});

test("cancellation before work, during resolution and immediately pre-transport cleans skills", async (t) => {
  const w = await setupWorld(t);
  const early = new AbortController();
  early.abort();
  assertNoEffects(await w.run({}, {}, {}, early.signal), "cancelled");
  const mid = new AbortController(),
    resolve = w.registry.resolve;
  w.registry.resolve = async (name) => {
    const launch = await resolve(name);
    mid.abort();
    return launch;
  };
  assertNoEffects(await w.run({}, {}, {}, mid.signal), "cancelled");
  assert.equal(resourcesExist(w), false);
  w.registry.resolve = resolve;
  const late = new AbortController();
  w.bootstrap.verify = async () => {
    late.abort();
    return true;
  };
  const result = await w.run({}, {}, {}, late.signal);
  assertNoEffects(result, "cancelled");
  assert.ok(result.runId);
  assert.equal(w.calls.length, 0);
  assert.equal(resourcesExist(w), false);
  assertNoEffects(await w.run(), "launch_already_reserved");
});

test("all composed argv values and combined byte budget fail closed without prompt leakage", async (t) => {
  const w = await setupWorld(t),
    resolve = w.registry.resolve;
  for (const patch of [
    { systemPrompt: "SECRET\0" },
    { systemPrompt: "SECRET\ud800" },
    { model: "anthropic/SECRET\0" },
    { thinking: "SECRET\0" },
    { skillDirs: ["SECRET\0"] },
    { skillDirs: ["é".repeat(65536)] },
    { skillDirs: Array.from({ length: 4 }, () => "é".repeat(32000)) },
  ]) {
    w.registry.resolve = async (name) => ({ ...(await resolve(name)), ...patch });
    const result = await w.run();
    assertNoEffects(result, "invalid_argv");
    assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  }
  assert.equal(w.calls.length, 0);
});

test("capability loader requires exact version; argv redaction never mistakes values for flags", () => {
  const fn = () => {};
  for (const mod of [
    { launchPiQuestSession: fn },
    { STANDING_AGENT_TRANSPORT_VERSION: 0, launchPiQuestSession: fn },
    { STANDING_AGENT_TRANSPORT_VERSION: 2, launchPiQuestSession: fn },
    { STANDING_AGENT_TRANSPORT_VERSION: 1 },
    { STANDING_AGENT_TRANSPORT_VERSION: 1, launchPiQuestSession: fn },
    {
      STANDING_AGENT_TRANSPORT_VERSION: 1,
      STANDING_AGENT_DISPATCH_GUARD_VERSION: 0,
      launchPiQuestSession: fn,
    },
  ]) {
    assert.equal(hasVisibleLaunchTransportCapability(mod), false);
  }
  assert.equal(
    hasVisibleLaunchTransportCapability({
      STANDING_AGENT_TRANSPORT_VERSION: 1,
      STANDING_AGENT_DISPATCH_GUARD_VERSION: 1,
      launchPiQuestSession: fn,
    }),
    true,
  );
  assert.equal(systemPromptWithinArgvBound("x\0"), false);
  assert.equal(systemPromptWithinArgvBound("\ud800"), false);
  assert.equal(systemPromptWithinArgvBound("x".repeat(131071)), false);
  const argv = composeStandingAgentArgv({
    launch: { systemPrompt: "--SECRET", tools: "read", skillDirs: ["--SECRET"] },
    prompt: "# prompt",
    trustedExtensions: ["/trusted/ack"],
  });
  assert.ok(!redactArgvForReceipt(argv.extraPiArgs).includes("--SECRET"));
});

test("receipt filenames/run ids reject traversal before writes and digest detects tampering", async (t) => {
  const w = await setupWorld(t),
    result = await w.run();
  const before = readdirSync(w.receiptsDir);
  for (const agent of ["../escape", "agent/a", "a\0", "A", "x".repeat(65)]) {
    assert.throws(() => visibleLaunchReceiptFileName(agent, "20260907T000000Z", "abcd1234"));
    await assert.rejects(
      writeImmutableVisibleLaunchReceipt(
        { ...result.receipt, agent: { ...result.receipt.agent, name: agent } },
        { dir: w.receiptsDir },
      ),
    );
  }
  await assert.rejects(
    writeImmutableVisibleLaunchReceipt(
      { ...result.receipt, launch: { ...result.receipt.launch, runId: "../escape" } },
      { dir: w.receiptsDir },
    ),
  );
  assert.deepEqual(readdirSync(w.receiptsDir), before);
  chmodSync(result.receiptPath, 0o600);
  writeFileSync(result.receiptPath, JSON.stringify({ ...result.receipt, recordedAt: "forged" }));
  assert.equal(await readVisibleLaunchReceipt(result.receiptPath), undefined);
  await assert.rejects(
    reserveVisibleLaunchPair(
      {
        agent: "../escape",
        task: 1,
        runId: createStandingAgentRunId(),
        requestSha256: "a".repeat(64),
      },
      w.receiptsDir,
    ),
  );
});

test("production bootstrap resolves approved installed local manifests, rejects arbitrary/filtered sources and aliases", async (t) => {
  const w = await setupWorld(t);
  const home = join(w.scratch, "pi-home");
  await mkdir(home);
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = home;
  t.after(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  });
  const roots = [];
  for (const [name, entry] of [
    ["@tryinget/pi-peer-messaging", "intercom.ts"],
    ["@tryinget/pi-little-helpers", "session-presence.ts"],
  ]) {
    const root = join(home, name.split("/")[1]);
    await mkdir(join(root, "extensions"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name, pi: { extensions: [`./extensions/${entry}`] } }),
    );
    writeFileSync(join(root, "extensions", entry), "export default function () {}\n");
    roots.push(root);
  }
  const settings = (packages) =>
    writeFileSync(join(home, "settings.json"), JSON.stringify({ packages }));
  settings(roots);
  const bootstrap = await resolveTrustedVisibleLaunchBootstrap("anthropic/model");
  assert.equal(bootstrap.extensions.length, 2);
  assert.equal(await bootstrap.verify(), true);
  assert.equal((await resolveTrustedVisibleLaunchBootstrap("zai/glm-5.3"))?.extensions.length, 2);
  assert.equal(await resolveTrustedVisibleLaunchBootstrap("zai-1/glm-5.3"), undefined);
  assert.equal(await resolveTrustedVisibleLaunchBootstrap("anthropic-1/model"), undefined);
  assert.equal(await resolveTrustedVisibleLaunchBootstrap("unknown/model"), undefined);
  writeFileSync(bootstrap.extensions[0], "changed");
  assert.equal(await bootstrap.verify(), false);
  settings([{ source: roots[0], extensions: [] }, roots[1]]);
  assert.equal(await resolveTrustedVisibleLaunchBootstrap("anthropic/model"), undefined);
  settings(["/arbitrary/missing/entry.ts", roots[1]]);
  assert.equal(await resolveTrustedVisibleLaunchBootstrap("anthropic/model"), undefined);
});

test("tool schema requires task/objective and passes cancellation without launching", async (t) => {
  const w = await setupWorld(t);
  let tool;
  registerStandingAgentSpawnTool({
    pi: {
      registerTool: (definition) => {
        tool = definition;
      },
    },
    getRegistry: async () => w.registry,
  });
  assert.ok(tool.parameters.required.includes("task"));
  assert.ok(tool.parameters.required.includes("objective"));
  assert.equal(tool.parameters.properties.task.type, "integer");
  const controller = new AbortController();
  controller.abort();
  const result = await tool.execute(
    "fixture",
    { agent: w.agentName, task: 5133, objective: "Read README and stop", reportBack: "manual" },
    controller.signal,
    undefined,
    { cwd: w.cwd },
  );
  assert.equal(result.details.reason, "cancelled");
  assert.equal(result.details.spawnAttempted, false);
});

test("malformed/contradictory transport returns cannot prove no effects or session startup", async (t) => {
  const w = await setupWorld(t);
  for (const [index, override] of [
    undefined,
    { ok: true, effectDisposition: "confirmed_no_effects" },
    { ok: false, effectDisposition: "settled" },
    { ok: true, effectDisposition: "unexpected" },
  ].entries()) {
    const result = await w.run(
      {},
      {
        receiptsDir: join(w.scratch, `receipts-${index}`),
        transport: {
          launchPiQuestSession: async (r) => (override ? transportResult(r, override) : undefined),
        },
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.effectDisposition, "effect_indeterminate");
    assert.equal(result.receipt.launch.admission, "unproven");
    assert.equal(resourcesExist(w), true);
  }
});

function guardedSharedTransport(onDescribe = async () => {}) {
  const calls = [];
  return {
    calls,
    transport: {
      launchPiQuestSession: (request) =>
        launchSharedTransport({
          ...request,
          pi: { getThinkingLevel: () => "low" },
          options: {
            env: {
              TERM_PROGRAM: "ghostty",
              GHOSTTY_SURFACE_ID: "1",
              PI_SIDEQUEST_LAUNCH_STAGGER_MS: "1",
            },
            pathExists: () => true,
            currentGhosttyAncestor: { pid: 111, exe: "/usr/bin/ghostty" },
            readProcessExecutable: (pid) => (pid === 111 ? "/usr/bin/ghostty" : undefined),
            exec: async (command, args) => {
              calls.push({ command, args });
              if (args[0] === "+help") return { code: 0, stdout: "+new-tab\n+new-window" };
              assert.equal(command, "busctl");
              if (args[1] === "list")
                return {
                  code: 0,
                  stdout:
                    ":1.99 111 ghostty user :1.99 unit - -\ncom.mitchellh.ghostty 111 ghostty user :1.99 unit - -\n",
                };
              if (args.includes("Describe")) {
                await onDescribe();
                return { code: 0, stdout: '(bgav) true "(tas)" 0' };
              }
              assert.ok(args.includes("Activate"));
              return { code: 0, stdout: "" };
            },
          },
        }),
    },
  };
}

test("real shared seam rereads task after Describe; changed owner returns a retained not-admitted receipt", async (t) => {
  const w = await setupWorld(t);
  const h = guardedSharedTransport(async () => {
    w.patchTask({ claimed_by: "different-owner" });
  });
  const result = await w.run({}, { transport: h.transport });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "launch_failed");
  assert.equal(result.effectDisposition, "confirmed_no_effects");
  assert.equal(result.spawnAttempted, true); // Pipeline entered transport; session dispatch did not occur.
  assert.equal(result.receipt.launch.admission, "not_admitted");
  assert.equal(result.receipt.launch.ack, "unproven");
  assert.equal(resourcesExist(w), false);
  assert.equal(h.calls.filter(({ args }) => args.includes("Activate")).length, 0);
  assert.equal(readFileSync(w.akCalls, "utf8").trim().split("\n").length, 3);
  w.patchTask({});
  assertNoEffects(await w.run({}, { transport: h.transport }), "launch_already_reserved");
});

test("real shared seam refuses lease expiry during identity wait and preserves reservation", async (t) => {
  const w = await setupWorld(t);
  let clock = Date.now();
  t.mock.method(Date, "now", () => clock);
  const expiry = clock + 60000;
  w.task.lease_expires_at = new Date(expiry).toISOString();
  w.patchTask({});
  const h = guardedSharedTransport(async () => {
    clock = expiry;
  });
  const result = await w.run({}, { transport: h.transport });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "launch_failed");
  assert.equal(result.effectDisposition, "confirmed_no_effects");
  assert.equal(result.receipt.launch.admission, "not_admitted");
  assert.equal(resourcesExist(w), false);
  assert.equal(h.calls.filter(({ args }) => args.includes("Activate")).length, 0);
  clock = expiry - 1;
  assertNoEffects(await w.run({}, { transport: h.transport }), "launch_already_reserved");
});

test("real shared seam checks unchanged task a third time and invokes once after authorization", async (t) => {
  const w = await setupWorld(t);
  const h = guardedSharedTransport();
  const result = await w.run({}, { transport: h.transport });
  assert.equal(result.ok, true);
  assert.equal(h.calls.filter(({ args }) => args.includes("Activate")).length, 1);
  assert.equal(readFileSync(w.akCalls, "utf8").trim().split("\n").length, 3);
  assert.equal(result.receipt.launch.ack, "unproven");
});

test("final owner guard rejects expired, changed, unreadable and malformed task snapshots privately", async (t) => {
  const w = await setupWorld(t);
  const guard = createVisibleLaunchDispatchGuard(w.task, w.parentRoot, w.akBinary);
  assert.equal(guard.dispatchDeadlineMs, Date.parse(w.task.lease_expires_at));
  assert.equal(await guard.beforeDispatch(), true);
  for (const patch of [
    { status: "done" },
    { claimed_by: "different-owner" },
    { repo: w.agentRoot },
    { lease_expires_at: "2000-01-01T00:00:00Z" },
    { lease_expires_at: "invalid" },
  ]) {
    w.patchTask(patch);
    assert.equal(await guard.beforeDispatch(), false);
  }
  writeFileSync(w.taskFile, "SECRET invalid JSON");
  assert.equal(await guard.beforeDispatch(), false);
  const missing = createVisibleLaunchDispatchGuard(
    w.task,
    w.parentRoot,
    join(w.scratch, "missing-ak"),
  );
  assert.equal(await missing.beforeDispatch(), false);
});
