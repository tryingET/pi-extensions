// summary: "Gherkin contract: visible +new-tab must hit the originating Ghostty process, not the focused daemon window."
// read_when:
//   - "dispatch_subagent / sidequest tabs land in the wrong Ghostty window."
//   - "Changing resolveControllerGhosttyDbusTarget independent-instance targeting."

import assert from "node:assert/strict";
import test from "node:test";

import { resolveControllerGhosttyDbusTarget } from "../extensions/sidequest.ts";
import { LOCAL_GHOSTTY_ORIGIN_MAIN_BIN } from "./sidequest-harness.mjs";

const ORIGIN_EXE = LOCAL_GHOSTTY_ORIGIN_MAIN_BIN;
const SURFACE = "0x4cfb647662b86951";

function busctlList(stdout) {
  return async (command, args) => {
    assert.equal(command, "busctl");
    assert.equal(args[1], "list");
    return { code: 0, stdout };
  };
}

test("Feature: dispatch_subagent opens a tab on the originating Ghostty window", async (t) => {
  await t.test(
    "Scenario: independent gtk-single-instance=false parent shares a build with the daemon",
    async () => {
      // Given a well-known daemon at pid 222 and an originating Ghostty at pid 111
      // And both resolve to the same origin/main executable
      // When the parent Pi asks for +new-tab with its own surface id
      // Then the D-Bus target is the originating process, not the daemon
      const target = await resolveControllerGhosttyDbusTarget({
        controllerGhostty: { pid: 111, exe: ORIGIN_EXE },
        surfaceId: SURFACE,
        readProcessExecutable(pid) {
          return pid === 111 || pid === 222 ? ORIGIN_EXE : undefined;
        },
        execRunner: busctlList(
          ":1.99 111 ghostty user :1.99 user@1000.service - -\n" +
            ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
            "com.mitchellh.ghostty 222 ghostty user :1.43 user@1000.service - -\n",
        ),
      });

      assert.deepEqual(target, {
        busName: ":1.99",
        ownerPid: 111,
        surfaceId: "5547137825662069073",
        wellKnownName: "com.mitchellh.ghostty",
        objectPath: "/com/mitchellh/ghostty",
      });
    },
  );

  await t.test("Scenario: parent is the well-known single-instance owner", async () => {
    // Given the Pi session already lives inside the daemon process
    // When +new-tab is resolved
    // Then the target remains that owner
    const target = await resolveControllerGhosttyDbusTarget({
      controllerGhostty: { pid: 222, exe: ORIGIN_EXE },
      surfaceId: "4660",
      readProcessExecutable(pid) {
        return pid === 222 ? ORIGIN_EXE : undefined;
      },
      execRunner: busctlList(
        ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
          "com.mitchellh.ghostty 222 ghostty user :1.43 user@1000.service - -\n",
      ),
    });

    assert.equal(target?.busName, ":1.43");
    assert.equal(target?.ownerPid, 222);
  });

  await t.test(
    "Scenario: nameless launcher stub still falls back to the exact-build daemon",
    async () => {
      // Given the nearest Ghostty ancestor has no unique bus name
      // And the well-known owner is the same origin/main build
      // Then keep the historical stub fallback so +new-tab still reaches the server
      const target = await resolveControllerGhosttyDbusTarget({
        controllerGhostty: { pid: 111, exe: ORIGIN_EXE },
        surfaceId: "4660",
        readProcessExecutable(pid) {
          return pid === 222 ? ORIGIN_EXE : undefined;
        },
        execRunner: busctlList(
          ":1.43 222 ghostty user :1.43 user@1000.service - -\n" +
            "com.mitchellh.ghostty 222 ghostty user :1.43 user@1000.service - -\n",
        ),
      });

      assert.equal(target?.busName, ":1.43");
      assert.equal(target?.ownerPid, 222);
    },
  );
});
