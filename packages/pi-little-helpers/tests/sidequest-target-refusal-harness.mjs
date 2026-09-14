// summary: supplies explicit target-refusal fixtures and the candidate bookkeeping assertion callback.
// read_when:
//   - changing the target-refusal cases registered by sidequest.test.mjs.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createSidequestExtension } from "../extensions/sidequest.ts";
import { launchPiQuestSession } from "../extensions/sidequestLaunch.ts";
import { createContext, createExecStub, registerExtension } from "./sidequest-harness.mjs";

// Local explicit target fixture; never installed as a default on unrelated tests.
export const targetBusRows = ":1.11 111 ghostty user :1.11 unit - -\n";
export async function targetLaunchCase(overrides = {}) {
  const calls = [];
  let windows = 0;
  let lists = 0;
  const exec = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === "+help")
      return overrides.help ?? { code: 0, stdout: "+new-tab\n+new-window\n" };
    if (command === "busctl" && args[1] === "list") {
      lists += 1;
      return {
        code: 0,
        stdout:
          lists > 1 && overrides.freshRows !== undefined
            ? overrides.freshRows
            : (overrides.rows ?? targetBusRows),
      };
    }
    if (command === "busctl" && args.includes("Describe")) {
      if (overrides.describeThrows) throw new Error("Describe transport unavailable");
      return overrides.description ?? { code: 0, stdout: '(bgav) true "(tas)" 0' };
    }
    if (command === "busctl" && args.includes("Activate")) {
      if (overrides.activateThrows) throw new Error("activation outcome unknown");
      return overrides.activation ?? { code: 0, stdout: "" };
    }
    throw new Error(`unexpected native/probe dispatch ${command} ${args.join(" ")}`);
  };
  const options = {
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_SURFACE_ID: "19",
      PI_SIDEQUEST_LAUNCH_STAGGER_MS: "0",
      ...overrides.env,
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    currentGhosttyAncestor: { pid: 111, exe: "/usr/bin/ghostty" },
    readProcessExecutable:
      overrides.read ?? ((pid) => (pid === 111 || pid === 222 ? "/usr/bin/ghostty" : undefined)),
    pathExists: (path) => path === "/usr/bin/ghostty",
    exec,
    detachedGhosttyWindowLaunch: async () => {
      windows += 1;
      return (
        overrides.windowResult ?? {
          ok: true,
          effectDisposition: "settled",
          code: 0,
          stdout: "",
          stderr: "",
          killed: false,
        }
      );
    },
    ...(overrides.controller ? { currentGhosttyAncestor: overrides.controller } : {}),
  };
  const result = await launchPiQuestSession({
    pi: { getThinkingLevel: () => "off", exec },
    ctx: { cwd: "/repo" },
    options,
    defaultPiBin: "pi",
    prompt: "PRIVATE_SESSION_PAYLOAD",
    titlePrompt: "bounded target test",
    cwd: "/repo",
  });
  return { result, calls, windows };
}
export function assertNoSessionDispatch({ result, calls, windows }) {
  assert.equal(result.ok, false);
  assert.equal(result.effectDisposition, "confirmed_no_effects");
  assert.equal(windows, 0);
  assert.ok(
    calls.every(
      ({ command, args }) =>
        args[0] === "+help" ||
        (command === "busctl" && (args[1] === "list" || args.includes("Describe"))),
    ),
  );
  assert.ok(
    calls.every(
      ({ args }) =>
        !args.includes("Activate") &&
        !args.includes("sidequest-pi") &&
        !args.includes("PRIVATE_SESSION_PAYLOAD") &&
        args[0] !== "+new-tab" &&
        args[0] !== "+new-window",
    ),
  );
  assert.match(result.launchNote, /this launch.*prior bookkeeping.*not global no-effects/);
}

export const assertTargetRefusalBookkeeping = async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/sidequest-refused-candidate-`);
  try {
    const base = createExecStub(({ command, args }) => {
      if (command === "git") {
        const query = args.slice(2);
        if (query.join(" ") === "rev-parse --show-toplevel") return { code: 0, stdout: "/repo\n" };
        if (query.join(" ") === "status --porcelain") return { code: 0, stdout: "" };
        if (query[0] === "worktree" && query[1] === "add")
          return { code: 0, stdout: "prepared fake worktree" };
      }
      if (command === "/usr/bin/ghostty" && args[0] === "+help")
        return { code: 0, stdout: "+new-tab\n" };
      throw new Error("unexpected preparation/launch command");
    });
    const effects = [];
    const calls = [];
    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_SURFACE_ID: "19",
        GHOSTTY_BIN_DIR: "/usr/bin",
        XDG_STATE_HOME: stateHome,
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      currentGhosttyAncestor: { pid: 111, exe: "/usr/bin/ghostty" },
      readProcessExecutable: () => undefined,
      pathExists: (path) => path === "/usr/bin/ghostty",
      candidateAdmission: {
        reserve({ repoRoot, objective }) {
          effects.push("reserved");
          return {
            admissionId: "cadm-refusal",
            permitPath: "/state/permits/cadm-refusal.json",
            pressure: { inventoryDigest: "inventory-refusal" },
            permit: { admissionId: "cadm-refusal", repoRoot, objective, reservationBytes: 1024 },
          };
        },
        bind(input) {
          effects.push("bound");
          return input;
        },
        release() {
          effects.push("released");
        },
      },
      exec(command, args, options) {
        calls.push({ command, args });
        if (command !== "git" && args[0] !== "+help")
          throw new Error("refusal must precede all launch dispatch");
        return base.exec(command, args, options);
      },
      detachedGhosttyWindowLaunch: async () => {
        effects.push("window-dispatch");
        throw new Error("forbidden window escape");
      },
    });
    const { tools } = registerExtension(extension);
    const result = await tools.get("candidate_peer_spawn").execute(
      "refused-candidate",
      {
        objective: "bounded target refusal",
        reportBack: "none",
        branchName: "candidatepeer/refused",
        workspaceName: "refused",
      },
      undefined,
      undefined,
      createContext({ cwd: "/repo" }).ctx,
    );
    assert.equal(result.isError, true);
    assert.equal(result.details.error, "launch_failed");
    assert.equal(
      result.details.effectDisposition,
      "confirmed_no_effects",
      "launch dispatch only, not admission/worktree effects",
    );
    assert.deepEqual(effects, ["reserved", "bound"]);
    assert.ok(
      calls.some(
        ({ command, args }) =>
          command === "git" && args.includes("worktree") && args.includes("add"),
      ),
    );
    assert.ok(calls.every(({ command, args }) => command === "git" || args[0] === "+help"));
    assert.ok(
      calls.every(
        ({ args }) =>
          !args.includes("Activate") && !args.includes("sidequest-pi") && args[0] !== "+new-tab",
      ),
    );
    assert.ok(result.details.worktreePath);
    assert.ok(existsSync(result.details.registryPath));
    const registry = JSON.parse(readFileSync(result.details.registryPath, "utf8"));
    assert.equal(registry.admission.admissionId, "cadm-refusal");
    assert.equal(registry.worktreePath, result.details.worktreePath);
    assert.equal(registry.launch.status, "launch_failed");
    assert.equal(registry.launch.effectDisposition, "confirmed_no_effects");
    assert.match(registry.launch.launchNote, /prior bookkeeping.*not global no-effects/);
    assert.ok(registry.cleanupPacket, "retained resources still need owner lifecycle disposition");
    assert.equal(
      result.details.admissionEffectDisposition,
      undefined,
      "do not fabricate a global or admission no-effects receipt",
    );
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
};
