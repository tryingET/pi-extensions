#!/usr/bin/env node
// ---
// summary: "Plans, materializes, verifies, activates, probes, and rolls back immutable Pi extension generations."
// read_when:
//   - "Operating or changing the bounded immutable Pi extension generation CLI."
// ---
import { pathToFileURL } from "node:url";
import {
  activateGeneration,
  initPrivateEnvironment,
  recoverActivation,
  rollbackActivation,
} from "./pi-extension-generations/activation.mjs";
import { materializeGeneration } from "./pi-extension-generations/materialize.mjs";
import { planGeneration } from "./pi-extension-generations/plan.mjs";
import { probeFreshHost } from "./pi-extension-generations/probe.mjs";
import { generationStatus, verifyGeneration } from "./pi-extension-generations/verify.mjs";

function usage() {
  return `Usage:
  node scripts/pi-extension-generations.mjs plan --repo <absolute> --commit <full-sha> --package <repo-relative> --state-root <absolute>
  node scripts/pi-extension-generations.mjs materialize --repo <absolute> --commit <full-sha> --package <repo-relative> --state-root <absolute>
  node scripts/pi-extension-generations.mjs verify --generation <absolute>
  node scripts/pi-extension-generations.mjs status --state-root <absolute>
  node scripts/pi-extension-generations.mjs init-agent --sandbox-root <absolute> --agent-dir <absolute> --project-dir <absolute>
  node scripts/pi-extension-generations.mjs activate --sandbox-root <absolute> --agent-dir <absolute> --project-dir <absolute> --generation <absolute> [--experimental-host-pid <pid>]
  node scripts/pi-extension-generations.mjs recover --sandbox-root <absolute> --agent-dir <absolute> --project-dir <absolute>
  node scripts/pi-extension-generations.mjs rollback --sandbox-root <absolute> --agent-dir <absolute> --project-dir <absolute>
  node scripts/pi-extension-generations.mjs probe --sandbox-root <absolute> --agent-dir <absolute> --project-dir <absolute> --generation <absolute> --host <canonical-absolute> --command <name> --expected-inline-commands <comma-separated-names-or-none> [--request-file <absolute>] [--timeout-ms <ms>]

Published generations have no delete, replace, or cleanup command.`;
}

const COMMANDS = new Set(["plan", "materialize", "verify", "status", "init-agent", "activate", "recover", "rollback", "probe"]);

function parse(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  if (command === "-h" || command === "--help") {
    if (rest.length > 0) throw new Error("options cannot accompany top-level help");
    return { help: true };
  }
  const names = new Map([
    ["--repo", "repoRoot"], ["--commit", "commit"], ["--package", "packageRoot"],
    ["--state-root", "stateRoot"], ["--generation", "generationDir"],
    ["--sandbox-root", "sandboxRoot"], ["--agent-dir", "agentDir"],
    ["--project-dir", "projectDir"], ["--experimental-host-pid", "experimentalHostPid"],
    ["--host", "hostExecutable"], ["--command", "commandName"],
    ["--expected-inline-commands", "expectedInlineCommands"],
    ["--request-file", "requestFile"], ["--timeout-ms", "timeoutMs"],
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === "-h" || argument === "--help") {
      if (options.help) throw new Error("duplicate argument: --help");
      options.help = true;
      continue;
    }
    const name = names.get(argument);
    if (!name) throw new Error(`unknown argument: ${argument}`);
    if (options[name] !== undefined) throw new Error(`duplicate argument: ${argument}`);
    const value = rest[++index];
    if (!value) throw new Error(`${argument} requires a value`);
    options[name] = value;
  }
  if (options.expectedInlineCommands !== undefined) {
    options.expectedInlineCommands = options.expectedInlineCommands === "none" ? [] : options.expectedInlineCommands.split(",");
  }
  if (options.experimentalHostPid !== undefined) {
    if (!/^\d+$/u.test(options.experimentalHostPid) || Number(options.experimentalHostPid) < 1) throw new Error("--experimental-host-pid must be a positive integer");
    options.experimentalHostPid = Number(options.experimentalHostPid);
  }
  if (options.timeoutMs !== undefined) {
    if (!/^\d+$/u.test(options.timeoutMs)) throw new Error("--timeout-ms must be an integer");
    options.timeoutMs = Number(options.timeoutMs);
  }
  return options;
}

function requireOptions(options, names) {
  const missing = names.filter((name) => options[name] === undefined);
  if (missing.length > 0) throw new Error(`missing required option(s): ${missing.join(", ")}`);
}

function rejectSurplus(options, allowed) {
  const surplus = Object.keys(options).filter((name) => !["command", "help", ...allowed].includes(name));
  if (surplus.length > 0) throw new Error(`option(s) not valid for ${options.command}: ${surplus.join(", ")}`);
}

export async function runCli(argv) {
  const options = parse(argv);
  if (!options.command) {
    console.log(usage());
    return 0;
  }
  if (!COMMANDS.has(options.command)) throw new Error(`unknown command: ${options.command}`);
  if (options.help) {
    const surplus = Object.keys(options).filter((name) => !["command", "help"].includes(name));
    if (surplus.length > 0) throw new Error(`option(s) cannot accompany help: ${surplus.join(", ")}`);
    console.log(usage());
    return 0;
  }
  let result;
  switch (options.command) {
    case "plan":
      rejectSurplus(options, ["repoRoot", "commit", "packageRoot", "stateRoot"]);
      requireOptions(options, ["repoRoot", "commit", "packageRoot", "stateRoot"]);
      result = await planGeneration(options);
      break;
    case "materialize":
      rejectSurplus(options, ["repoRoot", "commit", "packageRoot", "stateRoot"]);
      requireOptions(options, ["repoRoot", "commit", "packageRoot", "stateRoot"]);
      result = await materializeGeneration(options);
      break;
    case "verify":
      rejectSurplus(options, ["generationDir"]);
      requireOptions(options, ["generationDir"]);
      result = await verifyGeneration(options.generationDir);
      break;
    case "status":
      rejectSurplus(options, ["stateRoot"]);
      requireOptions(options, ["stateRoot"]);
      result = await generationStatus(options.stateRoot);
      break;
    case "init-agent":
      rejectSurplus(options, ["sandboxRoot", "agentDir", "projectDir"]);
      requireOptions(options, ["sandboxRoot", "agentDir", "projectDir"]);
      result = await initPrivateEnvironment(options);
      break;
    case "activate":
      rejectSurplus(options, ["sandboxRoot", "agentDir", "projectDir", "generationDir", "experimentalHostPid"]);
      requireOptions(options, ["sandboxRoot", "agentDir", "projectDir", "generationDir"]);
      result = await activateGeneration(options);
      break;
    case "recover":
      rejectSurplus(options, ["sandboxRoot", "agentDir", "projectDir"]);
      requireOptions(options, ["sandboxRoot", "agentDir", "projectDir"]);
      result = await recoverActivation(options);
      break;
    case "rollback":
      rejectSurplus(options, ["sandboxRoot", "agentDir", "projectDir"]);
      requireOptions(options, ["sandboxRoot", "agentDir", "projectDir"]);
      result = await rollbackActivation(options);
      break;
    case "probe":
      rejectSurplus(options, ["sandboxRoot", "agentDir", "projectDir", "generationDir", "hostExecutable", "commandName", "expectedInlineCommands", "requestFile", "timeoutMs"]);
      requireOptions(options, ["sandboxRoot", "agentDir", "projectDir", "generationDir", "hostExecutable", "commandName", "expectedInlineCommands"]);
      result = await probeFreshHost(options);
      break;
    default:
      throw new Error(`unknown command: ${options.command}`);
  }
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
