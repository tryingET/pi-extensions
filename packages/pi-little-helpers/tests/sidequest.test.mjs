// summary: verifies sidequest ghostty selection, tab and window fallback, placement checks, and registered commands and tools.
// read_when:
//   - changing sidequest launch routing, ghostty compatibility, surface attachment, or default registration.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createSidequestExtension,
  getGhosttySurfaceId,
  ghosttySurfaceIdProbeIndicatesSupport,
  ghosttyVersionSupportsSurfaceId,
  resolveControllerGhosttyDbusTarget,
  resolveGhosttyBin,
  SURFACE_ID_CAPABILITY_PROBE_VALUE,
  supportsGhosttySurfaceId,
} from "../extensions/sidequest.ts";
import { launchPiQuestSession } from "../extensions/sidequestLaunch.ts";
import {
  createContext,
  createExecStub,
  extractPiArgs,
  extractShellCommand,
  isAnyLocalSidequestGhosttyBin,
  isLocalGhosttyBin,
  isLocalGhosttyWrapper,
  LOCAL_GHOSTTY_BIN,
  LOCAL_GHOSTTY_NEXT_BIN,
  LOCAL_GHOSTTY_ORIGIN_MAIN_BIN,
  LOCAL_GHOSTTY_PREV_BIN,
  LOCAL_GHOSTTY_WRAPPER,
  registerExtension,
} from "./sidequest-harness.mjs";


// Local explicit target fixture; never installed as a default on unrelated tests.
const targetBusRows = ":1.11 111 ghostty user :1.11 unit - -\n";
async function targetLaunchCase(overrides = {}) {
  const calls = [];
  let windows = 0;
  let lists = 0;
  const exec = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === "+help") return overrides.help ?? { code: 0, stdout: "+new-tab\n+new-window\n" };
    if (command === "busctl" && args[1] === "list") {
      lists += 1;
      return { code: 0, stdout: lists > 1 && overrides.freshRows !== undefined ? overrides.freshRows : overrides.rows ?? targetBusRows };
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
    env: { TERM_PROGRAM: "ghostty", GHOSTTY_SURFACE_ID: "19", PI_SIDEQUEST_LAUNCH_STAGGER_MS: "0", ...overrides.env },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    currentGhosttyAncestor: { pid: 111, exe: "/usr/bin/ghostty" },
    readProcessExecutable: overrides.read ?? ((pid) => pid === 111 || pid === 222 ? "/usr/bin/ghostty" : undefined),
    pathExists: (path) => path === "/usr/bin/ghostty",
    exec,
    detachedGhosttyWindowLaunch: async () => {
      windows += 1;
      return overrides.windowResult ?? { ok: true, effectDisposition: "settled", code: 0, stdout: "", stderr: "", killed: false };
    },
    ...(overrides.controller ? { currentGhosttyAncestor: overrides.controller } : {}),
  };
  const result = await launchPiQuestSession({
    pi: { getThinkingLevel: () => "off", exec }, ctx: { cwd: "/repo" }, options,
    defaultPiBin: "pi", prompt: "PRIVATE_SESSION_PAYLOAD", titlePrompt: "bounded target test", cwd: "/repo",
  });
  return { result, calls, windows };
}
function assertNoSessionDispatch({ result, calls, windows }) {
  assert.equal(result.ok, false);
  assert.equal(result.effectDisposition, "confirmed_no_effects");
  assert.equal(windows, 0);
  assert.ok(calls.every(({ command, args }) => args[0] === "+help" ||
    (command === "busctl" && (args[1] === "list" || args.includes("Describe")))));
  assert.ok(calls.every(({ args }) => !args.includes("Activate") && !args.includes("sidequest-pi") &&
    !args.includes("PRIVATE_SESSION_PAYLOAD") && args[0] !== "+new-tab" && args[0] !== "+new-window"));
  assert.match(result.launchNote, /this launch.*prior bookkeeping.*not global no-effects/);
}

test("getGhosttySurfaceId only accepts Ghostty surface id formats", () => {
  assert.equal(getGhosttySurfaceId({ GHOSTTY_SURFACE_ID: "17" }), "17");
  assert.equal(getGhosttySurfaceId({ GHOSTTY_SURFACE_ID: "0x2b2826e0" }), "0x2b2826e0");
  assert.equal(getGhosttySurfaceId({ GHOSTTY_SURFACE_ID: "surface-17" }), undefined);
  assert.equal(getGhosttySurfaceId({}), undefined);
});

test("ghosttyVersionSupportsSurfaceId gates the 1.4+ surface-id action flag", () => {
  assert.equal(ghosttyVersionSupportsSurfaceId("Ghostty 1.3.2-dev+0000000"), false);
  assert.equal(ghosttyVersionSupportsSurfaceId("Ghostty 1.4.0"), true);
  assert.equal(ghosttyVersionSupportsSurfaceId("  - version: 2.0.0\n"), true);
  assert.equal(ghosttyVersionSupportsSurfaceId("not a version"), false);
});

test("ghosttySurfaceIdProbeIndicatesSupport recognizes only flag parse failures", () => {
  // A build that recognizes --surface-id fails argument parsing before any
  // tab is created (verified against origin/main builds).
  assert.equal(
    ghosttySurfaceIdProbeIndicatesSupport("Error parsing args: error.InvalidCharacter"),
    true,
  );
  assert.equal(ghosttySurfaceIdProbeIndicatesSupport("Error parsing args: error.Overflow"), true);
  // A build without the +new-tab action reports an unknown-action error instead.
  assert.equal(
    ghosttySurfaceIdProbeIndicatesSupport(
      "Error: unknown CLI action specified. CLI actions are specified with the '+' character.",
    ),
    false,
  );
  // Ambiguous silent output must never count as support.
  assert.equal(ghosttySurfaceIdProbeIndicatesSupport(""), false);
});

test("supportsGhosttySurfaceId accepts dev-versioned builds that carry the flag", async () => {
  // Origin/main snapshots report pre-1.4 dev versions while carrying the
  // surface-id flag; the capability probe must recover full targeting.
  const supported = await supportsGhosttySurfaceId(async (_command, args) => {
    if (args[0] === "+new-tab") {
      return { code: 1, stderr: "Error parsing args: error.InvalidCharacter" };
    }
    return { code: 0, stdout: "Ghostty 1.3.2-main-+492300cad\n" };
  }, LOCAL_GHOSTTY_ORIGIN_MAIN_BIN);
  assert.equal(supported, true);
});

test("supportsGhosttySurfaceId falls back to the version gate on inconclusive probes", async () => {
  const unsupported = await supportsGhosttySurfaceId(async (_command, args) => {
    if (args[0] === "+new-tab") {
      return { code: 1, stderr: "Error: unknown CLI action specified." };
    }
    return { code: 0, stdout: "Ghostty 1.3.1-arch2\n" };
  }, "/usr/bin/ghostty");
  assert.equal(unsupported, false);

  const supportedViaVersion = await supportsGhosttySurfaceId(async (_command, args) => {
    if (args[0] === "+new-tab") {
      return { code: 0, stdout: "" };
    }
    return { code: 0, stdout: "Ghostty 1.4.0-origin-main-9d8fbd15\n" };
  }, LOCAL_GHOSTTY_ORIGIN_MAIN_BIN);
  assert.equal(supportedViaVersion, true);
});

test("resolveGhosttyBin prefers the current stock Ghostty session binary over the sidequest wrapper", () => {
  const resolved = resolveGhosttyBin({
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    pathExists(path) {
      return path === "/usr/bin/ghostty" || isLocalGhosttyWrapper(path) || isLocalGhosttyBin(path);
    },
  });

  assert.equal(resolved, "/usr/bin/ghostty");
});

test("resolveGhosttyBin uses the sidequest wrapper when the current session already runs in the sidequest fork", () => {
  for (const currentSessionGhosttyBin of [
    LOCAL_GHOSTTY_BIN,
    LOCAL_GHOSTTY_NEXT_BIN,
    LOCAL_GHOSTTY_PREV_BIN,
  ]) {
    const resolved = resolveGhosttyBin({
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
      },
      currentSessionGhosttyBin,
      pathExists(path) {
        return (
          path === "/usr/bin/ghostty" ||
          isLocalGhosttyWrapper(path) ||
          isAnyLocalSidequestGhosttyBin(path)
        );
      },
    });

    assert.ok(isLocalGhosttyWrapper(resolved), currentSessionGhosttyBin);
  }
});

test("resolveGhosttyBin falls back to the local wrapper before the raw local Ghostty binary", () => {
  const resolved = resolveGhosttyBin({
    env: {},
    pathExists(path) {
      return isLocalGhosttyWrapper(path) || isLocalGhosttyBin(path);
    },
  });

  assert.ok(isLocalGhosttyWrapper(resolved));
});

test("tab capability alone cannot authorize native fallback for an unreadable controller", async () => {
  const outcome = await targetLaunchCase({ read: () => undefined });
  assertNoSessionDispatch(outcome);
  assert.ok(!outcome.calls.some(({ args }) => args.includes("Describe")));
});

test("sidequest opens a new Ghostty window when the current Ghostty session and wrapper lack +new-tab", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n" };
    }
    if (args[0]?.startsWith("--working-directory=")) {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });

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
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext();

  await sidequest.handler("trace this failure", harness.ctx);

  assert.deepEqual(
    execStub.calls.map(({ command, args }) => [command, args[0]]),
    [
      ["/usr/bin/ghostty", "+help"],
      ["/usr/bin/ghostty", "--working-directory=/repo"],
    ],
  );

  const launchArgs = execStub.calls[1].args;
  assert.ok(!launchArgs.some((arg) => arg.startsWith("--surface-id=")));
  assert.ok(!launchArgs.some((arg) => arg.startsWith("--title=")));
  assert.match(extractShellCommand(launchArgs), /cd '\/repo'/);
  assert.match(
    extractShellCommand(launchArgs),
    /PI_SESSION_PRESENCE_TITLE_BASE='Sidequest: trace this failure'/,
  );
  assert.deepEqual(extractPiArgs(launchArgs), [
    "pi",
    "--fork",
    "/sessions/main.jsonl",
    "--model",
    "openai/gpt-4o",
    "--thinking",
    "medium",
    "trace this failure",
  ]);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "info");
  assert.match(harness.notifications[0].message, /new Ghostty window/);
  assert.match(harness.notifications[0].message, /does not support \+new-tab/);
});

test("sidequest refuses missing surface ID instead of sending an untargeted tab", async () => {
  assertNoSessionDispatch(await targetLaunchCase({ env: { GHOSTTY_SURFACE_ID: undefined } }));
});

test("nonzero exact activation stays indeterminate and never retries a window", async () => {
  const outcome = await targetLaunchCase({ activation: { code: 1, stderr: "activation may have dispatched" } });
  assert.equal(outcome.result.effectDisposition, "effect_indeterminate");
  assert.equal(outcome.windows, 0);
  assert.equal(outcome.calls.filter(({ args }) => args.includes("Activate")).length, 1);
});

test("targeted launch orders identity, read-only capability, identity recheck, then one activation", async () => {
  const outcome = await targetLaunchCase();
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.windows, 0);
  assert.deepEqual(outcome.calls.map(({ args }) => args[0] === "+help" ? "help" : args[1] === "list" ? "identity" : args.includes("Describe") ? "Describe" : "Activate"), ["help", "identity", "Describe", "identity", "Activate"]);
  const dispatch = outcome.calls.at(-1);
  assert.equal(dispatch.args[3], ":1.11");
  assert.equal(dispatch.args[11], "19");
  assert.equal(dispatch.args.filter((arg) => arg === "PRIVATE_SESSION_PAYLOAD").length, 1);
  assert.ok(outcome.calls.slice(0, -1).every(({ args }) => !args.includes("PRIVATE_SESSION_PAYLOAD")));
});

test("sidequest targets the Ghostty single-instance server instead of the sidequest broker", async () => {
  const execStub = createExecStub(({ command, args }) => {
    if (isLocalGhosttyWrapper(command) && args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-tab\n" };
    }
    if (isLocalGhosttyWrapper(command) && args[0] === "+version") {
      return { code: 0, stdout: "Ghostty 1.4.0-sidequest.1\n" };
    }
    if (command === "busctl" && args[1] === "list") {
      return {
        code: 0,
        stdout:
          ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
          "com.tryinget.ghosttysidequest 222 ghostty user :1.43 user@1000.service - -\n",
      };
    }
    if (command === "busctl" && args.includes("Describe")) return { code: 0, stdout: '(bgav) true "(tas)" 0' };
    if (command === "busctl" && args[1] === "call") {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected launch call: ${command} ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_SURFACE_ID: "0x1234",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: LOCAL_GHOSTTY_BIN,
    currentGhosttyAncestor: { pid: 111, exe: LOCAL_GHOSTTY_BIN },
    readProcessExecutable(pid) {
      return pid === 111 || pid === 222 ? LOCAL_GHOSTTY_BIN : undefined;
    },
    exec: execStub.exec,
    pathExists(path) {
      return isLocalGhosttyWrapper(path) || isLocalGhosttyBin(path);
    },
  });
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext();

  await sidequest.handler("stay with the controller", harness.ctx);

  const activation = execStub.calls.find(
    ({ command, args }) => command === "busctl" && args.includes("Activate"),
  );
  assert.ok(activation);
  assert.deepEqual(activation.args.slice(0, 12), [
    "--user",
    "call",
    "--expect-reply=no",
    ":1.43",
    "/com/tryinget/ghosttysidequest",
    "org.gtk.Actions",
    "Activate",
    "sava{sv}",
    "new-tab",
    "1",
    "(tas)",
    "4660",
  ]);
  assert.equal(Number(activation.args[12]), activation.args.length - 15);
  assert.equal(activation.args[13], "--");
  assert.deepEqual(extractPiArgs(activation.args), [
    "pi",
    "--fork",
    "/sessions/main.jsonl",
    "--model",
    "openai/gpt-4o",
    "--thinking",
    "medium",
    "stay with the controller",
    "0",
  ]);
  assert.ok(
    !execStub.calls.some(
      ({ command, args }) =>
        isLocalGhosttyWrapper(command) && args[0] === "+new-tab" && args.includes("sidequest-pi"),
    ),
  );
  assert.match(harness.notifications[0].message, /current Ghostty tab/);
  assert.match(harness.notifications[0].message, /targeted Ghostty process 222/);
});

test("sidequest targets the normal origin/main Ghostty broker by controller executable family", async () => {
  const execStub = createExecStub(({ command, args }) => {
    if (command === LOCAL_GHOSTTY_ORIGIN_MAIN_BIN && args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-tab\n" };
    }
    if (command === LOCAL_GHOSTTY_ORIGIN_MAIN_BIN && args[0] === "+version") {
      return { code: 0, stdout: "Ghostty 1.4.0-origin-main-9d8fbd15b3b4\n" };
    }
    if (command === "busctl" && args[1] === "list") {
      return {
        code: 0,
        stdout:
          ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
          ":1.44 333 ghostty user :1.44 user@1000.service - -\n" +
          "com.mitchellh.ghostty 222 ghostty user :1.43 user@1000.service - -\n" +
          "com.tryinget.ghosttysidequest 333 ghostty user :1.44 user@1000.service - -\n",
      };
    }
    if (command === "busctl" && args.includes("Describe")) return { code: 0, stdout: '(bgav) true "(tas)" 0' };
    if (command === "busctl" && args[1] === "call") {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected launch call: ${command} ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_SURFACE_ID: "0x1234",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: LOCAL_GHOSTTY_ORIGIN_MAIN_BIN,
    currentGhosttyAncestor: { pid: 111, exe: LOCAL_GHOSTTY_ORIGIN_MAIN_BIN },
    readProcessExecutable(pid) {
      return pid === 111 || pid === 222 ? LOCAL_GHOSTTY_ORIGIN_MAIN_BIN : undefined;
    },
    exec: execStub.exec,
    pathExists(path) {
      return path === LOCAL_GHOSTTY_ORIGIN_MAIN_BIN;
    },
  });
  const { commands } = registerExtension(extension);
  const harness = createContext();

  await commands.get("sidequest").handler("stay with origin main", harness.ctx);

  const activation = execStub.calls.find(
    ({ command, args }) => command === "busctl" && args.includes("Activate"),
  );
  assert.ok(activation);
  assert.deepEqual(activation.args.slice(0, 12), [
    "--user",
    "call",
    "--expect-reply=no",
    ":1.43",
    "/com/mitchellh/ghostty",
    "org.gtk.Actions",
    "Activate",
    "sava{sv}",
    "new-tab",
    "1",
    "(tas)",
    "4660",
  ]);
  assert.equal(Number(activation.args[12]), activation.args.length - 15);
  assert.equal(activation.args[13], "--");
  assert.ok(
    !execStub.calls.some(
      ({ command, args }) =>
        command === LOCAL_GHOSTTY_ORIGIN_MAIN_BIN &&
        args[0] === "+new-tab" &&
        args.includes("sidequest-pi"),
    ),
  );
  assert.match(harness.notifications[0].message, /targeted Ghostty process 222/);
});

test("normal targeting rejects a stale packaged owner for an origin/main controller", async () => {
  const target = await resolveControllerGhosttyDbusTarget({
    controllerGhostty: { pid: 111, exe: LOCAL_GHOSTTY_ORIGIN_MAIN_BIN },
    surfaceId: "0x1234",
    readProcessExecutable(pid) {
      return pid === 111 ? LOCAL_GHOSTTY_ORIGIN_MAIN_BIN : pid === 222 ? "/usr/bin/ghostty" : undefined;
    },
    async execRunner(command, args) {
      assert.equal(command, "busctl");
      assert.equal(args[1], "list");
      return {
        code: 0,
        stdout:
          ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
          "com.mitchellh.ghostty 222 ghostty user :1.43 user@1000.service - -\n",
      };
    },
  });

  assert.equal(target, undefined);
});

test("sidequest rejects a killed D-Bus activation even when the executor reports code zero", async () => {
  const execStub = createExecStub(({ command, args }) => {
    if (isLocalGhosttyWrapper(command) && args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-tab\n" };
    }
    if (isLocalGhosttyWrapper(command) && args[0] === "+version") {
      return { code: 0, stdout: "Ghostty 1.4.0-sidequest.1\n" };
    }
    if (command === "busctl" && args[1] === "list") {
      return {
        code: 0,
        stdout:
          ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
          "com.tryinget.ghosttysidequest 222 ghostty user :1.43 user@1000.service - -\n",
      };
    }
    if (command === "busctl" && args.includes("Describe")) return { code: 0, stdout: '(bgav) true "(tas)" 0' };
    if (command === "busctl" && args[1] === "call") {
      return { code: 0, stdout: "", killed: true };
    }
    throw new Error(`Unexpected launch call: ${command} ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_SURFACE_ID: "0x1234",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: LOCAL_GHOSTTY_BIN,
    currentGhosttyAncestor: { pid: 111, exe: LOCAL_GHOSTTY_BIN },
    readProcessExecutable(pid) {
      return pid === 111 || pid === 222 ? LOCAL_GHOSTTY_BIN : undefined;
    },
    exec: execStub.exec,
    pathExists(path) {
      return isLocalGhosttyWrapper(path) || isLocalGhosttyBin(path);
    },
  });
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext();

  await sidequest.handler("preserve the peer", harness.ctx);

  assert.ok(execStub.calls.some(({ command, args }) => command === "busctl" && args.includes("Activate")));
  assert.ok(
    !execStub.calls.some(
      ({ command, args }) =>
        isLocalGhosttyWrapper(command) && args[0]?.startsWith("--working-directory="),
    ),
  );
  assert.match(harness.notifications[0].message, /effect is indeterminate/);
  assert.match(harness.notifications[0].message, /do not retry automatically/);
});

test("sidequest reports a post-launch Ghostty window placement mismatch", async () => {
  const presenceDir = mkdtempSync(`${tmpdir()}/sidequest-placement-`);

  try {
    const execStub = createExecStub(({ command, args }) => {
      if (args[0] === "+help") {
        return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
      }
      if (args[0] === "+version") {
        return { code: 0, stdout: "Ghostty 1.4.0\n" };
      }
      if (command === "busctl" && args[1] === "list") return { code: 0, stdout: targetBusRows };
      if (command === "busctl" && args.includes("Describe")) return { code: 0, stdout: '(bgav) true "(tas)" 0' };
      if (command === "busctl" && args.includes("Activate")) {
        writeFileSync(
          `${presenceDir}/${process.pid}.json`,
          `${JSON.stringify({
            schemaVersion: 1,
            pid: process.pid,
            cwd: "/repo",
            windowTitleBase: "Sidequest: place check",
            publishedAt: new Date().toISOString(),
            ghosttyAncestorPid: 222,
            ghosttySurfaceId: "0x222",
          })}\n`,
          "utf8",
        );
        return { code: 0, stdout: "" };
      }
      throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
    });

    const extension = createSidequestExtension({
      registerTools: true,
      env: {
        TERM_PROGRAM: "ghostty",
        GHOSTTY_BIN_DIR: "/usr/bin",
        GHOSTTY_SURFACE_ID: "0x111",
        PI_SIDEQUEST_PI_BIN: "pi",
      },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      currentGhosttyAncestor: { pid: 111, exe: "/usr/bin/ghostty" },
      readProcessExecutable: (pid) => pid === 111 ? "/usr/bin/ghostty" : undefined,
      processId: 1,
      presenceDir,
      placementVerificationTimeoutMs: 100,
      exec: execStub.exec,
      pathExists(path) {
        return path === "/usr/bin/ghostty" || path === `/proc/${process.pid}`;
      },
    });
    const { commands } = registerExtension(extension);
    const sidequest = commands.get("sidequest");
    const harness = createContext();

    await sidequest.handler("place check", harness.ctx);

    assert.equal(harness.notifications.length, 1);
    assert.match(harness.notifications[0].message, /different Ghostty window/);
    assert.match(harness.notifications[0].message, /controller ghostty pid 111/);
    assert.match(harness.notifications[0].message, /child ghostty pid 222/);
  } finally {
    rmSync(presenceDir, { recursive: true, force: true });
  }
});

test("unsupported exact action refuses rather than omitting surface targeting", async () => {
  assertNoSessionDispatch(await targetLaunchCase({ description: { code: 0, stdout: '(bgav) true "as" 0' } }));
});

test("sidequest refuses to launch when the current Pi session has not been saved", async () => {
  const execStub = createExecStub(() => {
    throw new Error("Ghostty should not be called without a saved session file");
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
    },
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
  });
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext({ sessionFile: undefined });

  await sidequest.handler("needs a real session", harness.ctx);

  assert.equal(execStub.calls.length, 0);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "error");
  assert.match(harness.notifications[0].message, /needs a saved Pi session/i);
});

test("fresh-handoff launches a clean Pi session and auto-submits exactly one generated prompt", async () => {
  const generatedPrompt =
    "You are a fresh, stateless Pi coding session.\n\nVerify state, then implement task 4660.";
  const generationCalls = [];
  const execStub = createExecStub(({ command, args }) => {
    if (command === "git")
      return { code: 0, stdout: args[0] === "rev-parse" ? "abc123\n" : "## main\n" };
    if (command === "ak")
      return { code: 0, stdout: args.includes("ready") ? '[{"id":4660}]\n' : "[]\n" };
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
    }
    if (args[0] === "+version") return { code: 0, stdout: "Ghostty 1.4.0\n" };
    if (args[0]?.startsWith("--working-directory=") && args[1]?.startsWith("--surface-id=zz-invalid-surface-id")) {
      // Capability probe: the recognized flag fails argument parsing before any
      // tab is created.
      return { code: 1, stderr: "Error parsing args: error.InvalidCharacter" };
    }
    if (args[0]?.startsWith("--working-directory=")) return { code: 0, stdout: "" };
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });
  const extension = createSidequestExtension({
    env: {
      TERM_PROGRAM: "xterm",
      GHOSTTY_BIN_DIR: "/usr/bin",
      GHOSTTY_SURFACE_ID: "19",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty";
    },
    async generateHandoffPrompt(input) {
      generationCalls.push(input);
      return generatedPrompt;
    },
  });
  const { commands } = registerExtension(extension, { thinkingLevel: "high" });
  const harness = createContext();

  await commands.get("fresh-handoff").handler("Implement task 4660", harness.ctx);

  assert.equal(generationCalls.length, 1);
  assert.equal(generationCalls[0].ctx, harness.ctx);
  assert.equal(generationCalls[0].goal, "Implement task 4660");
  assert.match(generationCalls[0].runtimeContext, /Git HEAD/);
  assert.match(generationCalls[0].runtimeContext, /abc123/);
  assert.match(generationCalls[0].runtimeContext, /AK ready tasks/);
  assert.match(generationCalls[0].runtimeContext, /4660/);
  const launch = execStub.calls.find(
    ({ args }) => args[0]?.startsWith("--working-directory=") && args.includes("sidequest-pi"),
  );
  assert.ok(launch);
  assert.deepEqual(extractPiArgs(launch.args), [
    "pi",
    "--model",
    "openai/gpt-4o",
    "--thinking",
    "high",
    generatedPrompt,
  ]);
  assert.equal(extractPiArgs(launch.args).includes("--fork"), false);
  assert.equal(extractPiArgs(launch.args).filter((arg) => arg === generatedPrompt).length, 1);
  assert.equal(harness.notifications.length, 3);
  assert.equal(harness.notifications[0].type, "info");
  assert.match(harness.notifications[0].message, /capturing live Git\/AK readback/);
  assert.equal(harness.notifications[1].type, "info");
  assert.match(harness.notifications[1].message, /generating the handoff prompt/);
  assert.match(harness.notifications[1].message, /openai\/gpt-4o/);
  assert.equal(harness.notifications[2].type, "info");
  assert.match(harness.notifications[2].message, /clean Pi session/);
  assert.match(harness.notifications[2].message, /auto-submitted one generated handoff/);
  assert.match(harness.notifications[2].message, /new Ghostty window/);
});

test("fresh_handoff_spawn launches the same clean handoff without inheriting context", async () => {
  const generatedPrompt = "You are a fresh, stateless Pi coding session.\n\nContinue task 5260.";
  const generationCalls = [];
  const execStub = createExecStub(({ command, args }) => {
    if (command === "git" || command === "ak") return { code: 0, stdout: "[]\n" };
    if (args[0] === "+help") return { code: 0, stdout: "Available actions:\n  +new-window\n" };
    if (args[0]?.startsWith("--working-directory=")) return { code: 0, stdout: "" };
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });
  const extension = createSidequestExtension({
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
    async generateHandoffPrompt(input) {
      generationCalls.push(input);
      return generatedPrompt;
    },
  });
  const { tools } = registerExtension(extension, { thinkingLevel: "high" });
  const harness = createContext();

  const result = await tools
    .get("fresh_handoff_spawn")
    .execute(
      "tool-call-fresh-handoff",
      { goal: "Continue task 5260", cwd: "/repo" },
      undefined,
      undefined,
      harness.ctx,
    );

  assert.equal(result.details.ok, true);
  assert.equal(result.details.sessionMode, "clean");
  assert.equal(result.details.cwd, "/repo");
  assert.equal(generationCalls.length, 1);
  assert.equal(generationCalls[0].goal, "Continue task 5260");
  const launch = execStub.calls.find(({ args }) => args[0]?.startsWith("--working-directory="));
  assert.ok(launch);
  assert.equal(extractPiArgs(launch.args).includes("--fork"), false);
  assert.equal(extractPiArgs(launch.args).filter((arg) => arg === generatedPrompt).length, 1);
  assert.equal(harness.notifications.length, 0);
});

test("fresh-handoff works without arguments and reports a truthful new-window fallback", async () => {
  const generationCalls = [];
  const generatedPrompt = "You are a fresh, stateless Pi coding session.\n\nContinue safely.";
  const execStub = createExecStub(({ command, args }) => {
    if (command === "git")
      return { code: 0, stdout: args[0] === "rev-parse" ? "abc123\n" : "## main\n" };
    if (command === "ak") return { code: 0, stdout: "[]\n" };
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n" };
    }
    if (args[0]?.startsWith("--working-directory=")) return { code: 0, stdout: "" };
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });
  const extension = createSidequestExtension({
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
    async generateHandoffPrompt(input) {
      generationCalls.push(input);
      return generatedPrompt;
    },
  });
  const { commands } = registerExtension(extension);
  const harness = createContext();

  await commands.get("fresh-handoff").handler("", harness.ctx);

  assert.equal(generationCalls.length, 1);
  assert.match(generationCalls[0].goal, /unfinished operator-directed work/);
  const launch = execStub.calls.find(({ args }) => args[0]?.startsWith("--working-directory="));
  assert.ok(launch);
  assert.equal(extractPiArgs(launch.args).includes("--fork"), false);
  assert.equal(extractPiArgs(launch.args).at(-1), generatedPrompt);
  assert.equal(harness.notifications.length, 3);
  assert.match(harness.notifications[0].message, /capturing live Git\/AK readback/);
  assert.match(harness.notifications[1].message, /generating the handoff prompt/);
  assert.match(harness.notifications[2].message, /new Ghostty window/);
  assert.match(harness.notifications[2].message, /does not support \+new-tab/);
});

test("fresh-handoff does not launch when owner-scoped prompt generation fails", async () => {
  const execStub = createExecStub(({ command }) => {
    if (command === "git" || command === "ak") return { code: 0, stdout: "[]\n" };
    throw new Error("Ghostty must not launch after generation failure");
  });
  const extension = createSidequestExtension({
    exec: execStub.exec,
    async generateHandoffPrompt() {
      throw new Error("model unavailable");
    },
  });
  const { commands } = registerExtension(extension);
  const harness = createContext();

  await commands.get("fresh-handoff").handler("continue", harness.ctx);

  assert.equal(execStub.calls.length, 4);
  assert.ok(execStub.calls.every(({ command }) => command === "git" || command === "ak"));
  assert.equal(harness.notifications.length, 3);
  assert.match(harness.notifications[0].message, /capturing live Git\/AK readback/);
  assert.match(harness.notifications[1].message, /generating the handoff prompt/);
  assert.deepEqual(harness.notifications[2], {
    type: "error",
    message: "fresh-handoff could not generate a handoff: model unavailable",
  });
});

test("sidequest defaults to slash commands, visible-loop, and standard peer-spawn tools", () => {
  const extension = createSidequestExtension();
  const { commands, tools } = registerExtension(extension);

  assert.ok(commands.has("sidequest"));
  assert.equal(commands.has("forkpeer"), false);
  assert.ok(commands.has("scoutpeer"));
  assert.equal(commands.has("candidatepeer"), false);
  assert.ok(commands.has("parallelquest"));
  assert.ok(commands.has("fresh-handoff"));
  assert.equal(commands.has("handoff-tab"), false);
  assert.ok(commands.has("visible-loop"));
  assert.ok(commands.has("nexus-loop"));
  assert.ok(commands.has("visible-loop-child"));
  assert.ok(commands.has("visible-loop-child-complete"));
  assert.ok(tools.has("fork_peer_spawn"));
  assert.ok(tools.has("scout_peer_spawn"));
  assert.ok(tools.has("candidate_peer_spawn"));
  assert.ok(tools.has("candidate_peer_cleanup"));
  assert.ok(tools.has("candidate_peer_closeout"));
  assert.ok(tools.has("fresh_handoff_spawn"));

  const forkPeerParameters = tools.get("fork_peer_spawn").parameters;
  assert.ok(forkPeerParameters.properties.reportBack);
  assert.ok(forkPeerParameters.properties.parentPeerTarget);
});

test("sidequest can suppress commands while registering toolbox peer tools", () => {
  const extension = createSidequestExtension({ registerCommands: false, registerTools: true });
  const { commands, tools } = registerExtension(extension);

  assert.equal(commands.has("sidequest"), false);
  assert.ok(tools.has("fork_peer_spawn"));
  assert.equal(tools.has("sidequest_spawn"), false);
  assert.ok(tools.has("scout_peer_spawn"));
  assert.ok(tools.has("candidate_peer_spawn"));
  assert.ok(tools.has("candidate_peer_cleanup"));
  assert.ok(tools.has("candidate_peer_closeout"));
  assert.equal(tools.has("parallelquest_spawn"), false);
  assert.ok(tools.has("fresh_handoff_spawn"));
});

for (const item of [
  { name: "invalid PID", controller: { pid: 0, exe: "/usr/bin/ghostty" } },
  { name: "unreadable controller", read: () => undefined },
  { name: "ambiguous originator", rows: targetBusRows + ":1.12 111 ghostty user :1.12 unit - -\n" },
  { name: "duplicate bus row", rows: targetBusRows + targetBusRows },
  { name: "malformed listing", rows: "bad row\n" },
  { name: "unknown help outcome", help: { code: 0, killed: true, stdout: "+new-tab" } },
  { name: "disabled action", description: { code: 0, stdout: '(bgav) false "(tas)" 0' } },
  { name: "killed Describe", description: { code: 0, killed: true, stdout: '(bgav) true "(tas)" 0' } },
  { name: "throwing Describe", describeThrows: true },
  { name: "owner disappears after Describe", freshRows: "" },
  { name: "owner connection changes after Describe", freshRows: targetBusRows.replaceAll(":1.11", ":1.99") },
]) {
  test(`pre-dispatch refusal: ${item.name} has zero payload/native/window/activation calls`, async () => {
    assertNoSessionDispatch(await targetLaunchCase(item));
  });
}
for (const item of [
  { name: "killed activation", activation: { code: 0, killed: true } },
  { name: "throwing activation", activateThrows: true },
]) {
  test(`${item.name} remains indeterminate without retry`, async () => {
    const outcome = await targetLaunchCase(item);
    assert.equal(outcome.result.ok, false);
    assert.equal(outcome.result.effectDisposition, "effect_indeterminate");
    assert.equal(outcome.windows, 0);
    assert.equal(outcome.calls.filter(({ args }) => args.includes("Activate")).length, 1);
  });
}
test("a preselected window is separate intent, not a target-refusal escape", async () => {
  const outcome = await targetLaunchCase({ env: { TERM_PROGRAM: "xterm" }, read: () => undefined });
  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.result.launchMode, "window");
  assert.equal(outcome.windows, 1);
  assert.ok(outcome.calls.every(({ args }) => args[0] === "+help"));
});
test("indeterminate preselected-window result is never converted to no effects", async () => {
  const outcome = await targetLaunchCase({ env: { TERM_PROGRAM: "xterm" }, windowResult: {
    ok: false, effectDisposition: "effect_indeterminate", code: -1, stdout: "", stderr: "handshake unknown", killed: true,
  } });
  assert.equal(outcome.result.effectDisposition, "effect_indeterminate");
  assert.equal(outcome.windows, 1);
});

test("target refusal keeps admission/worktree bookkeeping and records ordinary launch failure", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/sidequest-refused-candidate-`);
  try {
    const base = createExecStub(({ command, args }) => {
      if (command === "git") {
        const query = args.slice(2);
        if (query.join(" ") === "rev-parse --show-toplevel") return { code: 0, stdout: "/repo\n" };
        if (query.join(" ") === "status --porcelain") return { code: 0, stdout: "" };
        if (query[0] === "worktree" && query[1] === "add") return { code: 0, stdout: "prepared fake worktree" };
      }
      if (command === "/usr/bin/ghostty" && args[0] === "+help") return { code: 0, stdout: "+new-tab\n" };
      throw new Error("unexpected preparation/launch command");
    });
    const effects = [];
    const calls = [];
    const extension = createSidequestExtension({
      registerTools: true,
      env: { TERM_PROGRAM: "ghostty", GHOSTTY_SURFACE_ID: "19", GHOSTTY_BIN_DIR: "/usr/bin", XDG_STATE_HOME: stateHome },
      currentSessionGhosttyBin: "/usr/bin/ghostty",
      currentGhosttyAncestor: { pid: 111, exe: "/usr/bin/ghostty" },
      readProcessExecutable: () => undefined,
      pathExists: (path) => path === "/usr/bin/ghostty",
      candidateAdmission: {
        reserve({ repoRoot, objective }) {
          effects.push("reserved");
          return { admissionId: "cadm-refusal", permitPath: "/state/permits/cadm-refusal.json",
            pressure: { inventoryDigest: "inventory-refusal" },
            permit: { admissionId: "cadm-refusal", repoRoot, objective, reservationBytes: 1024 } };
        },
        bind(input) { effects.push("bound"); return input; },
        release() { effects.push("released"); },
      },
      exec(command, args, options) {
        calls.push({ command, args });
        if (command !== "git" && args[0] !== "+help") throw new Error("refusal must precede all launch dispatch");
        return base.exec(command, args, options);
      },
      detachedGhosttyWindowLaunch: async () => { effects.push("window-dispatch"); throw new Error("forbidden window escape"); },
    });
    const { tools } = registerExtension(extension);
    const result = await tools.get("candidate_peer_spawn").execute("refused-candidate", {
      objective: "bounded target refusal", reportBack: "none", branchName: "candidatepeer/refused", workspaceName: "refused",
    }, undefined, undefined, createContext({ cwd: "/repo" }).ctx);
    assert.equal(result.isError, true);
    assert.equal(result.details.error, "launch_failed");
    assert.equal(result.details.effectDisposition, "confirmed_no_effects", "launch dispatch only, not admission/worktree effects");
    assert.deepEqual(effects, ["reserved", "bound"]);
    assert.ok(calls.some(({ command, args }) => command === "git" && args.includes("worktree") && args.includes("add")));
    assert.ok(calls.every(({ command, args }) => command === "git" || args[0] === "+help"));
    assert.ok(calls.every(({ args }) => !args.includes("Activate") && !args.includes("sidequest-pi") && args[0] !== "+new-tab"));
    assert.ok(result.details.worktreePath);
    assert.ok(existsSync(result.details.registryPath));
    const registry = JSON.parse(readFileSync(result.details.registryPath, "utf8"));
    assert.equal(registry.admission.admissionId, "cadm-refusal");
    assert.equal(registry.worktreePath, result.details.worktreePath);
    assert.equal(registry.launch.status, "launch_failed");
    assert.equal(registry.launch.effectDisposition, "confirmed_no_effects");
    assert.match(registry.launch.launchNote, /prior bookkeeping.*not global no-effects/);
    assert.ok(registry.cleanupPacket, "retained resources still need owner lifecycle disposition");
    assert.equal(result.details.admissionEffectDisposition, undefined, "do not fabricate a global or admission no-effects receipt");
  } finally { rmSync(stateHome, { recursive: true, force: true }); }
});

for (const surfaceId of ["0", "00", "000000", "0x0", "0x0000", "0X0000", "+0", "-0", " 0 ", "0o0", "0b0", "0000000000000000000000000000"]) {
  test(`zero surface ${JSON.stringify(surfaceId)} refuses before receiver inspection or dispatch`, async () => {
    const outcome = await targetLaunchCase({ env: { GHOSTTY_SURFACE_ID: surfaceId } });
    assertNoSessionDispatch(outcome);
    assert.ok(!outcome.calls.some(({ args }) => args.includes("Describe")));
  });
}
