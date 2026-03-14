#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const SAFE_COMMAND_TIMEOUT_MS = 30_000;
const FORBIDDEN_SHELL_PATTERN = /[;&|`<>\n\r]/;

function parseJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function shouldRunSmoke(smokeMode, command) {
  if (!command) return false;
  if (smokeMode === "required") return true;
  if (smokeMode !== "if-available") return false;
  return command.includes("uv tool run") && command.includes("tech-stack-core show");
}

function parseCommandArgs(command) {
  const text = String(command ?? "").trim();
  if (!text) return [];

  const args = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaped) current += "\\";
  if (quote) throw new Error("Unterminated quoted segment in tech_stack_core.command");
  if (current) args.push(current);
  return args;
}

function expandHome(value) {
  if (typeof value !== "string") return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return `${os.homedir()}/${value.slice(2)}`;
  return value;
}

function normalizeSmokeCommand(command, expectedTechStackLane) {
  const raw = String(command ?? "").trim();
  if (!raw) throw new Error("tech_stack_core.command must be non-empty");
  if (FORBIDDEN_SHELL_PATTERN.test(raw) || raw.includes("$(") || raw.includes("${")) {
    throw new Error("tech_stack_core.command must not contain shell operators, command substitution, or newlines");
  }

  const argv = parseCommandArgs(raw);
  const expectedArgvLength = 9;
  if (argv.length !== expectedArgvLength) {
    throw new Error(
      "tech_stack_core.command must be exactly: uv tool run --from <repo> tech-stack-core show <lane> --prefer-repo",
    );
  }

  const lane = expectedTechStackLane || argv[7];
  const expectedPrefix = ["uv", "tool", "run", "--from"];
  for (let i = 0; i < expectedPrefix.length; i++) {
    if (argv[i] !== expectedPrefix[i]) {
      throw new Error(
        "tech_stack_core.command must start with: uv tool run --from <repo> tech-stack-core show <lane> --prefer-repo",
      );
    }
  }

  if (!argv[4]) {
    throw new Error("tech_stack_core.command must include a non-empty --from repository path");
  }

  if (argv[5] !== "tech-stack-core" || argv[6] !== "show" || argv[7] !== lane || argv[8] !== "--prefer-repo") {
    throw new Error(
      `tech_stack_core.command must be exactly: uv tool run --from <repo> tech-stack-core show ${lane} --prefer-repo`,
    );
  }

  return [argv[0], argv[1], argv[2], argv[3], expandHome(argv[4]), argv[5], argv[6], argv[7], argv[8]];
}

export function validateTechStackContract(options) {
  const {
    policyPath = "policy/stack-lane.json",
    expectedLane,
    expectedTechStackLane,
    requireTool = "tech-stack-core",
    requirePinnedRef = "sha40",
    smokeMode = "if-available",
    fail,
  } = options;

  const reportFailure =
    typeof fail === "function"
      ? fail
      : (message) => {
          throw new Error(message);
        };

  const stackLane = parseJsonSafe(policyPath);
  if (!stackLane) {
    reportFailure(`Failed to parse ${policyPath}`);
    return;
  }

  if (expectedLane && stackLane.lane !== expectedLane) {
    reportFailure(`${policyPath} lane must be '${expectedLane}'`);
  }

  const techStackCore = stackLane.tech_stack_core;
  if (!techStackCore || typeof techStackCore !== "object") {
    reportFailure(`${policyPath} must include tech_stack_core metadata`);
    return;
  }

  if (expectedTechStackLane && techStackCore.lane !== expectedTechStackLane) {
    reportFailure(`${policyPath} tech_stack_core.lane must be '${expectedTechStackLane}'`);
  }

  if (requireTool && techStackCore.tool !== requireTool) {
    reportFailure(`${policyPath} tech_stack_core.tool must be '${requireTool}'`);
  }

  if (typeof techStackCore.command !== "string" || techStackCore.command.length === 0) {
    reportFailure(`${policyPath} tech_stack_core.command must be non-empty`);
  }

  if (
    expectedTechStackLane &&
    typeof techStackCore.command === "string" &&
    !techStackCore.command.includes(`tech-stack-core show ${expectedTechStackLane} --prefer-repo`)
  ) {
    reportFailure(
      `${policyPath} tech_stack_core.command must include 'tech-stack-core show ${expectedTechStackLane} --prefer-repo'`,
    );
  }

  const stackRef = techStackCore.ref;
  if (requirePinnedRef === "sha40") {
    if (typeof stackRef !== "string" || !/^[0-9a-f]{40}$/i.test(stackRef)) {
      reportFailure(`${policyPath} tech_stack_core.ref must be a pinned 40-char git SHA`);
    }
  } else if (requirePinnedRef === "non-empty") {
    if (typeof stackRef !== "string" || stackRef.length === 0) {
      reportFailure(`${policyPath} tech_stack_core.ref must be non-empty`);
    }
  }

  let safeCommand;
  try {
    safeCommand = normalizeSmokeCommand(techStackCore.command, expectedTechStackLane);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportFailure(`${policyPath} ${message}`);
    return;
  }

  if (!shouldRunSmoke(smokeMode, techStackCore.command)) {
    return;
  }

  const result = spawnSync(safeCommand[0], safeCommand.slice(1), {
    shell: false,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: SAFE_COMMAND_TIMEOUT_MS,
  });

  if (result.error) {
    const message = result.error instanceof Error ? result.error.message : String(result.error);
    reportFailure(`${policyPath} tech_stack_core.command failed to start: ${message}`);
    return;
  }

  if (result.signal) {
    reportFailure(`${policyPath} tech_stack_core.command terminated with signal ${result.signal}`);
    return;
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    reportFailure(
      `${policyPath} tech_stack_core.command exited with status ${String(result.status)}${stderr ? `: ${stderr}` : ""}`,
    );
    return;
  }

  if (!(result.stdout || "").trim()) {
    reportFailure(`${policyPath} tech_stack_core.command produced no output`);
  }
}

function main() {
  const [, , policyPath = "policy/stack-lane.json", expectedLane, expectedTechStackLane] = process.argv;
  validateTechStackContract({
    policyPath,
    expectedLane,
    expectedTechStackLane,
    smokeMode: process.env.PI_TECH_STACK_SMOKE === "0" ? "off" : "if-available",
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
