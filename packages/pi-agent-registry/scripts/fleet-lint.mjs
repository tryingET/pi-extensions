#!/usr/bin/env node
// summary: emits one read-only immutable-observation fleet lint report and exits nonzero on unhealthy fleet state.
import { parseArgs } from "node:util";
import { loadEcProfiles } from "../src/ec-profiles.ts";
import { FleetLintInfrastructureError, lintAgentFleet } from "../src/fleet-lint.ts";

class FleetLintCliError extends Error {}

function usage() {
  console.error(`usage: pi-agent-registry-lint [options]

options:
  --root PATH              agent repo root or agent-* pattern (repeatable)
  --ec-profiles PATH       engineering-core skills/profiles.json
  --observed-at RFC3339    deterministic observation time override
  --stale-after-days N     advisory lifecycle threshold (default 90)
  --max-repositories N     bounded candidate count (default 5000)
  --pretty                 pretty-print JSON
  --allow-unhealthy        exit zero when report status is unhealthy
  --help                   show this help`);
}

try {
  const { values } = parseArgs({
    options: {
      root: { type: "string", multiple: true },
      "ec-profiles": { type: "string" },
      "observed-at": { type: "string" },
      "stale-after-days": { type: "string" },
      "max-repositories": { type: "string" },
      pretty: { type: "boolean" },
      "allow-unhealthy": { type: "boolean" },
      help: { type: "boolean" },
    },
    allowPositionals: false,
    strict: true,
  });
  if (values.help) {
    usage();
    process.exitCode = 0;
  } else {
    const integer = (value, label) => {
      if (value === undefined) return undefined;
      const parsed = Number.parseInt(value, 10);
      if (!Number.isSafeInteger(parsed) || parsed <= 0 || String(parsed) !== value) {
        throw new FleetLintCliError(`${label} must be a positive safe integer`);
      }
      return parsed;
    };
    let ec;
    if (values["ec-profiles"]) {
      try {
        ec = await loadEcProfiles(values["ec-profiles"]);
      } catch {
        throw new FleetLintInfrastructureError(
          "profile.source_load_failed",
          "engineering-core skill profile source could not be loaded",
        );
      }
    }
    const report = await lintAgentFleet({
      ...(values.root ? { roots: values.root } : {}),
      ...(ec ? { ec } : {}),
      ...(values["observed-at"] ? { observedAt: values["observed-at"] } : {}),
      ...(values["stale-after-days"]
        ? { staleAfterDays: integer(values["stale-after-days"], "--stale-after-days") }
        : {}),
      ...(values["max-repositories"]
        ? { maxRepositories: integer(values["max-repositories"], "--max-repositories") }
        : {}),
    });
    console.log(JSON.stringify(report, null, values.pretty ? 2 : 0));
    process.exitCode = report.summary.status === "healthy" || values["allow-unhealthy"] ? 0 : 1;
  }
} catch (error) {
  const message =
    error instanceof FleetLintInfrastructureError || error instanceof FleetLintCliError
      ? error.message
      : "invalid command-line arguments or fleet lint infrastructure failure";
  console.error(`pi-agent-registry-lint failed: ${message}`);
  process.exitCode = 2;
}
