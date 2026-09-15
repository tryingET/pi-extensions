// summary: "Reality-anchored assertion: recognized controllers require independently checked originating/stub identity, and the normal broker is the installed origin/main build."
// read_when:
//   - "Verifying observer / sidequest tab targeting against real coexisting Ghostty brokers."
//   - "Changing resolveControllerGhosttyDbusTarget or executable-family endpoint selection."
//
// Excluded from the default package gate because it requires a real Linux Ghostty desktop.
// Run on the workstation with: `npm run reality:check`.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import test from "node:test";
import {
  findGhosttyAncestor,
  resolveControllerGhosttyDbusTarget,
} from "../../extensions/sidequest.ts";

const NORMAL_ENDPOINT = {
  wellKnownName: "com.mitchellh.ghostty",
  objectPath: "/com/mitchellh/ghostty",
};
const LEGACY_ENDPOINT = {
  wellKnownName: "com.tryinget.ghosttysidequest",
  objectPath: "/com/tryinget/ghosttysidequest",
};
const PROBE_TIMEOUT_MS = 4000;

function realExecRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeout ?? PROBE_TIMEOUT_MS,
    ...options,
  });
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    killed: result.signal === "SIGTERM",
  };
}

function busctlListRows() {
  const result = spawnSync("busctl", ["--user", "list", "--no-pager", "--no-legend"], {
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
  });
  if (result.status !== 0) return null;
  const parsed = result.stdout
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/));
  const names = parsed.map((fields) => fields[0]);
  assert.ok(result.stdout.trim(), "empty listing is not absence evidence");
  assert.equal(new Set(names).size, names.length, "duplicate bus names invalidate the observation");
  for (const fields of parsed) {
    assert.ok(fields.length >= 5, "malformed bus row");
    const [name, pid, , , connection] = fields;
    assert.match(
      name,
      /^(?::[0-9]+\.[0-9]+|[A-Za-z_-][A-Za-z0-9_-]*(?:\.[A-Za-z_-][A-Za-z0-9_-]*)+)$/,
    );
    if (
      pid === "-" &&
      (connection === "-" || connection === "(activatable)") &&
      !name.startsWith(":")
    )
      continue;
    assert.match(pid, /^[1-9][0-9]*$/);
    assert.ok(Number.isSafeInteger(Number(pid)));
    if (name === "org.freedesktop.DBus" && connection === "-") continue;
    assert.match(connection, /^:[0-9]+\.[0-9]+$/);
    if (name.startsWith(":")) assert.equal(connection, name);
    const linked = parsed.filter((entry) => entry[0] === connection);
    assert.equal(linked.length, 1, "connection must be present exactly once");
    assert.equal(linked[0][1], pid, "connection and named owner must agree");
  }
  return parsed;
}

function wellKnownOwnerPid(rows, wellKnownName) {
  return rows
    .filter((fields) => fields[0] === wellKnownName)
    .map((fields) => Number.parseInt(fields[1] || "", 10))
    .find((pid) => Number.isInteger(pid) && pid > 0);
}

function pidForUniqueName(rows, busName) {
  const match = rows.find((fields) => fields[0] === busName);
  return match ? Number.parseInt(match[1] || "", 10) : undefined;
}

function uniqueNamesForPid(rows, pid) {
  return rows
    .filter((fields) => fields[0]?.startsWith(":") && Number.parseInt(fields[1] || "", 10) === pid)
    .map((fields) => fields[0]);
}

function expectedReceiver(rows, controller) {
  const { pid, exe } = controller.ancestor;
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  assert.equal(readlinkSync(`/proc/${pid}/exe`), exe, "controller must be positively readable");
  assert.match(controller.surfaceId, /^(?:[0-9]+|0x[0-9a-f]+)$/i);
  const surface = BigInt(controller.surfaceId);
  assert.ok(
    surface > 0n && surface <= 18446744073709551615n,
    "zero invokes receiver fallback, not a target",
  );
  const ownNames = uniqueNamesForPid(rows, pid);
  assert.ok(ownNames.length <= 1, "ambiguous originator is not a nameless stub");
  if (ownNames.length === 1) return { pid, busName: ownNames[0], surfaceId: surface.toString() };
  const daemonPid = wellKnownOwnerPid(rows, controller.endpoint.wellKnownName);
  assert.ok(
    daemonPid && daemonPid !== pid,
    "nameless stub needs a distinct positively known daemon",
  );
  const daemonNames = uniqueNamesForPid(rows, daemonPid);
  assert.equal(daemonNames.length, 1);
  assert.equal(readlinkSync(`/proc/${daemonPid}/exe`), exe, "same family alone is insufficient");
  return { pid: daemonPid, busName: daemonNames[0], surfaceId: surface.toString() };
}

function livePiPids() {
  const result = spawnSync("pgrep", ["-x", "pi"], { encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function readEnvSurfaceId(pid) {
  try {
    const environ = readFileSync(`/proc/${pid}/environ`, "utf8");
    const entry = environ.split("\0").find((line) => line.startsWith("GHOSTTY_SURFACE_ID="));
    return entry?.slice("GHOSTTY_SURFACE_ID=".length).trim();
  } catch {
    return undefined;
  }
}

function endpointForExecutable(executable) {
  if (executable === "/usr/bin/ghostty") return NORMAL_ENDPOINT;
  const prefix = `${homedir()}/.local/opt/`;
  if (!executable.startsWith(prefix)) return undefined;
  const relative = executable.slice(prefix.length);
  if (/^ghostty-sidequest[^/]*\/bin\/ghostty$/.test(relative)) return LEGACY_ENDPOINT;
  if (/^ghostty-origin-main\/[^/]+\/bin\/ghostty$/.test(relative)) return NORMAL_ENDPOINT;
  return undefined;
}

const rows = busctlListRows();
const baseSkip =
  process.platform !== "linux"
    ? "reality assertion requires Linux"
    : rows
      ? undefined
      : "busctl --user list unavailable";

const recognizedLiveControllers = baseSkip
  ? []
  : livePiPids().flatMap((pid) => {
      const surfaceId = readEnvSurfaceId(pid);
      const ancestor = findGhosttyAncestor(pid);
      const endpoint = ancestor?.exe ? endpointForExecutable(ancestor.exe) : undefined;
      return surfaceId && ancestor?.exe && endpoint ? [{ pid, surfaceId, ancestor, endpoint }] : [];
    });

test(
  "reality: every recognized live Pi controller resolves only its executable-family broker",
  {
    skip:
      baseSkip ??
      (recognizedLiveControllers.length === 0
        ? "no recognized live Ghostty Pi controllers"
        : undefined),
  },
  async () => {
    const familyCounts = new Map();
    for (const controller of recognizedLiveControllers) {
      const expected = expectedReceiver(rows, controller);
      const target = await resolveControllerGhosttyDbusTarget({
        execRunner: realExecRunner,
        controllerGhostty: controller.ancestor,
        surfaceId: controller.surfaceId,
      });
      assert.ok(
        target,
        `pi ${controller.pid}: recognized ${controller.ancestor.exe} controller must resolve exactly`,
      );
      assert.equal(target.busName, expected.busName);
      assert.equal(target.surfaceId, expected.surfaceId);
      assert.equal(readlinkSync(`/proc/${target.ownerPid}/exe`), controller.ancestor.exe);
      assert.equal(target.wellKnownName, controller.endpoint.wellKnownName);
      assert.equal(target.objectPath, controller.endpoint.objectPath);
      assert.equal(pidForUniqueName(rows, target.busName), expected.pid);
      familyCounts.set(
        controller.endpoint.wellKnownName,
        (familyCounts.get(controller.endpoint.wellKnownName) ?? 0) + 1,
      );
    }
    assert.ok(
      [...familyCounts.values()].reduce((sum, count) => sum + count, 0) >= 1,
      "at least one recognized controller must be asserted",
    );
    console.log(
      `reality: controller-family assertions ${JSON.stringify(Object.fromEntries(familyCounts))}`,
    );
  },
);

const anyGhosttyBroker = rows
  ? wellKnownOwnerPid(rows, NORMAL_ENDPOINT.wellKnownName) ||
    wellKnownOwnerPid(rows, LEGACY_ENDPOINT.wellKnownName)
  : undefined;

test(
  "reality: the normal default broker is the installed origin/main build and exposes the exact action path",
  {
    skip: baseSkip ?? (!anyGhosttyBroker ? "no live Ghostty single-instance desktop" : undefined),
  },
  async () => {
    const ownerPid = wellKnownOwnerPid(rows, NORMAL_ENDPOINT.wellKnownName);
    assert.ok(ownerPid, "com.mitchellh.ghostty must be live when any Ghostty broker is live");
    const ownerExecutable = readlinkSync(`/proc/${ownerPid}/exe`);
    assert.match(
      ownerExecutable,
      new RegExp(
        `^${homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\.local/opt/ghostty-origin-main/[0-9a-f]{40}/bin/ghostty$`,
      ),
      "the normal broker must not be /usr/bin/ghostty or the legacy sidequest build",
    );

    const normalControllers = recognizedLiveControllers.filter(
      ({ endpoint }) => endpoint.wellKnownName === NORMAL_ENDPOINT.wellKnownName,
    );
    assert.ok(
      normalControllers.length >= 1,
      "at least one live origin/main Pi controller with a real surface ID is required",
    );
    const controller = normalControllers[0];
    const expected = expectedReceiver(rows, controller);
    const target = await resolveControllerGhosttyDbusTarget({
      execRunner: realExecRunner,
      controllerGhostty: controller.ancestor,
      surfaceId: controller.surfaceId,
    });
    assert.ok(
      target,
      "the live origin/main controller must resolve its originating Ghostty process",
    );
    assert.equal(target.busName, expected.busName);
    assert.equal(target.surfaceId, expected.surfaceId);
    assert.equal(readlinkSync(`/proc/${target.ownerPid}/exe`), controller.ancestor.exe);
    assert.equal(target.wellKnownName, NORMAL_ENDPOINT.wellKnownName);
    assert.equal(target.objectPath, NORMAL_ENDPOINT.objectPath);
    assert.equal(pidForUniqueName(rows, target.busName), expected.pid);

    const describedAction = spawnSync(
      "busctl",
      [
        "--user",
        "call",
        target.busName,
        target.objectPath,
        "org.gtk.Actions",
        "Describe",
        "s",
        "new-tab",
      ],
      { encoding: "utf8", timeout: PROBE_TIMEOUT_MS },
    );
    assert.equal(describedAction.status, 0, describedAction.stderr);
    assert.match(describedAction.stdout, /^\(bgav\)\s+true\s+"\(tas\)"\s+0\s*$/);
  },
);

// This file only reads identities and Describe. It does not Activate a tab, verify placement,
// prove the supplied surface belongs to a receiver, guarantee an independent-window fixture,
// or eliminate bus/process races. Real placement needs separate owner-authorized evidence.

// Nonzero is necessary, not sufficient: a missing/stale nonzero surface can also make the
// receiver choose a focused/new window. Describe does not query surface existence or ownership.
