// summary: "Gherkin contract: visible +new-tab must hit the originating Ghostty process, not the focused daemon window."
// read_when:
//   - "dispatch_subagent / sidequest tabs land in the wrong Ghostty window."
//   - "Changing resolveControllerGhosttyDbusTarget independent-instance targeting."

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSidequestExtension, resolveControllerGhosttyDbusTarget } from "../extensions/sidequest.ts";
import { createContext, LOCAL_GHOSTTY_ORIGIN_MAIN_BIN, registerExtension } from "./sidequest-harness.mjs";

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
        return pid === 111 || pid === 222 ? ORIGIN_EXE : undefined;
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
          return pid === 111 || pid === 222 ? ORIGIN_EXE : undefined;
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

const daemonRows = ":1.43 222 ghostty user :1.43 unit - -\ncom.mitchellh.ghostty 222 ghostty user :1.43 unit - -\n";
const originRow = ":1.99 111 ghostty user :1.99 unit - -\n";
const readableBuild = (pid) => pid === 111 || pid === 222 ? ORIGIN_EXE : undefined;

for (const surfaceId of ["1", "18446744073709551615", "0x1234"]) {
  test(`independent originator needs no daemon and preserves uint64 ${surfaceId}`, async () => {
    const target = await resolveControllerGhosttyDbusTarget({
      controllerGhostty: { pid: 111, exe: ORIGIN_EXE }, surfaceId,
      readProcessExecutable: readableBuild,
      execRunner: busctlList(originRow + "com.example.Inactive - - - - - - -\n"),
    });
    assert.equal(target?.ownerPid, 111);
    assert.equal(target?.busName, ":1.99");
    assert.equal(target?.surfaceId, BigInt(surfaceId).toString());
  });
}

const refusalCases = [
  ...["0", "00", "000000", "0x0", "0x0000", "0X0000", "+0", "-0", " 0 ", "0o0", "0b0", "0000000000000000000000000000"].map((surfaceId) => ({ name: `zero/no-target representation ${surfaceId}`, surfaceId })),
  { name: "missing controller", controllerGhostty: undefined },
  ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "111"].map((pid) => ({ name: `invalid PID ${pid}`, controllerGhostty: { pid, exe: ORIGIN_EXE } })),
  { name: "unreadable controller is not a stub", read: (pid) => pid === 222 ? ORIGIN_EXE : undefined },
  { name: "mismatched controller build", read: (pid) => pid === 111 ? "/usr/bin/ghostty" : ORIGIN_EXE },
  { name: "throwing identity read", read() { throw new Error("readback unavailable"); } },
  { name: "relative executable", controllerGhostty: { pid: 111, exe: "ghostty" } },
  { name: "unknown executable family", controllerGhostty: { pid: 111, exe: "/custom/ghostty" } },
  ...[undefined, "", "-1", "18446744073709551616", " 1", "+1", "wat"].map((surfaceId) => ({ name: `invalid surface ${surfaceId}`, surfaceId })),
  { name: "empty listing", rows: "" },
  { name: "malformed row", rows: "not a bus row\n" + daemonRows },
  { name: "internal blank row", rows: originRow + "\n" + daemonRows },
  { name: "duplicate unique row", rows: originRow + originRow + daemonRows },
  { name: "duplicate well-known row", rows: daemonRows + "com.mitchellh.ghostty 222 ghostty user :1.43 unit - -\n" },
  { name: "ambiguous originator", rows: originRow + ":1.98 111 ghostty user :1.98 unit - -\n" + daemonRows },
  { name: "ambiguous daemon", rows: daemonRows + ":1.44 222 ghostty user :1.44 unit - -\n" },
  { name: "partial numeric PID", rows: daemonRows.replace("222", "222junk") },
  { name: "unsafe PID", rows: daemonRows.replaceAll("222", "9007199254740992") },
  { name: "owner PID disagrees with connection", rows: daemonRows.replace("com.mitchellh.ghostty 222", "com.mitchellh.ghostty 333") },
  { name: "unique connection differs", rows: originRow.replace("user :1.99", "user :1.98") + daemonRows },
  { name: "missing daemon unique connection", rows: daemonRows.split("\n").slice(1).join("\n") },
  { name: "nameless controller cannot own daemon", rows: "com.mitchellh.ghostty 111 ghostty user :1.43 unit - -\n" },
  { name: "unreadable daemon", read: (pid) => pid === 111 ? ORIGIN_EXE : undefined },
  { name: "stale daemon build", read: (pid) => pid === 111 ? ORIGIN_EXE : "/usr/bin/ghostty" },
  { name: "no cross-family fallback", rows: daemonRows.replace("com.mitchellh.ghostty", "com.tryinget.ghosttysidequest") },
  { name: "failed bus command", result: { code: 1, stdout: daemonRows } },
  { name: "killed bus readback", result: { code: 0, killed: true, stdout: daemonRows } },
  { name: "nontext bus readback", result: { code: 0, stdout: null } },
];
for (const item of refusalCases) {
  test(`resolver refuses ${item.name} without dispatch`, async () => {
    const calls = [];
    const target = await resolveControllerGhosttyDbusTarget({
      controllerGhostty: Object.hasOwn(item, "controllerGhostty") ? item.controllerGhostty : { pid: 111, exe: ORIGIN_EXE },
      surfaceId: Object.hasOwn(item, "surfaceId") ? item.surfaceId : SURFACE,
      readProcessExecutable: item.read ?? readableBuild,
      execRunner: async (command, args) => {
        calls.push({ command, args });
        assert.equal(command, "busctl");
        assert.deepEqual(args, ["--user", "list", "--no-pager", "--no-legend"]);
        return item.result ?? { code: 0, stdout: item.rows ?? daemonRows };
      },
    });
    assert.equal(target, undefined);
    assert.ok(calls.every(({ args }) => args[1] === "list"));
  });
}
test("resolver refuses a selected owner disappearing during executable recheck", async () => {
  let daemonReads = 0;
  const target = await resolveControllerGhosttyDbusTarget({
    controllerGhostty: { pid: 111, exe: ORIGIN_EXE }, surfaceId: SURFACE,
    readProcessExecutable(pid) { return pid === 111 || (pid === 222 && ++daemonReads === 1) ? ORIGIN_EXE : undefined; },
    execRunner: busctlList(daemonRows),
  });
  assert.equal(target, undefined);
  assert.equal(daemonReads, 2);
});

// Source-only AK5638 regression proposal. Effects: private cwd, real timers, fake exec.
// Uses the production registered scout -> launchPiQuestSession -> shared queue path;
// no candidate admission/Git operations, copied queue, global permissive stub or test import.
for (const scenario of ["Describe refusal", "identity drift", "activation throw", "pending transport"]) {
  test(`enabled stagger: ${scenario} releases a queued successor`, {
    skip: process.platform !== "linux" ? "Linux Ghostty routing required" : false,
    timeout: 8000,
  }, async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-ghostty-stagger-followup-"));
    const staggerMs = 30;
    const calls = [];
    const starts = [];
    const events = [];
    const pending = [];
    let firstSettled = false;
    let drift = false;
    let releaseDescribe, announceDescribe, announceSuccessorIdentity, releaseTransport;
    const describeGate = new Promise((resolve) => { releaseDescribe = resolve; });
    const described = new Promise((resolve) => { announceDescribe = resolve; });
    const successorIdentity = new Promise((resolve) => { announceSuccessorIdentity = resolve; });
    const transportGate = new Promise((resolve) => { releaseTransport = resolve; });
    // Bounded waits fail rather than hiding a stuck queue; every watchdog is cleared.
    const wait = async (promise, label) => {
      let timer;
      try {
        return await Promise.race([promise, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`timed out: ${label}`)), 1500);
        })]);
      } finally { clearTimeout(timer); }
    };
    const spawn = (attempt) => {
      const first = attempt === "first";
      const exec = (command, args) => {
        calls.push({ attempt, command, args: [...args] });
        if (command === "/usr/bin/ghostty" && args.length === 1 && args[0] === "+help") {
          return Promise.resolve({ code: 0, stdout: "+new-tab\n+new-window\n" });
        }
        if (command === "busctl" && args[1] === "list") {
          assert.deepEqual(args, ["--user", "list", "--no-pager", "--no-legend"]);
          if (!first) announceSuccessorIdentity();
          return Promise.resolve({ code: 0, stdout: ":1.11 111 ghostty user :1.11 unit - -\n" });
        }
        if (command === "busctl" && args.includes("Describe")) {
          assert.deepEqual(args, ["--user", "call", ":1.11", "/com/mitchellh/ghostty",
            "org.gtk.Actions", "Describe", "s", "new-tab"]);
          events.push(`${attempt}:Describe`);
          if (first) {
            announceDescribe();
            return describeGate.then(() => {
              events.push("first:inspection-released");
              if (scenario === "identity drift") drift = true;
              return { code: 0, stdout: scenario === "Describe refusal"
                ? '(bgav) false "(tas)" 0' : '(bgav) true "(tas)" 0' };
            });
          }
          return Promise.resolve({ code: 0, stdout: '(bgav) true "(tas)" 0' });
        }
        if (command === "busctl" && args.includes("Activate")) {
          starts.push({ attempt, at: performance.now(), args: [...args] });
          events.push(`${attempt}:transport-start`);
          assert.deepEqual(args.slice(0, 12), ["--user", "call", "--expect-reply=no",
            ":1.11", "/com/mitchellh/ghostty", "org.gtk.Actions", "Activate",
            "sava{sv}", "new-tab", "1", "(tas)", "19"]);
          assert.ok(args.includes("sidequest-pi"));
          assert.ok(args.some((arg) => arg.includes(`AK5638 ${attempt} objective`)));
          if (first && scenario === "activation throw") throw new Error("synthetic activation throw");
          if (first && scenario === "pending transport") return transportGate;
          return Promise.resolve({ code: 0, stdout: "" });
        }
        // Record before throwing: production catches exec errors, so assert the call allowlist below.
        throw new Error(`unexpected execution: ${command} ${args.join(" ")}`);
      };
      const { tools } = registerExtension(createSidequestExtension({
        registerTools: true, registerCommands: false,
        env: { TERM_PROGRAM: "ghostty", GHOSTTY_BIN_DIR: "/usr/bin", GHOSTTY_SURFACE_ID: "19",
          PI_SIDEQUEST_PI_BIN: "pi", PI_SIDEQUEST_LAUNCH_STAGGER_MS: String(staggerMs),
          XDG_STATE_HOME: cwd, XDG_RUNTIME_DIR: cwd },
        currentSessionGhosttyBin: "/usr/bin/ghostty",
        currentGhosttyAncestor: { pid: 111, exe: "/usr/bin/ghostty" },
        readProcessExecutable: (pid) => pid === 111
          ? first && drift ? "/different/ghostty" : "/usr/bin/ghostty" : undefined,
        pathExists: (path) => path === "/usr/bin/ghostty",
        placementVerificationTimeoutMs: 0,
        exec,
        detachedGhosttyWindowLaunch: async () => {
          events.push(`${attempt}:forbidden-window`);
          throw new Error("no window escape permitted in these tab scenarios");
        },
      }));
      const tool = tools.get("scout_peer_spawn");
      assert.ok(tool, "exercise the registered production launch adapter");
      return tool.execute(`AK5638-${attempt}`, {
        objective: `AK5638 ${attempt} objective`, cwd, reportBack: "none",
      }, undefined, undefined, createContext({ cwd }).ctx);
    };
    try {
      const first = spawn("first");
      // Attach rejection handlers immediately, including on early assertion-failure paths.
      pending.push(first);
      void first.then(() => { firstSettled = true; events.push("first:settled"); },
        () => { firstSettled = true; events.push("first:rejected"); });
      await wait(described, "first Describe");
      const successor = spawn("successor");
      pending.push(successor);
      void successor.catch(() => {});
      await wait(successorIdentity, "successor pre-slot identity read");
      await new Promise((resolve) => setTimeout(resolve, staggerMs * 3));
      assert.deepEqual(events, ["first:Describe"], "queued successor cannot inspect while first holds the slot");
      assert.equal(starts.length, 0, "neither session transport is admitted during held inspection");
      releaseDescribe();

      // Must finish while first transport is still deliberately unresolved in pending mode.
      const secondResult = await wait(successor, "successor completion before releasing first transport");
      events.push("successor:settled");
      assert.equal(secondResult.details.ok, true);
      assert.equal(secondResult.details.effectDisposition, "settled");
      assert.equal(secondResult.details.launchMode, "tab");
      if (scenario === "pending transport") {
        assert.equal(firstSettled, false, "stagger serializes transport starts, not transport settlement");
        assert.deepEqual(starts.map(({ attempt }) => attempt), ["first", "successor"]);
        assert.ok(events.indexOf("successor:transport-start") > events.indexOf("first:transport-start"));
        releaseTransport({ code: 0, stdout: "" });
      }
      const firstResult = await wait(first, "first completion");
      if (scenario === "Describe refusal" || scenario === "identity drift") {
        assert.equal(firstResult.details.ok, false);
        assert.equal(firstResult.details.effectDisposition, "confirmed_no_effects");
        assert.match(firstResult.details.error, /^launch_failed$/);
        assert.match(firstResult.content[0].text, scenario === "Describe refusal"
          ? /action capability unavailable/ : /identity changed during capability inspection/);
        assert.deepEqual(starts.map(({ attempt }) => attempt), ["successor"],
          "refused attempt has zero session dispatches; only successor transport starts");
      } else {
        assert.deepEqual(starts.map(({ attempt }) => attempt), ["first", "successor"]);
        assert.ok(starts[1].at - starts[0].at >= staggerMs,
          "actual transport invocation timestamps retain nonzero configured spacing");
        assert.equal(firstResult.details.ok, scenario === "pending transport");
        assert.equal(firstResult.details.effectDisposition,
          scenario === "pending transport" ? "settled" : "effect_indeterminate");
        if (scenario === "activation throw") {
          assert.match(firstResult.content[0].text, /synthetic activation throw/);
          assert.ok(events.indexOf("first:settled") < events.indexOf("successor:transport-start"),
            "throwing first transport settles without wedging the spaced successor");
        } else assert.ok(events.indexOf("successor:settled") < events.indexOf("first:settled"),
          "successor both dispatches and settles before first transport settles");
      }
      assert.deepEqual(events.filter((event) => event.endsWith(":Describe")),
        ["first:Describe", "successor:Describe"]);
      assert.ok(events.indexOf("successor:Describe") > events.indexOf("first:inspection-released"));
      assert.ok(!events.some((event) => event.endsWith(":forbidden-window")));
      assert.ok(calls.every(({ command, args }) =>
        (command === "/usr/bin/ghostty" && args.length === 1 && args[0] === "+help") ||
        (command === "busctl" && (args[1] === "list" || args.includes("Describe") || args.includes("Activate")))),
      "no native/probe/Git/other dispatch path is silently swallowed by production error handling");
      const inspections = calls.filter(({ args }) => !args.includes("Activate"));
      assert.ok(inspections.every(({ args }) => !args.includes("sidequest-pi") &&
        !args.some((arg) => arg.includes("AK5638 first objective") || arg.includes("AK5638 successor objective"))),
      "read-only inspections never carry session payload");
    } finally {
      // Release fixture-owned gates, but retain cwd if activity cannot be drained.
      // Timeout/rejection is not disposal proof: observe outer test-process teardown
      // before any separately authorized cleanup of an unresolved fixture directory.
      releaseDescribe();
      announceDescribe();
      announceSuccessorIdentity();
      releaseTransport({ code: 0, stdout: "" });
      await wait(Promise.allSettled(pending), "cleanup drain");
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
