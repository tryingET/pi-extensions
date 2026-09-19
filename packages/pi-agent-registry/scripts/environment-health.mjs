#!/usr/bin/env node
// summary: Repo-local explicit live environment lane; report unhealthy fleet and revision drift without gating commits.
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
const checks = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-timeout=120000",
    "tests/environment-health/fleet-lint.health.mjs",
    "tests/environment-health/extension.health.mjs",
    "tests/environment-health/registry.health.mjs",
  ],
  { cwd, env, stdio: "inherit" },
);
// Always emit the current full report, even if the baseline/compatibility checks fail.
const report = spawnSync(
  process.execPath,
  [
    "scripts/fleet-lint.mjs",
    "--pretty",
    "--root",
    join(homedir(), "ai-society/agents/agent-*"),
    "--ec-profiles",
    join(homedir(), "ai-society/core/engineering-core/skills/profiles.json"),
  ],
  {
    cwd,
    env,
    stdio: "inherit",
  },
);
if (checks.error) console.error(checks.error.message);
if (report.error) console.error(report.error.message);
process.exitCode = Math.max(checks.status ?? 2, report.status ?? 2);
