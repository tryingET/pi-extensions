#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const WAVE_001_PATHS = [
  "packages/pi-autoresearch/README.md",
  "packages/pi-autoresearch/docs/project/current-vs-target.md",
  "packages/pi-autoresearch/extensions/pi-autoresearch.ts",
  "packages/pi-autoresearch/src/core/runtime.ts",
  "packages/pi-autoresearch/src/core/selfHosting.ts",
  "packages/pi-autoresearch/tests/runtime.test.ts",
  "packages/pi-autoresearch/tests/self-hosting-extension.test.ts",
];

const args = process.argv.slice(2);
const controllerCwd = resolveDirectory(
  readFlag(args, "--controller-cwd") || process.env.PI_AUTORESEARCH_SELF_HOSTING_CONTROLLER_CWD,
  "controller cwd",
);
const candidateCwd = resolveDirectory(
  readFlag(args, "--candidate-cwd") || process.cwd(),
  "candidate cwd",
);

if (controllerCwd === candidateCwd) {
  throw new Error("controller cwd and candidate cwd must differ for self-hosting wave 001");
}

const copied = [];
const unchanged = [];
for (const relativePath of WAVE_001_PATHS) {
  const sourcePath = path.join(controllerCwd, relativePath);
  if (!existsSync(sourcePath)) {
    throw new Error(`required controller file missing: ${sourcePath}`);
  }

  const targetPath = path.join(candidateCwd, relativePath);
  const sourceContent = readFileSync(sourcePath);
  const targetExists = existsSync(targetPath);
  const targetContent = targetExists ? readFileSync(targetPath) : null;

  if (targetExists && Buffer.compare(sourceContent, targetContent) === 0) {
    unchanged.push(relativePath);
    continue;
  }

  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, sourceContent);
  copied.push(relativePath);
}

process.stdout.write(
  `${JSON.stringify(
    {
      campaignId: "self-hosting-wave-001-public-seam-hardening",
      controllerCwd,
      candidateCwd,
      copied,
      unchanged,
      pathCount: WAVE_001_PATHS.length,
    },
    null,
    2,
  )}\n`,
);

function readFlag(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  if (index + 1 >= argv.length) {
    throw new Error(`flag ${flag} requires a value`);
  }
  return argv[index + 1];
}

function resolveDirectory(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  const resolved = path.resolve(value);
  if (!existsSync(resolved)) {
    throw new Error(`${label} does not exist: ${resolved}`);
  }
  if (!statSync(resolved).isDirectory()) {
    throw new Error(`${label} is not a directory: ${resolved}`);
  }
  return resolved;
}
