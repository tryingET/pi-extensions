// summary: "Reality-anchored assertion: every recognized Ghostty controller family resolves its own single-instance server, and the normal broker is the installed origin/main build."
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
  return result.stdout.split("\n").map((line) => line.trim().split(/\s+/));
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
  if (executable.includes("/ghostty-sidequest")) return LEGACY_ENDPOINT;
  if (
    executable === "/usr/bin/ghostty" ||
    executable.startsWith(`${homedir()}/.local/opt/ghostty-origin-main/`)
  ) {
    return NORMAL_ENDPOINT;
  }
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
      const target = await resolveControllerGhosttyDbusTarget({
        execRunner: realExecRunner,
        controllerGhostty: controller.ancestor,
        surfaceId: controller.surfaceId,
      });
      assert.ok(
        target,
        `pi ${controller.pid}: recognized ${controller.ancestor.exe} controller must resolve exactly`,
      );
      const ownerPid = wellKnownOwnerPid(rows, controller.endpoint.wellKnownName);
      assert.ok(ownerPid, `${controller.endpoint.wellKnownName} must have a live owner`);
      assert.equal(target.wellKnownName, controller.endpoint.wellKnownName);
      assert.equal(target.objectPath, controller.endpoint.objectPath);
      assert.equal(pidForUniqueName(rows, target.busName), ownerPid);
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
    const target = await resolveControllerGhosttyDbusTarget({
      execRunner: realExecRunner,
      controllerGhostty: controller.ancestor,
      surfaceId: controller.surfaceId,
    });
    assert.ok(target, "the live origin/main controller must resolve its exact normal broker");
    assert.equal(target.wellKnownName, NORMAL_ENDPOINT.wellKnownName);
    assert.equal(target.objectPath, NORMAL_ENDPOINT.objectPath);
    assert.equal(pidForUniqueName(rows, target.busName), ownerPid);

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
    assert.match(describedAction.stdout, /\(tas\)/);
  },
);
