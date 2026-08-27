// summary: proves the real SSH visible-peer route survives a long-lived custom Ghostty process and returns a settled handshake.
// read_when:
//   - validating direct Ghostty windows, SSH launch transport, or command-admission handshakes against the workstation.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSidequestExtension } from "../../extensions/sidequest.ts";
import { createContext } from "../sidequest-harness.mjs";

const ghosttyBin = process.env.PI_SIDEQUEST_GHOSTTY_BIN?.trim();
const ghosttyConfig = ghosttyBin
  ? spawnSync(ghosttyBin, ["+show-config"], { encoding: "utf8", timeout: 4_000 })
  : undefined;
const skipReason =
  process.platform !== "linux"
    ? "direct Ghostty window reality check requires Linux"
    : !ghosttyBin || !existsSync(ghosttyBin)
      ? "PI_SIDEQUEST_GHOSTTY_BIN does not name an installed custom Ghostty"
      : !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY
        ? "graphical display selectors are unavailable"
        : ghosttyConfig?.status !== 0 ||
            !/^gtk-single-instance\s*=\s*false$/m.test(ghosttyConfig.stdout)
          ? "custom Ghostty does not expose the original long-lived gtk-single-instance=false trigger"
          : undefined;

function realExec(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeout,
  });
  return Promise.resolve({
    code: result.status ?? (result.signal ? 0 : -1),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    killed: Boolean(result.signal),
  });
}

test(
  "reality: SSH fork-peer routing confirms a detached direct-window command handshake",
  { skip: skipReason },
  async () => {
    const scratch = mkdtempSync(join(tmpdir(), "ghostty-peer-reality-"));
    const childMarker = join(scratch, "child-command-ran");
    const fakePi = join(scratch, "pi-reality-child");
    try {
      writeFileSync(fakePi, `#!/bin/sh\nprintf 'child-ran\\n' > ${JSON.stringify(childMarker)}\n`, {
        mode: 0o700,
      });
      chmodSync(fakePi, 0o700);

      const tools = new Map();
      const execCalls = [];
      const extension = createSidequestExtension({
        registerTools: true,
        env: {
          ...process.env,
          TERM_PROGRAM: undefined,
          GHOSTTY_SURFACE_ID: undefined,
          GHOSTTY_BIN_DIR: undefined,
          SSH_CONNECTION: process.env.SSH_CONNECTION || "termux 42000 steve 22",
          PI_SIDEQUEST_GHOSTTY_BIN: ghosttyBin,
          PI_SIDEQUEST_PI_BIN: fakePi,
          PI_SIDEQUEST_LAUNCH_STAGGER_MS: "0",
        },
      });
      extension({
        getThinkingLevel() {
          return "off";
        },
        exec(command, args, options) {
          execCalls.push({ command, args, options });
          return realExec(command, args, options);
        },
        registerTool(definition) {
          tools.set(definition.name, definition);
        },
        registerCommand() {},
        on() {},
        events: { on: () => () => {}, emit() {} },
      });

      const startedAt = Date.now();
      const result = await tools
        .get("scout_peer_spawn")
        .execute(
          "reality-tool-call",
          { objective: "exercise the real SSH Ghostty transport", reportBack: "none" },
          undefined,
          undefined,
          createContext({ cwd: process.cwd() }).ctx,
        );

      assert.equal(result.details.ok, true, result.content[0]?.text);
      assert.equal(result.details.launchMode, "window");
      assert.equal(result.details.effectDisposition, "settled");
      assert.match(result.details.launchNote, /private handshake/);
      assert.ok(Date.now() - startedAt < 6_000, "launch must beat the old 15-second timeout");
      assert.deepEqual(
        execCalls.map(({ command, args }) => [command, args[0]]),
        [[ghosttyBin, "+help"]],
        "the direct window must use detached production transport rather than awaited pi.exec",
      );

      const deadline = Date.now() + 2_000;
      while (!existsSync(childMarker) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(readFileSync(childMarker, "utf8"), "child-ran\n");
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  },
);
