import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  buildCandidatePeerCleanupPacket,
  getCandidatePeerSpawnHoldPath,
} from "../src/candidatePeerRegistry.ts";
import {
  createContext,
  extractPiArgs,
  extractShellCommand,
  registerExtension,
} from "./sidequest-harness.mjs";

function createCandidatePeerExecStub({ repoRoot = "/repo", dirty = "" } = {}) {
  const calls = [];

  return {
    calls,
    exec: async (command, args, options = {}) => {
      calls.push({ command, args, options });

      if (command === "git") {
        const gitArgs = args.slice(2);
        if (gitArgs.join(" ") === "rev-parse --show-toplevel") {
          return { code: 0, stdout: `${repoRoot}\n` };
        }
        if (gitArgs.join(" ") === "status --porcelain") {
          return { code: 0, stdout: dirty };
        }
        if (gitArgs[0] === "worktree" && gitArgs[1] === "add") {
          return { code: 0, stdout: "Preparing worktree" };
        }
      }

      if (command === "/usr/bin/ghostty" && args[0] === "+help") {
        return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
      }
      if (command === "/usr/bin/ghostty" && args[0] === "+version") {
        return { code: 0, stdout: "Ghostty 1.4.0\n" };
      }
      if (command === "/usr/bin/ghostty" && args[0] === "+new-tab") {
        return { code: 0, stdout: "" };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    },
  };
}

function withTempDir(fn) {
  const dir = mkdtempSync(`${tmpdir()}/pi-candidatepeer-test-`);
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => rmSync(dir, { recursive: true, force: true }));
}

test("candidate_peer_spawn staggers concurrent Ghostty launches", async () => {
  await withTempDir(async (stateHome) => {
    const baseExecStub = createCandidatePeerExecStub();
    const launchTimes = [];
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        PI_SIDEQUEST_PI_BIN: "pi",
        PI_SIDEQUEST_LAUNCH_STAGGER_MS: "30",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec(command, args, options) {
        if (command === "/usr/bin/ghostty" && args[0] === "+new-tab") {
          launchTimes.push(Date.now());
        }
        return baseExecStub.exec(command, args, options);
      },
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { tools } = registerExtension(extension);
    const candidatePeerSpawn = tools.get("candidate_peer_spawn");
    const context = createContext({ cwd: "/repo" }).ctx;

    const [first, second] = await Promise.all([
      candidatePeerSpawn.execute(
        "tool-call-1",
        {
          objective: "try candidate one",
          cwd: "/repo",
          parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
          branchName: "candidatepeer/stagger-one",
          workspaceName: "stagger-one",
        },
        undefined,
        undefined,
        context,
      ),
      candidatePeerSpawn.execute(
        "tool-call-2",
        {
          objective: "try candidate two",
          cwd: "/repo",
          parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
          branchName: "candidatepeer/stagger-two",
          workspaceName: "stagger-two",
        },
        undefined,
        undefined,
        context,
      ),
    ]);

    assert.equal(first.details.ok, true);
    assert.equal(second.details.ok, true);
    assert.equal(launchTimes.length, 2);
    assert.ok(
      launchTimes[1] - launchTimes[0] >= 20,
      `expected staggered launches, got ${launchTimes.join(", ")}`,
    );
  });
});

test("/parallelquest launches a human candidate peer worktree", async () => {
  await withTempDir(async (stateHome) => {
    const execStub = createCandidatePeerExecStub();
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        GHOSTTY_SURFACE_ID: "22",
        PI_SIDEQUEST_PI_BIN: "pi",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { commands } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });

    await commands.get("parallelquest").handler("Try a workspace candidate", harness.ctx);

    const worktreeCall = execStub.calls.find(
      (call) => call.command === "git" && call.args.includes("worktree"),
    );
    assert.ok(worktreeCall);
    assert.deepEqual(worktreeCall.args.slice(5), [
      "-b",
      "candidatepeer/try-a-workspace-candidate",
      "HEAD",
    ]);

    const launchCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args[0] === "+new-tab",
    );
    assert.ok(launchCall);
    assert.match(
      extractShellCommand(launchCall.args),
      /PI_SESSION_PRESENCE_TITLE_BASE='Parallelquest: Try a workspace candidate'/,
    );
    assert.match(harness.notifications.at(-1)?.message ?? "", /Opened parallelquest/);
  });
});

test("candidate spawn hold blocks both /parallelquest and candidate_peer_spawn before git", async () => {
  await withTempDir(async (stateHome) => {
    const env = {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
      XDG_STATE_HOME: stateHome,
    };
    const holdPath = getCandidatePeerSpawnHoldPath(env);
    mkdirSync(`${stateHome}/pi-quests`, { recursive: true });
    writeFileSync(
      holdPath,
      `${JSON.stringify({ status: "active", decision: 59, reason: "registry backlog" })}\n`,
    );
    const execStub = createCandidatePeerExecStub();
    const extension = createSidequestExtension({
      registerTools: true,
      env,
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty" || path === holdPath;
      },
    });
    const { commands, tools } = registerExtension(extension);
    const harness = createContext({ cwd: "/repo" });

    await commands.get("parallelquest").handler("Try another candidate", harness.ctx);
    const toolResult = await tools
      .get("candidate_peer_spawn")
      .execute(
        "tool-call-spawn-hold",
        { objective: "Try another candidate" },
        undefined,
        undefined,
        harness.ctx,
      );

    assert.match(harness.notifications.at(-1)?.message ?? "", /lifecycle backlog hold/);
    assert.equal(toolResult.details.ok, false);
    assert.equal(toolResult.details.error, "candidate_spawn_hold_active");
    assert.equal(toolResult.details.spawnHoldPath, holdPath);
    assert.equal(
      execStub.calls.some((call) => call.command === "git"),
      false,
    );
  });
});

test("candidate_peer_spawn rejects a blank objective before git or Ghostty", async () => {
  const execStub = createCandidatePeerExecStub();
  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const candidatePeerSpawn = tools.get("candidate_peer_spawn");

  const blankResult = await candidatePeerSpawn.execute(
    "tool-call-1",
    { objective: "  " },
    undefined,
    undefined,
    createContext().ctx,
  );
  assert.equal(blankResult.isError, true);
  assert.equal(blankResult.details.error, "blank_objective");

  assert.equal(execStub.calls.length, 0);
});

test("candidate_peer_spawn reportBack none makes intercom disabled explicit", async () => {
  await withTempDir(async (stateHome) => {
    const execStub = createCandidatePeerExecStub({ dirty: "" });
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        GHOSTTY_SURFACE_ID: "21",
        PI_SIDEQUEST_PI_BIN: "pi",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { tools } = registerExtension(extension, { thinkingLevel: "high" });

    const result = await tools.get("candidate_peer_spawn").execute(
      "tool-call-1",
      {
        objective: "Try manual-only candidate lane",
        cwd: "/repo",
        reportBack: "none",
        branchName: "candidatepeer/manual-only",
      },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

    const launchCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args[0] === "+new-tab",
    );
    assert.ok(launchCall);
    const prompt = extractPiArgs(launchCall.args).at(-1);
    assert.match(prompt, /No intercom boot ACK is required because reportBack is none/);
    assert.match(prompt, /No automatic report-back is requested/);
    assert.doesNotMatch(prompt, /Only allowed pre-ACK tool: `intercom`/);

    assert.equal(result.details.reportBack, "none");
    assert.deepEqual(result.details.expectedMessages, []);
    assert.match(result.details.nextStep, /Intercom report-back is disabled/);
    assert.match(result.details.nextStep, /peer_watch will have nothing to watch/);
    assert.match(result.content[0]?.text ?? "", /Expected intercom messages: none/);
    assert.match(result.content[0]?.text ?? "", /PEER_ACK\/PEER_FINAL disabled/);
    assert.doesNotMatch(result.content[0]?.text ?? "", /peer_watch", peerRunId/);
  });
});

test("candidate_peer_spawn requires exact parentPeerTarget for default intercom report-back", async () => {
  const execStub = createCandidatePeerExecStub();
  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const result = await tools
    .get("candidate_peer_spawn")
    .execute(
      "tool-call-1",
      { objective: "try without orphaning" },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

  assert.equal(execStub.calls.length, 0);
  assert.equal(result.isError, true);
  assert.equal(result.details.error, "missing_parent_peer_target");
});

test("candidate_peer_spawn rejects ambiguous parentPeerTarget aliases before git or launch", async () => {
  const execStub = createCandidatePeerExecStub();
  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const result = await tools
    .get("candidate_peer_spawn")
    .execute(
      "tool-call-1",
      { objective: "try without orphaning", parentPeerTarget: "current" },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

  assert.equal(execStub.calls.length, 0);
  assert.equal(result.isError, true);
  assert.equal(result.details.error, "invalid_parent_peer_target");
  assert.equal(result.details.reason, "ambiguous_parent_peer_target");
  assert.equal(result.details.parentPeerTarget, "current");
});

test("candidate_peer_spawn rejects non-session-id parentPeerTarget before git or launch", async () => {
  const execStub = createCandidatePeerExecStub();
  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const result = await tools
    .get("candidate_peer_spawn")
    .execute(
      "tool-call-1",
      { objective: "try without orphaning", parentPeerTarget: "steve" },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

  assert.equal(execStub.calls.length, 0);
  assert.equal(result.isError, true);
  assert.equal(result.details.error, "invalid_parent_peer_target");
  assert.equal(result.details.reason, "not_exact_session_id");
  assert.equal(result.details.parentPeerTarget, "steve");
});

test("candidate_peer_spawn fails closed when requireCleanParent sees dirty parent state", async () => {
  await withTempDir(async (stateHome) => {
    const execStub = createCandidatePeerExecStub({ dirty: " M src/file.ts\n" });
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        PI_SIDEQUEST_PI_BIN: "pi",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { tools } = registerExtension(extension);
    const result = await tools.get("candidate_peer_spawn").execute(
      "tool-call-1",
      {
        objective: "try a bounded fix",
        parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
        requireCleanParent: true,
      },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

    assert.equal(result.isError, true);
    assert.equal(result.details.error, "worktree_prepare_failed");
    assert.equal(result.details.parentDirty, true);
    assert.match(result.details.reason, /requireCleanParent/);
    assert.equal(
      execStub.calls.some((call) => call.args.includes("worktree")),
      false,
    );
  });
});

test("candidate_peer_spawn rejects worktree paths inside the parent checkout", async () => {
  const execStub = createCandidatePeerExecStub();
  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { tools } = registerExtension(extension);
  const result = await tools.get("candidate_peer_spawn").execute(
    "tool-call-1",
    {
      objective: "try a bounded fix",
      cwd: "/repo",
      parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
      workspaceRoot: "/repo/tmp-quests",
    },
    undefined,
    undefined,
    createContext({ cwd: "/repo" }).ctx,
  );

  assert.equal(result.isError, true);
  assert.equal(result.details.error, "worktree_prepare_failed");
  assert.match(result.details.reason, /must not be inside the parent checkout/);
});

test("candidate_peer_spawn creates an isolated worktree, launches via shared Ghostty path, and prompts boundaries", async () => {
  await withTempDir(async (stateHome) => {
    const execStub = createCandidatePeerExecStub({ dirty: " M pending-parent-change.ts\n" });
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        GHOSTTY_SURFACE_ID: "21",
        PI_SIDEQUEST_PI_BIN: "pi",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { tools } = registerExtension(extension, { thinkingLevel: "high" });
    const result = await tools.get("candidate_peer_spawn").execute(
      "tool-call-1",
      {
        objective: "Try bounded runner guard",
        cwd: "/repo",
        parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
        branchName: "candidatepeer/Runner Guard!",
        workspaceName: "../Runner Guard Workspace",
        filesInScope: ["src/runner.ts", "tests/runner.test.mjs"],
        offLimits: [".env", "parent checkout"],
        constraints: ["run focused test only"],
        dod: ["Report diff summary"],
      },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

    const worktreeCall = execStub.calls.find(
      (call) => call.command === "git" && call.args.includes("worktree"),
    );
    assert.ok(worktreeCall);
    assert.deepEqual(worktreeCall.args.slice(2, 5), [
      "worktree",
      "add",
      result.details.worktreePath,
    ]);
    assert.deepEqual(worktreeCall.args.slice(5), ["-b", "candidatepeer/runner-guard", "HEAD"]);
    assert.ok(result.details.worktreePath.startsWith(`${stateHome}/pi-quests/worktrees/`));
    assert.ok(result.details.worktreePath.endsWith("/runner-guard-workspace"));

    const launchCall = execStub.calls.find(
      (call) => call.command === "/usr/bin/ghostty" && call.args[0] === "+new-tab",
    );
    assert.ok(launchCall);
    assert.ok(launchCall.args.includes("--surface-id=21"));
    assert.ok(launchCall.args.includes(`--working-directory=${result.details.worktreePath}`));
    assert.match(
      extractShellCommand(launchCall.args),
      /PI_SESSION_PRESENCE_TITLE_BASE='Candidatepeer: Try bounded runner guard'/,
    );

    const piArgs = extractPiArgs(launchCall.args);
    assert.deepEqual(piArgs.slice(0, 5), ["pi", "--model", "openai/gpt-4o", "--thinking", "high"]);
    assert.equal(piArgs.includes("--fork"), false);
    const prompt = piArgs.at(-1);
    assert.match(prompt, /Visible Candidate Peer Prompt/);
    assert.match(prompt, /spawned candidate peer/i);
    assert.match(prompt, /not the controller session/i);
    assert.match(prompt, /## BOOT PROTOCOL \/ FIRST ACTION REQUIRED/);
    assert.match(prompt, /Only allowed pre-ACK tool: `intercom`/);
    assert.match(
      prompt,
      /PEER_ACK peer_run_id=candidatepeer-[^:]+: spawned candidate peer started/,
    );
    assert.match(prompt, /ACK_FAILED/);
    assert.ok(
      prompt.indexOf("## BOOT PROTOCOL / FIRST ACTION REQUIRED") < prompt.indexOf("## Objective"),
    );
    assert.match(prompt, /Parent\/controller cwd: \/repo/);
    assert.match(prompt, new RegExp(`Your worktree cwd: ${result.details.worktreePath}`));
    assert.match(prompt, /Branch: candidatepeer\/runner-guard/);
    assert.match(prompt, /Base: HEAD/);
    assert.match(prompt, /Dirty-parent warning:/);
    assert.match(prompt, /All mutations must stay inside your worktree/);
    assert.match(prompt, /Do not merge, push, open PRs, mutate AK/);
    assert.match(prompt, /- src\/runner\.ts/);
    assert.match(prompt, /- tests\/runner\.test\.mjs/);
    assert.match(prompt, /- \.env/);
    assert.match(prompt, /- parent checkout/);
    assert.match(prompt, /- run focused test only/);
    assert.match(prompt, /Report diff summary/);
    assert.match(
      prompt,
      /Report to the exact parent target: session-019e10d2-15f5-705a-aea4-01ba49d2bbac/,
    );
    assert.match(prompt, /Message budget: at most PEER_ACK and PEER_FINAL/);
    assert.match(prompt, /PEER_ACK peer_run_id=candidatepeer-[^:]+: \.\.\./);
    assert.match(prompt, /PEER_FINAL peer_run_id=candidatepeer-[^:]+: \.\.\./);
    assert.match(prompt, /Do not send both a final report and a separate final DoD report/);
    assert.match(prompt, /After sending `PEER_FINAL`, stop/);
    assert.match(
      prompt,
      /intercom\(\{ action: "send", to: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac", message: "PEER_ACK peer_run_id=candidatepeer-[^:]+: \.\.\." \}\)/,
    );
    assert.doesNotMatch(prompt, /Manual report-back is requested/);
    assert.doesNotMatch(prompt, /visible report in this sidequest session/);
    assert.match(prompt, /Do not spawn more quest agents unless explicitly instructed/);

    assert.equal(result.details.ok, true);
    assert.equal(result.details.tool, "candidate_peer_spawn");
    assert.equal(result.details.launchMode, "tab");
    assert.equal(result.details.parentCwd, "/repo");
    assert.equal(result.details.branchName, "candidatepeer/runner-guard");
    assert.equal(result.details.baseRef, "HEAD");
    assert.equal(result.details.reportBack, "intercom");
    assert.match(result.details.peerRunId, /^candidatepeer-/);
    assert.equal(result.details.questId, result.details.peerRunId);
    assert.deepEqual(result.details.expectedMessages, ["PEER_ACK", "PEER_FINAL"]);
    assert.equal(result.details.parentDirty, true);
    assert.match(result.details.parentDirtyWarning, /uncommitted changes/);
    assert.equal(result.details.reusedExisting, false);
    assert.equal(result.details.sessionMode, "clean");
    assert.equal(result.details.sourceSessionFile, undefined);
    assert.equal(result.details.titleBase, "Candidatepeer: Try bounded runner guard");
    assert.equal(
      result.details.registryPath,
      `${stateHome}/pi-quests/peer-registry/${result.details.peerRunId}.json`,
    );
    assert.equal(
      result.details.archiveDir,
      `${stateHome}/pi-quests/archives/${result.details.peerRunId}`,
    );
    assert.equal(result.details.cleanupPacket.commands[0].id, "archive-metadata-and-diff");
    assert.equal(result.details.cleanupPacket.commands[0].destructive, false);
    assert.match(
      result.details.cleanupPacket.commands[0].args[1],
      /rev-parse --show-toplevel\)" = "\$worktree_path"/,
    );
    assert.match(
      result.details.cleanupPacket.commands[0].args[1],
      /rev-parse --abbrev-ref HEAD\)" = "\$branch_name"/,
    );
    assert.match(
      result.details.cleanupPacket.commands[0].args[1],
      /show-ref --verify --quiet "refs\/heads\/\$branch_name"/,
    );
    assert.match(result.details.cleanupPacket.commands[0].args[1], /untracked\.tar\.gz/);
    assert.match(result.details.cleanupPacket.commands[0].args[1], /ignored\.paths\.z/);
    assert.match(result.details.cleanupPacket.commands[0].args[1], /manifest\.sha256/);
    assert.match(result.details.cleanupPacket.commands[0].args[1], /COMPLETE/);
    assert.equal(result.details.cleanupPacket.commands[1].id, "remove-worktree");
    assert.equal(result.details.cleanupPacket.commands[1].destructive, true);
    assert.equal(result.details.cleanupPacket.commands[2].id, "delete-candidate-branch");
    assert.equal(result.details.cleanupPacket.commands[2].destructive, true);
    assert.ok(existsSync(result.details.registryPath));
    const registry = JSON.parse(readFileSync(result.details.registryPath, "utf8"));
    assert.equal(registry.schemaVersion, 1);
    assert.equal(registry.peerRunId, result.details.peerRunId);
    assert.equal(registry.repoRoot, "/repo");
    assert.equal(registry.worktreePath, result.details.worktreePath);
    assert.equal(registry.branchName, "candidatepeer/runner-guard");
    assert.deepEqual(registry.naming, result.details.naming);
    assert.equal(registry.naming.branchName, "candidatepeer/runner-guard");
    assert.equal(registry.naming.workspaceName, "runner-guard-workspace");
    assert.equal(registry.naming.branchNameClamped, false);
    assert.equal(registry.naming.workspaceNameClamped, false);
    assert.equal(registry.parentPeerTarget, "session-019e10d2-15f5-705a-aea4-01ba49d2bbac");
    assert.deepEqual(registry.filesInScope, ["src/runner.ts", "tests/runner.test.mjs"]);
    assert.equal(registry.launch.status, "launched");
    assert.equal(registry.launch.launchMode, "tab");
    assert.match(
      registry.cleanupPacket.manualPreconditions.join("\n"),
      /Archive commands must complete successfully/,
    );
    assert.match(result.details.nextStep, /registry metadata, cleanup packet/);
    assert.match(result.content[0]?.text ?? "", /Peer run id: candidatepeer-/);
    assert.match(result.content[0]?.text ?? "", /Expected intercom messages: PEER_ACK, PEER_FINAL/);
    assert.match(result.content[0]?.text ?? "", /peer_watch/);
  });
});

test("candidate peer archive preserves untracked bytes and blocks ignored-file loss", async () => {
  await withTempDir(async (stateHome) => {
    const repoRoot = `${stateHome}/repo`;
    const registryPath = `${stateHome}/registry.json`;
    const archiveDir = `${stateHome}/archive`;
    mkdirSync(repoRoot, { recursive: true });
    execFileSync("git", ["init", "-b", "candidatepeer/archive-test", repoRoot]);
    execFileSync("git", ["-C", repoRoot, "config", "user.email", "candidate@example.test"]);
    execFileSync("git", ["-C", repoRoot, "config", "user.name", "Candidate Test"]);
    writeFileSync(`${repoRoot}/tracked.txt`, "tracked\n");
    writeFileSync(`${repoRoot}/.gitignore`, "ignored.tmp\n");
    execFileSync("git", ["-C", repoRoot, "add", "tracked.txt", ".gitignore"]);
    execFileSync("git", ["-C", repoRoot, "commit", "-m", "base"]);
    writeFileSync(registryPath, '{"schemaVersion":1}\n');
    writeFileSync(`${repoRoot}/untracked candidate.txt`, "candidate bytes\n");

    const packet = buildCandidatePeerCleanupPacket({
      peerRunId: "candidatepeer-archive-test",
      repoRoot,
      worktreePath: repoRoot,
      branchName: "candidatepeer/archive-test",
      registryPath,
      archiveDir,
    });
    const archiveCommand = packet.commands[0];
    execFileSync(archiveCommand.command, archiveCommand.args, { cwd: repoRoot });

    assert.equal(existsSync(`${archiveDir}/COMPLETE`), true);
    assert.match(readFileSync(`${archiveDir}/manifest.sha256`, "utf8"), /untracked\.tar\.gz/);
    assert.match(
      execFileSync("tar", ["-tzf", `${archiveDir}/untracked.tar.gz`], {
        encoding: "utf8",
      }),
      /untracked candidate\.txt/,
    );
    const extractDir = `${stateHome}/extract`;
    mkdirSync(extractDir);
    execFileSync("tar", ["-xzf", `${archiveDir}/untracked.tar.gz`, "-C", extractDir]);
    assert.equal(
      readFileSync(`${extractDir}/untracked candidate.txt`, "utf8"),
      "candidate bytes\n",
    );
    assert.equal(statSync(archiveDir).mode & 0o777, 0o700);
    assert.equal(statSync(`${archiveDir}/untracked.tar.gz`).mode & 0o777, 0o600);
    assert.equal(readFileSync(`${archiveDir}/COMPLETE`, "utf8"), "verified-complete\n");

    writeFileSync(`${repoRoot}/ignored.tmp`, "must not be discarded implicitly\n");
    const blockedArchiveDir = `${stateHome}/blocked-archive`;
    const blockedPacket = buildCandidatePeerCleanupPacket({
      peerRunId: "candidatepeer-archive-blocked-test",
      repoRoot,
      worktreePath: repoRoot,
      branchName: "candidatepeer/archive-test",
      registryPath,
      archiveDir: blockedArchiveDir,
    });
    assert.throws(() =>
      execFileSync(blockedPacket.commands[0].command, blockedPacket.commands[0].args, {
        cwd: repoRoot,
        stdio: "pipe",
      }),
    );
    assert.equal(existsSync(blockedArchiveDir), false);
  });
});

test("candidate_peer_cleanup dry-runs and blocks destructive cleanup pending lifecycle v2", async () => {
  await withTempDir(async (stateHome) => {
    const calls = [];
    const baseExecStub = createCandidatePeerExecStub({ dirty: "" });
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        PI_SIDEQUEST_PI_BIN: "pi",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      async exec(command, args, options) {
        calls.push({ command, args, options });
        if (command === "sh") return { code: 0, stdout: "archived" };
        if (command === "git" && args.includes("remove") && args.includes("--force")) {
          return { code: 0, stdout: "removed worktree" };
        }
        if (command === "git" && args.includes("branch") && args.includes("-D")) {
          return { code: 0, stdout: "deleted branch" };
        }
        return baseExecStub.exec(command, args, options);
      },
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { tools } = registerExtension(extension);
    const context = createContext({ cwd: "/repo" }).ctx;
    const spawn = await tools.get("candidate_peer_spawn").execute(
      "tool-call-cleanup-spawn",
      {
        objective: "try cleanup helper",
        cwd: "/repo",
        parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
        branchName: "candidatepeer/cleanup-helper",
        workspaceName: "cleanup-helper",
      },
      undefined,
      undefined,
      context,
    );

    const peerRunId = spawn.details.peerRunId;
    const dryRun = await tools
      .get("candidate_peer_cleanup")
      .execute(
        "tool-call-cleanup-dry-run",
        { peerRunIds: [peerRunId] },
        undefined,
        undefined,
        context,
      );

    assert.equal(dryRun.details.ok, true);
    assert.equal(dryRun.details.execution, "dry_run_plan_only");
    assert.equal(dryRun.details.lanes[0].peerRunId, peerRunId);
    assert.equal(
      dryRun.details.lanes[0].visibleResourceCommands[0].id,
      "terminate-exact-sidequest-process",
    );
    assert.match(
      dryRun.details.lanes[0].visibleResourceCommands[0].args.join("\n"),
      /worktree_path/,
    );
    assert.equal(dryRun.details.commandResults.length, 0);

    const blocked = await tools
      .get("candidate_peer_cleanup")
      .execute(
        "tool-call-cleanup-blocked",
        { peerRunIds: [peerRunId], execute: true, integrationCloseoutStatus: "missing" },
        undefined,
        undefined,
        context,
      );
    assert.equal(blocked.details.ok, false);
    assert.equal(blocked.details.execution, "blocked_missing_successful_integration_closeout");

    const callCountBeforeBlockedExecute = calls.length;
    const executed = await tools.get("candidate_peer_cleanup").execute(
      "tool-call-cleanup-v2-blocked",
      {
        peerRunIds: [peerRunId],
        execute: true,
        closeVisibleResources: true,
        integrationCloseoutStatus: "successful",
      },
      undefined,
      undefined,
      context,
    );

    assert.equal(executed.details.ok, false);
    assert.equal(executed.details.execution, "blocked_candidate_lifecycle_v2_required");
    assert.equal(executed.details.decisionRef, "AK decision 59");
    assert.equal(calls.length, callCountBeforeBlockedExecute);
  });
});

test("candidate_peer_cleanup blocks reused worktrees with multiple registry aliases", async () => {
  await withTempDir(async (stateHome) => {
    const execStub = createCandidatePeerExecStub({ dirty: "" });
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        PI_SIDEQUEST_PI_BIN: "pi",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { tools } = registerExtension(extension);
    const context = createContext({ cwd: "/repo" }).ctx;
    const spawn = await tools.get("candidate_peer_spawn").execute(
      "tool-call-cleanup-alias-spawn",
      {
        objective: "try reused cleanup guard",
        cwd: "/repo",
        parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
        branchName: "candidatepeer/cleanup-alias-guard",
        workspaceName: "cleanup-alias-guard",
      },
      undefined,
      undefined,
      context,
    );

    const firstRecord = JSON.parse(readFileSync(spawn.details.registryPath, "utf8"));
    const aliasPeerRunId = "candidatepeer-alias-reuse-test";
    writeFileSync(
      `${stateHome}/pi-quests/peer-registry/${aliasPeerRunId}.json`,
      `${JSON.stringify({ ...firstRecord, peerRunId: aliasPeerRunId })}\n`,
    );

    const blocked = await tools.get("candidate_peer_cleanup").execute(
      "tool-call-cleanup-alias-dry-run",
      {
        peerRunIds: [spawn.details.peerRunId],
      },
      undefined,
      undefined,
      context,
    );

    assert.equal(blocked.details.ok, true);
    assert.equal(blocked.details.execution, "dry_run_plan_only");
    assert.deepEqual(blocked.details.duplicateAliasBlockers[0].peerRunIds, [
      aliasPeerRunId,
      spawn.details.peerRunId,
    ]);
    assert.equal(
      execStub.calls.some((call) => call.args?.includes("--force")),
      false,
    );
  });
});

test("candidate_peer_spawn clamps long safe names with hashes and records cleanup metadata", async () => {
  await withTempDir(async (stateHome) => {
    const execStub = createCandidatePeerExecStub({ dirty: "" });
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        GHOSTTY_SURFACE_ID: "21",
        PI_SIDEQUEST_PI_BIN: "pi",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty";
      },
    });
    const { tools } = registerExtension(extension);
    const longBranchTail = `lane-${"branch-segment-".repeat(12)}`;
    const longWorkspace = `workspace-${"segment-".repeat(14)}`;

    const result = await tools.get("candidate_peer_spawn").execute(
      "tool-call-1",
      {
        objective: "Try long safe names",
        cwd: "/repo",
        parentPeerTarget: "session-019e10d2-15f5-705a-aea4-01ba49d2bbac",
        branchName: `candidatepeer/${longBranchTail}`,
        workspaceName: longWorkspace,
      },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );

    const branchHash = createHash("sha1")
      .update(`candidatepeer/${longBranchTail.replace(/-$/, "")}`)
      .digest("hex")
      .slice(0, 10);
    const workspaceHash = createHash("sha1")
      .update(longWorkspace.replace(/-$/, ""))
      .digest("hex")
      .slice(0, 10);

    assert.equal(result.details.ok, true);
    assert.equal(result.details.branchName.length, 96);
    assert.match(result.details.branchName, new RegExp(`-${branchHash}$`));
    assert.equal(result.details.naming.branchNameClamped, true);
    assert.equal(result.details.naming.workspaceName.length, 80);
    assert.match(result.details.naming.workspaceName, new RegExp(`-${workspaceHash}$`));
    assert.equal(result.details.naming.workspaceNameClamped, true);
    assert.equal(result.details.naming.requestedBranchName, `candidatepeer/${longBranchTail}`);
    assert.equal(result.details.naming.requestedWorkspaceName, longWorkspace);
    assert.equal(
      result.details.worktreePath.endsWith(`/${result.details.naming.workspaceName}`),
      true,
    );

    const worktreeCall = execStub.calls.find(
      (call) => call.command === "git" && call.args.includes("worktree"),
    );
    assert.deepEqual(worktreeCall.args.slice(5), ["-b", result.details.branchName, "HEAD"]);

    const registry = JSON.parse(readFileSync(result.details.registryPath, "utf8"));
    assert.deepEqual(registry.naming, result.details.naming);
    assert.equal(registry.cleanupPacket.commands[1].args.at(-1), result.details.worktreePath);
    assert.equal(registry.cleanupPacket.commands[2].args.at(-1), result.details.branchName);
  });
});
