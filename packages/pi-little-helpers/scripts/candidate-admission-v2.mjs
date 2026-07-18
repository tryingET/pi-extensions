#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  activateCandidateAdmission,
  authorizeCandidateAdmission,
  captureCandidateAdmissionPressure,
  readCandidateAdmissionConfig,
  releaseCandidateAdmission,
  writeCandidateAdmissionConfig,
} from "../src/candidatePeerAdmission.ts";

function usage() {
  console.error(`usage: candidate-admission-v2.mjs <command> [options]
commands:
  configure --input PATH [--expected-digest SHA256]
  status
  authorize --input PATH
  release --input PATH
  activate --input PATH

Input files are owner-authored JSON. All mutations use owner-only files and an exclusive
admission lock. Authorization never creates Git refs, worktrees, processes, or peers.`);
}

function parseArgs(argv) {
  const command = argv[0];
  const values = {};
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || index + 1 >= argv.length)
      throw new Error(`invalid argument: ${key}`);
    values[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return { command, values };
}

function readInput(path) {
  if (!path) throw new Error("--input is required");
  return JSON.parse(readFileSync(path, "utf8"));
}

try {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (command === "configure") {
    const result = writeCandidateAdmissionConfig(
      readInput(values.input),
      process.env,
      values["expected-digest"],
    );
    console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
  } else if (command === "status") {
    console.log(
      JSON.stringify(
        {
          ok: true,
          command,
          config: readCandidateAdmissionConfig(),
          pressure: captureCandidateAdmissionPressure(),
        },
        null,
        2,
      ),
    );
  } else if (command === "authorize") {
    const permit = authorizeCandidateAdmission(readInput(values.input));
    console.log(JSON.stringify({ ok: true, command, permit }, null, 2));
  } else if (command === "release") {
    const permit = releaseCandidateAdmission(readInput(values.input));
    console.log(JSON.stringify({ ok: true, command, permit }, null, 2));
  } else if (command === "activate") {
    const result = activateCandidateAdmission(readInput(values.input));
    console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
  } else {
    usage();
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
