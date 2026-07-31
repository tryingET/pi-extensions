#!/usr/bin/env node
import { readFileSync } from "node:fs";
import {
  activateCandidateAdmission,
  authorizeCandidateAdmission,
  captureCandidateAdmissionPressure,
  expireCandidateAdmission,
  prepareCandidateAdmissionReconcileRelease,
  readCandidateAdmissionConfig,
  reconcileCandidateAdmissionLegacyTerminalRelease,
  releaseCandidateAdmission,
  verifyCandidateAdmissionReconcileInput,
  writeCandidateAdmissionConfig,
} from "../src/candidatePeerAdmission.ts";
import { digestObject } from "../src/candidatePeerLifecycleV2.ts";

function usage() {
  console.error(`usage: candidate-admission-v2.mjs <command> [options]
commands:
  configure --input PATH [--expected-digest SHA256]
  status
  authorize --input PATH
  expire --input PATH
  release --input PATH
  prepare-reconcile-release --request ABSOLUTE_PATH --output ABSOLUTE_PATH
  verify-reconcile-input --input ABSOLUTE_PATH
  reconcile-release --input ABSOLUTE_PATH
  activate --input PATH

Reconciliation request, packet, and output directories must be owner-only. Preparation
creates one new canonical 0600 packet durably; verification is read-only; reconciliation
accepts only an absolute normalized no-symlink 0600 packet. Reconciliation output is
redacted. Authorization never creates Git refs, worktrees, processes, or peers.`);
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

let activeCommand;
try {
  const { command, values } = parseArgs(process.argv.slice(2));
  activeCommand = command;
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
  } else if (command === "expire") {
    const permit = expireCandidateAdmission(readInput(values.input));
    console.log(JSON.stringify({ ok: true, command, permit }, null, 2));
  } else if (command === "release") {
    const permit = releaseCandidateAdmission(readInput(values.input));
    console.log(JSON.stringify({ ok: true, command, permit }, null, 2));
  } else if (command === "prepare-reconcile-release") {
    if (!values.request || !values.output) throw new Error("--request and --output are required");
    const result = prepareCandidateAdmissionReconcileRelease(values.request, values.output);
    console.log(JSON.stringify({ ok: true, command, inputDigest: result.inputDigest }));
  } else if (command === "verify-reconcile-input") {
    if (!values.input) throw new Error("--input is required");
    const input = verifyCandidateAdmissionReconcileInput(values.input);
    console.log(JSON.stringify({ ok: true, command, inputDigest: digestObject(input) }));
  } else if (command === "reconcile-release") {
    if (!values.input) throw new Error("--input is required");
    const permit = reconcileCandidateAdmissionLegacyTerminalRelease(values.input);
    console.log(
      JSON.stringify({
        ok: true,
        command,
        status: permit.status,
        releaseOutcome: permit.releaseOutcome,
        reconciliationDigest: permit.terminalReceiptDigest,
      }),
    );
  } else if (command === "activate") {
    const result = activateCandidateAdmission(readInput(values.input));
    console.log(JSON.stringify({ ok: true, command, ...result }, null, 2));
  } else {
    usage();
    process.exitCode = 2;
  }
} catch (error) {
  if (
    ["prepare-reconcile-release", "verify-reconcile-input", "reconcile-release"].includes(
      activeCommand,
    )
  ) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = /lock|locked/i.test(message)
      ? "reconciliation lock unavailable"
      : "reconciliation command rejected";
    console.error(JSON.stringify({ ok: false, command: activeCommand, error: reason }));
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
}
