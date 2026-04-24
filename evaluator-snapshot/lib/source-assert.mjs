import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function parseSelfHostingSuiteArgs(argv = process.argv.slice(2)) {
  const candidateCwd = readRequiredFlag(argv, "--candidate");
  const controllerCwd = readRequiredFlag(argv, "--controller-cwd");
  return {
    candidateCwd: path.resolve(candidateCwd),
    controllerCwd: path.resolve(controllerCwd),
  };
}

export function readCandidateFile(candidateCwd, relativePath) {
  const target = path.join(candidateCwd, relativePath);
  if (!existsSync(target)) {
    throw new Error(`Candidate file missing: ${target}`);
  }
  return readFileSync(target, "utf8");
}

export function assertIncludes(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label} is missing required text ${JSON.stringify(needle)}`);
  }
}

export function finish(details) {
  process.stdout.write(`${JSON.stringify(details)}\n`);
}

function readRequiredFlag(argv, flag) {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) {
    throw new Error(`Missing required flag ${flag}`);
  }
  const value = argv[index + 1]?.trim();
  if (!value) {
    throw new Error(`Flag ${flag} requires a non-empty value`);
  }
  return value;
}
