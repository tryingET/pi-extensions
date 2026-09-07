import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [packet] = process.argv.slice(2);
if (!packet || process.argv.length !== 3) throw Error("one_frozen_public_packet_required");
const path = resolve(packet),
  data = JSON.parse(readFileSync(path));
for (const key of ["seedPins", "workerRoot", "runtimeRoot"])
  if (typeof data[key] !== "string" || !data[key].startsWith("/"))
    throw Error("absolute_owned_fixture_paths_required");
for (const schema of [40, 43]) {
  console.log(`Public native schema ${schema}`);
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", "tests/task-session-public/integration.test.mjs"],
    {
      stdio: "inherit",
      env: {
        PATH: "/usr/bin:/bin",
        LANG: "C.UTF-8",
        TMPDIR: process.env.TMPDIR,
        HOME: join(process.env.TMPDIR, "unprovisioned-public-runner-home"),
        TASK5480_PUBLIC_PACKET: path,
        TASK5480_PUBLIC_SCHEMA: String(schema),
      },
    },
  );
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
