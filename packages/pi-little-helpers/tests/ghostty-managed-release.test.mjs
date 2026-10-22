// summary: Managed Ghostty release paths retain exact originating-process targeting across rebuilds.
// read_when:
//   - Changing managed Ghostty installation recognition or D-Bus identity checks.

import assert from "node:assert/strict";
import test from "node:test";
import { resolveControllerGhosttyDbusTarget } from "../extensions/sidequestGhostty.ts";

const root = "/data/agnt/releases/ghostty-no-iowait";
const releases = ["a".repeat(64), "0123456789abcdef".repeat(4)];
const origin = ":1.99 111 ghostty user :1.99 unit - -\n";
const daemon =
  ":1.43 222 ghostty user :1.43 unit - -\ncom.mitchellh.ghostty 222 ghostty user :1.43 unit - -\n";

function resolveTarget(exe, rows, read = () => exe) {
  return resolveControllerGhosttyDbusTarget({
    controllerGhostty: { pid: 111, exe },
    surfaceId: "0xbb86cc0c30fce82d",
    readProcessExecutable: read,
    execRunner: async (command, args) => {
      assert.equal(command, "busctl");
      assert.deepEqual(args, ["--user", "list", "--no-pager", "--no-legend"]);
      return { code: 0, stdout: rows };
    },
  });
}

for (const release of releases) {
  const exe = `${root}/${release}/bin/ghostty`;
  for (const [scenario, rows, ownerPid, busName] of [
    ["independent originator wins over same-build daemon", origin + daemon, 111, ":1.99"],
    ["independent originator needs no daemon", origin, 111, ":1.99"],
    ["nameless launcher retains exact-build fallback", daemon, 222, ":1.43"],
  ]) {
    test(`managed release ${release.slice(0, 8)}: ${scenario}`, async () => {
      assert.deepEqual(await resolveTarget(exe, rows), {
        busName,
        ownerPid,
        surfaceId: BigInt("0xbb86cc0c30fce82d").toString(),
        wellKnownName: "com.mitchellh.ghostty",
        objectPath: "/com/mitchellh/ghostty",
      });
    });
  }

  test(`managed release ${release.slice(0, 8)}: another release is not the same executable`, async () => {
    assert.equal(
      await resolveTarget(exe, daemon, (pid) =>
        pid === 111 ? exe : `${root}/${"f".repeat(64)}/bin/ghostty`,
      ),
      undefined,
    );
    assert.equal(await resolveTarget(exe, origin, () => "/usr/bin/ghostty"), undefined);
  });
}

for (const exe of [
  `/custom/ghostty-no-iowait/${releases[0]}/bin/ghostty`,
  `${root}-other/${releases[0]}/bin/ghostty`,
  `${root}/current/bin/ghostty`,
  `${root}/${"a".repeat(63)}/bin/ghostty`,
  `${root}/${"g".repeat(64)}/bin/ghostty`,
  `${root}/${releases[0]}/extra/bin/ghostty`,
  `${root}/${releases[0]}/bin/not-ghostty`,
]) {
  test(`unknown installation is still refused: ${exe}`, async () => {
    assert.equal(await resolveTarget(exe, origin + daemon), undefined);
  });
}
