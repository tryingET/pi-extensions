// summary: "Reality-anchored assertion: ASC observer / sidequest tab targeting resolves to the Ghostty single-instance server for every live sidequest pi session."
// read_when:
//   - "Verifying observer / sidequest tab targeting against a real --gtk-single-instance Ghostty desktop instead of stubbed exec/busctl."
//   - "Changing resolveControllerGhosttyDbusTarget or the single-instance server targeting contract."
//
// Reality-anchored assertion. Excluded from the default package gate (named *.live.mjs, not
// *.test.*) because it needs a real Linux Ghostty single-instance desktop. It skips with a reason
// when that environment is absent, so it is safe to run anywhere. Run on the workstation before
// landing behavioral launch changes: `npm run reality:check`.
//
// Why this exists (not just more unit tests): the unit tests for observer targeting stayed GREEN
// while the code was wrong, because their exec/busctl stubs faithfully encoded the same incorrect
// process model as the code (one ghostty process per window). Only an assertion that touches the
// REAL bus can break a wrong-but-self-consistent model.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  findGhosttyAncestor,
  resolveControllerGhosttyDbusTarget,
} from "../../extensions/sidequest.ts";

const GHOSTTY_SIDEQUEST_DBUS_NAME = "com.tryinget.ghosttysidequest";
const PROBE_TIMEOUT_MS = 4000;

// Real ExecRunner matching the resolver's { code, stdout, stderr, killed } contract.
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

function wellKnownOwnerPid(rows) {
  return rows
    .filter((fields) => fields[0] === GHOSTTY_SIDEQUEST_DBUS_NAME)
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
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function readEnvSurfaceId(pid) {
  try {
    const environ = readFileSync(`/proc/${pid}/environ`, "utf8");
    const entry = environ.split("\0").find((line) => line.startsWith("GHOSTTY_SURFACE_ID="));
    return entry ? entry.slice("GHOSTTY_SURFACE_ID=".length).trim() : undefined;
  } catch {
    return undefined;
  }
}

function computeSkipReason(rows) {
  if (process.platform !== "linux") return "reality assertion requires Linux";
  if (!wellKnownOwnerPid(rows)) {
    return "no com.tryinget.ghosttysidequest single-instance owner on the user bus";
  }
  if (livePiPids().length === 0) return "no live pi sessions to assert against";
  return null;
}

const rows = busctlListRows();
const skipReason = rows ? computeSkipReason(rows) : "busctl --user list unavailable";

test(
  "reality: every live sidequest pi session targets the single-instance Ghostty server for observer tabs",
  { skip: skipReason ?? undefined },
  async () => {
    const ownerPid = wellKnownOwnerPid(rows);
    const pids = livePiPids();
    let asserted = 0;
    let clientAncestor = 0;

    for (const pid of pids) {
      const surfaceId = readEnvSurfaceId(pid);
      const ancestor = findGhosttyAncestor(pid);
      if (!surfaceId || !ancestor?.exe) continue;

      const target = await resolveControllerGhosttyDbusTarget({
        execRunner: realExecRunner,
        controllerGhostty: ancestor,
        surfaceId,
      });
      // Undefined target = not a sidequest-fork controller (e.g. stock ghostty); out of scope.
      if (!target) continue;

      const targetPid = pidForUniqueName(rows, target.busName);
      assert.equal(
        targetPid,
        ownerPid,
        `pi ${pid} (ghostty ancestor ${ancestor.pid}): observer target ${target.busName} must be the single-instance server (pid ${ownerPid}), not a per-session launcher client. Under --gtk-single-instance only the server owns every surface and can route the controller surface id.`,
      );
      asserted += 1;
      if (ancestor.pid !== ownerPid) clientAncestor += 1;
    }

    assert.ok(
      asserted >= 1,
      "at least one live sidequest-fork pi session must be assertable in a reality environment",
    );
    console.log(
      `reality: ${asserted} live sidequest pi session(s) target the single-instance server ` +
        `(${clientAncestor} with a client ghostty ancestor — the exact scenario the stubbed unit tests could not catch).`,
    );
  },
);
