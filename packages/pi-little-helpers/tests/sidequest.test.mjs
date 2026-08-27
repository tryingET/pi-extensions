// summary: verifies sidequest ghostty selection, tab and window fallback, placement checks, and registered commands and tools.
// read_when:
//   - changing sidequest launch routing, ghostty compatibility, surface attachment, or default registration.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createSidequestExtension,
  getGhosttySurfaceId,
  ghosttyVersionSupportsSurfaceId,
  resolveControllerGhosttyDbusTarget,
  resolveGhosttyBin,
} from "../extensions/sidequest.ts";
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

test("sidequest uses the local wrapper for tab launch when the current Ghostty lacks +new-tab", async () => {
  const execStub = createExecStub(({ command, args }) => {
    if (command === "/usr/bin/ghostty" && args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n" };
    }
    if (isLocalGhosttyWrapper(command) && args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-tab\n  +new-window\n" };
    }
    if (isLocalGhosttyWrapper(command) && args[0] === "+version") {
      return { code: 0, stdout: "Ghostty 1.4.0-sidequest.1\n" };
    }
    if (isLocalGhosttyWrapper(command) && args[0] === "+new-tab") {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${command} ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      GHOSTTY_SURFACE_ID: "0x1234",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: "/usr/bin/ghostty",
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty" || isLocalGhosttyWrapper(path) || isLocalGhosttyBin(path);
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
      [LOCAL_GHOSTTY_WRAPPER, "+help"],
      [LOCAL_GHOSTTY_WRAPPER, "+version"],
      [LOCAL_GHOSTTY_WRAPPER, "+new-tab"],
    ],
  );

  const launchArgs = execStub.calls[3].args;
  assert.equal(launchArgs[0], "+new-tab");
  assert.ok(launchArgs.includes("--surface-id=0x1234"));
  assert.match(extractShellCommand(launchArgs), /cd '\/repo'/);
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
  assert.match(harness.notifications[0].message, /current Ghostty tab/);
  assert.match(harness.notifications[0].message, /used sidequest wrapper/);
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

test("sidequest uses the Ghostty sidequest wrapper to open a same-window tab even when GHOSTTY_SURFACE_ID is absent", async () => {
  const execStub = createExecStub(({ command, args }) => {
    if (isLocalGhosttyWrapper(command) && args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
    }
    if (isLocalGhosttyWrapper(command) && args[0] === "+new-tab") {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${command} ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      PI_SIDEQUEST_PI_BIN: "pi",
    },
    currentSessionGhosttyBin: LOCAL_GHOSTTY_BIN,
    exec: execStub.exec,
    pathExists(path) {
      return path === "/usr/bin/ghostty" || isLocalGhosttyWrapper(path) || isLocalGhosttyBin(path);
    },
  });
  const { commands } = registerExtension(extension);
  const sidequest = commands.get("sidequest");
  const harness = createContext();

  await sidequest.handler("missing surface id", harness.ctx);

  assert.deepEqual(
    execStub.calls.map(({ command, args }) => [command, args[0]]),
    [
      [execStub.calls[0].command, "+help"],
      [execStub.calls[1].command, "+new-tab"],
    ],
  );
  assert.ok(isLocalGhosttyWrapper(execStub.calls[0].command));
  assert.ok(!execStub.calls[1].args.some((arg) => arg.startsWith("--surface-id=")));
  assert.ok(!execStub.calls[1].args.some((arg) => arg.startsWith("--title=")));
  assert.match(
    extractShellCommand(execStub.calls[1].args),
    /PI_SESSION_PRESENCE_TITLE_BASE='Sidequest: missing surface id'/,
  );
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "info");
  assert.match(harness.notifications[0].message, /current Ghostty tab/);
});

test("sidequest does not duplicate a peer after a nonzero same-window launcher exit", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
    }
    if (args[0] === "+version") {
      return { code: 0, stdout: "Ghostty 1.4.0\n" };
    }
    if (args[0] === "+new-tab") {
      return {
        code: 1,
        stderr: "warning(gtk_ghostty_application): new-tab: unable to create tab",
      };
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
      GHOSTTY_SURFACE_ID: "0x2b2826e0",
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

  await sidequest.handler("open the fallback", harness.ctx);

  assert.deepEqual(
    execStub.calls.map(({ command, args }) => [command, args[0]]),
    [
      ["/usr/bin/ghostty", "+help"],
      ["/usr/bin/ghostty", "+version"],
      ["/usr/bin/ghostty", "+new-tab"],
    ],
  );
  assert.ok(execStub.calls[2].args.includes("--surface-id=0x2b2826e0"));
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "error");
  assert.match(harness.notifications[0].message, /effect is indeterminate/);
  assert.match(harness.notifications[0].message, /do not retry automatically/);
});

test("sidequest keeps the launch in the current Ghostty tab when live tab attach succeeds", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
    }
    if (args[0] === "+version") {
      return { code: 0, stdout: "Ghostty 1.4.0\n" };
    }
    if (args[0] === "+new-tab") {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      GHOSTTY_SURFACE_ID: "19",
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

  await sidequest.handler("stay in this window", harness.ctx);

  assert.deepEqual(
    execStub.calls.map(({ command, args }) => [command, args[0]]),
    [
      ["/usr/bin/ghostty", "+help"],
      ["/usr/bin/ghostty", "+version"],
      ["/usr/bin/ghostty", "+new-tab"],
    ],
  );
  assert.ok(execStub.calls[2].args.includes("--surface-id=19"));
  assert.match(extractShellCommand(execStub.calls[2].args), /cd '\/repo'/);
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "info");
  assert.match(harness.notifications[0].message, /current Ghostty tab/);
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
          ":1.42 111 ghostty user :1.42 user@1000.service - -\n" +
          ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
          "com.tryinget.ghosttysidequest 222 ghostty user :1.43 user@1000.service - -\n",
      };
    }
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
      return pid === 222 ? LOCAL_GHOSTTY_BIN : undefined;
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
    ({ command, args }) => command === "busctl" && args[1] === "call",
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
      ({ command, args }) => isLocalGhosttyWrapper(command) && args[0] === "+new-tab",
    ),
  );
  assert.match(harness.notifications[0].message, /current Ghostty tab/);
  assert.match(harness.notifications[0].message, /targeted Ghostty single-instance process 222/);
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
      return pid === 222 ? LOCAL_GHOSTTY_ORIGIN_MAIN_BIN : undefined;
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
    ({ command, args }) => command === "busctl" && args[1] === "call",
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
      ({ command, args }) => command === LOCAL_GHOSTTY_ORIGIN_MAIN_BIN && args[0] === "+new-tab",
    ),
  );
  assert.match(harness.notifications[0].message, /targeted Ghostty single-instance process 222/);
});

test("normal targeting rejects a stale packaged owner for an origin/main controller", async () => {
  const target = await resolveControllerGhosttyDbusTarget({
    controllerGhostty: { pid: 111, exe: LOCAL_GHOSTTY_ORIGIN_MAIN_BIN },
    surfaceId: "0x1234",
    readProcessExecutable(pid) {
      return pid === 222 ? "/usr/bin/ghostty" : undefined;
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
          ":1.42 111 ghostty user :1.42 user@1000.service - -\n" +
          ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
          "com.tryinget.ghosttysidequest 222 ghostty user :1.43 user@1000.service - -\n",
      };
    }
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
      return pid === 222 ? LOCAL_GHOSTTY_BIN : undefined;
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

  assert.ok(execStub.calls.some(({ command, args }) => command === "busctl" && args[1] === "call"));
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
    const execStub = createExecStub(({ args }) => {
      if (args[0] === "+help") {
        return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
      }
      if (args[0] === "+version") {
        return { code: 0, stdout: "Ghostty 1.4.0\n" };
      }
      if (args[0] === "+new-tab") {
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

test("sidequest omits surface-id for Ghostty builds before the action flag exists", async () => {
  const execStub = createExecStub(({ args }) => {
    if (args[0] === "+help") {
      return { code: 0, stdout: "Available actions:\n  +new-window\n  +new-tab\n" };
    }
    if (args[0] === "+version") {
      return { code: 0, stdout: "Ghostty 1.3.2-dev+0000000\n" };
    }
    if (args[0] === "+new-tab") {
      return { code: 0, stdout: "" };
    }
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });

  const extension = createSidequestExtension({
    registerTools: true,
    env: {
      TERM_PROGRAM: "ghostty",
      GHOSTTY_BIN_DIR: "/usr/bin",
      GHOSTTY_SURFACE_ID: "19",
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

  await sidequest.handler("avoid unsupported surface flag", harness.ctx);

  const launchCall = execStub.calls.find(
    (call) => call.command === "/usr/bin/ghostty" && call.args[0] === "+new-tab",
  );
  assert.ok(launchCall);
  assert.ok(!launchCall.args.some((arg) => arg.startsWith("--surface-id=")));
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

test("handoff-tab launches a clean Pi session and auto-submits exactly one generated prompt", async () => {
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
    if (args[0] === "+new-tab") return { code: 0, stdout: "" };
    throw new Error(`Unexpected Ghostty args: ${args.join(" ")}`);
  });
  const extension = createSidequestExtension({
    env: {
      TERM_PROGRAM: "ghostty",
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

  await commands.get("handoff-tab").handler("Implement task 4660", harness.ctx);

  assert.equal(generationCalls.length, 1);
  assert.equal(generationCalls[0].ctx, harness.ctx);
  assert.equal(generationCalls[0].goal, "Implement task 4660");
  assert.match(generationCalls[0].runtimeContext, /Git HEAD/);
  assert.match(generationCalls[0].runtimeContext, /abc123/);
  assert.match(generationCalls[0].runtimeContext, /AK ready tasks/);
  assert.match(generationCalls[0].runtimeContext, /4660/);
  const launch = execStub.calls.find(({ args }) => args[0] === "+new-tab");
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
  assert.equal(harness.notifications.length, 1);
  assert.equal(harness.notifications[0].type, "info");
  assert.match(harness.notifications[0].message, /clean Pi session/);
  assert.match(harness.notifications[0].message, /auto-submitted one generated handoff/);
  assert.match(harness.notifications[0].message, /current Ghostty tab/);
});

test("handoff-tab works without arguments and reports a truthful new-window fallback", async () => {
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

  await commands.get("handoff-tab").handler("", harness.ctx);

  assert.equal(generationCalls.length, 1);
  assert.match(generationCalls[0].goal, /unfinished operator-directed work/);
  const launch = execStub.calls.find(({ args }) => args[0]?.startsWith("--working-directory="));
  assert.ok(launch);
  assert.equal(extractPiArgs(launch.args).includes("--fork"), false);
  assert.equal(extractPiArgs(launch.args).at(-1), generatedPrompt);
  assert.equal(harness.notifications.length, 1);
  assert.match(harness.notifications[0].message, /new Ghostty window/);
  assert.match(harness.notifications[0].message, /does not support \+new-tab/);
});

test("handoff-tab does not launch when owner-scoped prompt generation fails", async () => {
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

  await commands.get("handoff-tab").handler("continue", harness.ctx);

  assert.equal(execStub.calls.length, 4);
  assert.ok(execStub.calls.every(({ command }) => command === "git" || command === "ak"));
  assert.deepEqual(harness.notifications, [
    {
      type: "error",
      message: "handoff-tab could not generate a handoff: model unavailable",
    },
  ]);
});

test("sidequest defaults to slash commands, visible-loop, and standard peer-spawn tools", () => {
  const extension = createSidequestExtension();
  const { commands, tools } = registerExtension(extension);

  assert.ok(commands.has("sidequest"));
  assert.equal(commands.has("forkpeer"), false);
  assert.ok(commands.has("scoutpeer"));
  assert.equal(commands.has("candidatepeer"), false);
  assert.ok(commands.has("parallelquest"));
  assert.ok(commands.has("handoff-tab"));
  assert.ok(commands.has("visible-loop"));
  assert.ok(commands.has("nexus-loop"));
  assert.ok(commands.has("visible-loop-child"));
  assert.ok(commands.has("visible-loop-child-complete"));
  assert.ok(tools.has("fork_peer_spawn"));
  assert.ok(tools.has("scout_peer_spawn"));
  assert.ok(tools.has("candidate_peer_spawn"));
  assert.ok(tools.has("candidate_peer_cleanup"));
  assert.ok(tools.has("candidate_peer_closeout"));

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
});
