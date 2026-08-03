#!/usr/bin/env node
// summary: "CLI wrapper that validates arguments and delegates all Pi JSONL inspection to jq."
// read_when:
//   - "Changing pi-session-insights CLI arguments, jq invocation, or fail-closed input checks."

import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VERSION = "0.1.0";
const DEFAULT_MAX_TEXT_CHARS = 2_000;
const DEFAULT_MAX_CHAIN = 512;

function usage() {
  return `Usage: pi-session-insights [options] <session.jsonl>

Deterministically extracts a bounded pi.session-insights.v1 object.
The wrapper never parses JSONL; jq owns all session-content inspection.

Options:
  --attribution <file>   Source-qualified pi.session-insights.attribution.v1 JSON
  --max-text-chars <n>   Cap latest operator/assistant text (default: ${DEFAULT_MAX_TEXT_CHARS})
  --max-chain <n>        Cap emitted active-parent-chain ids (default: ${DEFAULT_MAX_CHAIN})
  --pretty               Pretty-print JSON instead of compact output
  --jq-bin <path>        jq executable (default: PI_SESSION_INSIGHTS_JQ or jq)
  --help                 Show this help
  --version              Show package version
`;
}

function fail(message, exitCode = 2) {
  process.stderr.write(`pi-session-insights: ${message}\n`);
  process.exit(exitCode);
}

function positiveInteger(raw, option, maximum) {
  if (!/^[1-9][0-9]*$/.test(raw ?? "")) {
    fail(`${option} requires a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    fail(`${option} must be <= ${maximum}`);
  }
  return value;
}

function requireRegularFile(path, label) {
  let stat;
  try {
    stat = statSync(path);
  } catch (error) {
    fail(`${label} is not readable: ${path} (${error.message})`);
  }
  if (!stat.isFile()) {
    fail(`${label} must be a regular file: ${path}`);
  }
}

function parseArguments(argv) {
  const options = {
    attribution: undefined,
    jqBin: process.env.PI_SESSION_INSIGHTS_JQ || "jq",
    maxChain: DEFAULT_MAX_CHAIN,
    maxTextChars: DEFAULT_MAX_TEXT_CHARS,
    pretty: false,
    sessionFile: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case "--help":
      case "-h":
        process.stdout.write(usage());
        process.exit(0);
        break;
      case "--version":
        process.stdout.write(`${VERSION}\n`);
        process.exit(0);
        break;
      case "--pretty":
        options.pretty = true;
        break;
      case "--attribution":
        index += 1;
        options.attribution = argv[index];
        if (!options.attribution) fail("--attribution requires a file");
        break;
      case "--jq-bin":
        index += 1;
        options.jqBin = argv[index];
        if (!options.jqBin) fail("--jq-bin requires a path or executable name");
        break;
      case "--max-chain":
        index += 1;
        options.maxChain = positiveInteger(argv[index], "--max-chain", 4_096);
        break;
      case "--max-text-chars":
        index += 1;
        options.maxTextChars = positiveInteger(argv[index], "--max-text-chars", 65_536);
        break;
      default:
        if (argument.startsWith("-")) fail(`unknown option: ${argument}`);
        if (options.sessionFile) fail("exactly one session JSONL file is supported per invocation");
        options.sessionFile = argument;
        break;
    }
  }

  if (!options.sessionFile) fail(`missing session JSONL file\n\n${usage()}`);
  return options;
}

const options = parseArguments(process.argv.slice(2));
requireRegularFile(options.sessionFile, "session JSONL");
if (options.attribution) requireRegularFile(options.attribution, "attribution JSON");

const programPath = fileURLToPath(new URL("../lib/session-insights.jq", import.meta.url));
requireRegularFile(programPath, "jq program");

const jqArguments = [
  "--slurp",
  ...(options.pretty ? [] : ["--compact-output"]),
  "--from-file",
  programPath,
  "--arg",
  "session_file",
  options.sessionFile,
  "--argjson",
  "max_text_chars",
  String(options.maxTextChars),
  "--argjson",
  "max_chain",
  String(options.maxChain),
];

if (options.attribution) {
  jqArguments.push("--slurpfile", "attribution", options.attribution);
} else {
  jqArguments.push("--argjson", "attribution", "{}");
}

jqArguments.push(options.sessionFile);

const completed = spawnSync(options.jqBin, jqArguments, {
  stdio: ["ignore", "inherit", "inherit"],
});

if (completed.error) {
  fail(`failed to execute jq (${options.jqBin}): ${completed.error.message}`, 127);
}
process.exit(completed.status ?? 1);
