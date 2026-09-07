// ---
// summary: "verifies exact-process Ghostty present-surface targeting and its fail-closed conditions"
// read_when:
//   - "changing hidden-tab activation or Ghostty D-Bus targeting"
// ---

import assert from "node:assert/strict";
import test from "node:test";
import {
  ghosttyObjectPathForFamily,
  presentGhosttySurface,
} from "../src/common/ghostty-present.mjs";

const busList = [
  ":1.10 4000 ghostty",
  "com.mitchellh.ghostty 4000 ghostty",
  ":1.11 4001 ghostty",
  ":1.12 5000 foot",
].join("\n");

test("object paths follow the admitted Ghostty family", () => {
  assert.equal(ghosttyObjectPathForFamily("main"), "/com/mitchellh/ghostty");
  assert.equal(ghosttyObjectPathForFamily("legacy"), "/com/tryinget/ghosttysidequest");
  assert.equal(ghosttyObjectPathForFamily("other"), "");
});

test("present-surface targets the unique bus name of the proven host process", async () => {
  const calls = [];
  const exec = async (file, args, options) => {
    calls.push([file, args, options.timeout]);
    return { stdout: args[1] === "list" ? busList : "" };
  };
  const env = { DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus" };
  const result = await presentGhosttySurface({
    execFileAsync: exec,
    env,
    hostPid: 4000,
    terminalFamily: "main",
    surfaceId: "0x10",
    timeout: 900,
  });
  assert.deepEqual(result, { ok: true, busName: ":1.10" });
  assert.deepEqual(calls[0], ["busctl", ["--user", "list", "--no-pager", "--no-legend"], 900]);
  assert.deepEqual(calls[1], [
    "busctl",
    [
      "--user",
      "call",
      ":1.10",
      "/com/mitchellh/ghostty",
      "org.gtk.Actions",
      "Activate",
      "sava{sv}",
      "present-surface",
      "1",
      "t",
      "16",
      "0",
    ],
    900,
  ]);
});

test("present-surface fails closed on incomplete targets, missing or ambiguous bus owners, and rejection", async () => {
  const exec = async (_file, args) => ({ stdout: args[1] === "list" ? busList : "" });
  const base = {
    execFileAsync: exec,
    env: {},
    hostPid: 4000,
    terminalFamily: "main",
    surfaceId: "16",
  };
  assert.equal((await presentGhosttySurface({ ...base, terminalFamily: "other" })).ok, false);
  assert.equal((await presentGhosttySurface({ ...base, surfaceId: "0" })).ok, false);
  assert.equal((await presentGhosttySurface({ ...base, surfaceId: "nope" })).ok, false);
  assert.equal((await presentGhosttySurface({ ...base, hostPid: 0 })).ok, false);
  assert.deepEqual(await presentGhosttySurface({ ...base, hostPid: 5001 }), {
    ok: false,
    error: "the Ghostty process is not on the session bus",
  });
  const duplicated = async (_file, args) => ({
    stdout: args[1] === "list" ? `${busList}\n:1.13 4000 ghostty` : "",
  });
  assert.deepEqual(await presentGhosttySurface({ ...base, execFileAsync: duplicated }), {
    ok: false,
    error: "the Ghostty process owns several bus connections",
  });
  const rejecting = async (_file, args) => {
    if (args[1] === "list") return { stdout: busList };
    throw new Error("Unknown method");
  };
  assert.deepEqual(await presentGhosttySurface({ ...base, execFileAsync: rejecting }), {
    ok: false,
    error: "Ghostty rejected present-surface",
  });
  const noBus = async () => {
    throw new Error("busctl missing");
  };
  assert.deepEqual(await presentGhosttySurface({ ...base, execFileAsync: noBus }), {
    ok: false,
    error: "the session bus is unavailable",
  });
});
