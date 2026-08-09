#!/usr/bin/env node
// ---
// summary: "Validates, runs, inspects, and recovers manifest-defined Pi host compatibility scenarios."
// read_when:
//   - "Reviewing Pi host scenarios, dependency alignment, restoration, lock status, or crash recovery."
// ---
import path from "node:path";
import { loadManifest, validateManifest } from "./pi-host-compatibility-canary/manifest.mjs";
import {
  listPayload,
  printList,
  printResolvedHost,
  resolveHostPayload,
} from "./pi-host-compatibility-canary/payloads.mjs";
import {
  DEFAULT_MANIFEST_PATH,
  ROOT,
} from "./pi-host-compatibility-canary/paths.mjs";
import {
  printRunSummary,
  runPayload,
} from "./pi-host-compatibility-canary/runner.mjs";
import {
  recoverInterruptedRun,
  recoveryStatus,
} from "./pi-host-compatibility-canary/recovery.mjs";

function usage() {
  console.error(`Usage:
  node ./scripts/pi-host-compatibility-canary.mjs validate [--manifest <path>] [--json]
  node ./scripts/pi-host-compatibility-canary.mjs resolve-host [--manifest <path>] [--profile <name>] [--json]
  node ./scripts/pi-host-compatibility-canary.mjs list [--manifest <path>] [--profile <name>] [--json]
  node ./scripts/pi-host-compatibility-canary.mjs status [--manifest <path>] [--json]
  node ./scripts/pi-host-compatibility-canary.mjs recover [--manifest <path>] [--apply] [--json]
  node ./scripts/pi-host-compatibility-canary.mjs run [--manifest <path>] [--profile <name>] [--scenario <id>] [--fail-fast] [--dry-run] [--json]`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    manifestPath: DEFAULT_MANIFEST_PATH,
    profile: undefined,
    scenarioIds: [],
    failFast: false,
    dryRun: false,
    apply: false,
    json: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (["--manifest", "--profile", "--scenario"].includes(arg)) {
      const value = rest[++index];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === "--manifest") options.manifestPath = path.resolve(ROOT, value);
      else if (arg === "--profile") options.profile = value;
      else options.scenarioIds.push(value);
      continue;
    }
    const flagName = {
      "--fail-fast": "failFast",
      "--dry-run": "dryRun",
      "--apply": "apply",
      "--json": "json",
    }[arg];
    if (flagName) options[flagName] = true;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.apply && options.command !== "recover") throw new Error("--apply is only valid with recover");
  return options;
}

function recoveryFailure(error, applied) {
  const code = typeof error?.code === "string" ? error.code : "PI_HOST_COMPAT_RECOVERY_FAILED";
  const message = error instanceof Error ? error.message : String(error);
  const status = code === "PI_HOST_COMPAT_CONCURRENT"
    ? "active"
    : code === "PI_HOST_COMPAT_RECOVERY_REQUIRED"
      ? "recovery-required"
      : "invalid";
  return { status, recovered: false, applied, error: { code, message } };
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help || !options.command) {
    usage();
    return 0;
  }

  const manifest = validateManifest(loadManifest(options.manifestPath), options.manifestPath);

  switch (options.command) {
    case "validate": {
      const payload = {
        ok: true,
        manifestPath: manifest.manifestPath,
        hostPackage: manifest.hostPackage,
        hostCompanionPackages: manifest.hostCompanionPackages,
        trackedChangelog: manifest.trackedChangelog,
        scenarioCount: manifest.scenarios.length,
        profiles: Object.keys(manifest.profiles),
        defaultProfile: manifest.defaultProfile,
      };
      if (options.json) console.log(JSON.stringify(payload, null, 2));
      else {
        console.log(`ok: pi host compatibility canary manifest (${manifest.scenarios.length} scenarios)`);
        console.log(`manifest: ${manifest.manifestPath}`);
      }
      return 0;
    }
    case "resolve-host": {
      const payload = resolveHostPayload(manifest, options);
      if (options.json) console.log(JSON.stringify(payload, null, 2));
      else printResolvedHost(payload);
      return 0;
    }
    case "list": {
      const payload = listPayload(manifest, options);
      if (options.json) console.log(JSON.stringify(payload, null, 2));
      else printList(payload);
      return 0;
    }
    case "status": {
      let payload;
      try { payload = recoveryStatus(manifest); }
      catch (error) {
        payload = {
          manifestPath: manifest.manifestPath,
          recoveryRequired: true,
          ...recoveryFailure(error, false),
        };
        if (options.json) console.log(JSON.stringify(payload, null, 2));
        console.error(`error: ${payload.error.message}`);
        return 1;
      }
      if (options.json) console.log(JSON.stringify(payload, null, 2));
      else {
        console.log(`# Pi host compatibility canary recovery status\n\n- status: ${payload.status}`);
        console.log(`- recovery_required: ${payload.recoveryRequired}`);
        if (payload.runId) console.log(`- run_id: ${payload.runId}`);
        if (payload.phase) console.log(`- phase: ${payload.phase}`);
        if (payload.requiresApply !== undefined) console.log(`- requires_apply: ${payload.requiresApply}`);
      }
      return 0;
    }
    case "recover": {
      let payload;
      try {
        payload = await recoverInterruptedRun(manifest, {
          apply: options.apply,
          json: options.json,
        });
      } catch (error) {
        payload = recoveryFailure(error, options.apply);
        if (options.json) console.log(JSON.stringify(payload, null, 2));
        console.error(`error: ${payload.error.message}`);
        return 1;
      }
      if (options.json) console.log(JSON.stringify(payload, null, 2));
      else {
        console.log(`# Pi host compatibility canary recovery\n\n- status: ${payload.status}`);
        console.log(`- recovered: ${payload.recovered}`);
        console.log(`- applied: ${payload.applied}`);
        if (payload.recoveryMode) console.log(`- recovery_mode: ${payload.recoveryMode}`);
      }
      return 0;
    }
    case "run": {
      const payload = await runPayload(manifest, options);
      if (options.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        printRunSummary(payload);
      }
      return payload.summary.failed > 0 ? 1 : 0;
    }
    default:
      throw new Error(`Unknown command: ${options.command}`);
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
