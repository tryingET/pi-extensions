#!/usr/bin/env node
// ---
// summary: "Validates, lists, and runs manifest-defined package scenarios against pinned Pi host compatibility profiles."
// read_when:
//   - "Reviewing Pi host upgrade coverage, scenario selection, temporary dependency alignment, or restoration behavior."
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

function usage() {
  console.error(`Usage:
  node ./scripts/pi-host-compatibility-canary.mjs validate [--manifest <path>] [--json]
  node ./scripts/pi-host-compatibility-canary.mjs resolve-host [--manifest <path>] [--profile <name>] [--json]
  node ./scripts/pi-host-compatibility-canary.mjs list [--manifest <path>] [--profile <name>] [--json]
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
    const flagName = { "--fail-fast": "failFast", "--dry-run": "dryRun", "--json": "json" }[arg];
    if (flagName) options[flagName] = true;
    else if (arg === "-h" || arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
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
