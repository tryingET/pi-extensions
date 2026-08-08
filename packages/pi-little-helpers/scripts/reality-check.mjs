#!/usr/bin/env node

// summary: "Runs reality-anchored behavioral assertions (*.reality.live.mjs) against the live workstation environment."
// read_when:
//   - "Verifying behavioral launch / observer claims against a real Ghostty / pi desktop before landing a change."

// Reality assertions are excluded from the default package gate (they need a real environment).
// Each assertion skips with a reason when its environment is absent, so this runner is safe to
// invoke anywhere. Run from the package root: `node ./scripts/reality-check.mjs` or `npm run
// reality:check`.

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const liveDir = join(here, "..", "tests", "live");

const files = [];
try {
  for (const entry of readdirSync(liveDir)) {
    if (!entry.endsWith(".reality.live.mjs")) continue;
    const candidate = join(liveDir, entry);
    if (statSync(candidate).isFile()) files.push(candidate);
  }
} catch {
  // tests/live does not exist yet — nothing to run.
}

files.sort();

if (files.length === 0) {
  console.log("reality-check: no *.reality.live.mjs assertions found in tests/live");
  process.exit(0);
}

console.log(`reality-check: running ${files.length} assertion(s) against the live environment`);
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
