#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { evaluateSourceSelectionExperiment } from "../src/source-selection-experiment.js";

function usage() {
  return "usage: node scripts/run-source-selection-experiment.mjs --input FILE --input-sha256 HEX --output FILE";
}

function parseArguments(arguments_) {
  const allowed = new Set(["--input", "--input-sha256", "--output"]);
  const values = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!allowed.has(key) || !value || values.has(key)) throw new Error(usage());
    values.set(key, value);
  }
  if (values.size !== allowed.size) throw new Error(usage());
  const expectedHash = values.get("--input-sha256");
  if (!/^[0-9a-f]{64}$/.test(expectedHash))
    throw new Error("--input-sha256 must be a lowercase SHA-256 hex digest");
  return {
    input: values.get("--input"),
    inputSha256: expectedHash,
    output: values.get("--output"),
  };
}

const options = parseArguments(process.argv.slice(2));
const inputBytes = await readFile(options.input);
const actualHash = createHash("sha256").update(inputBytes).digest("hex");
if (actualHash !== options.inputSha256) {
  throw new Error(
    `prepared input hash mismatch: expected ${options.inputSha256}, received ${actualHash}`,
  );
}

const experiment = JSON.parse(inputBytes.toString("utf8"));
const result = evaluateSourceSelectionExperiment(experiment);
const output = `${JSON.stringify({ inputSha256: actualHash, result }, null, 2)}\n`;
await writeFile(options.output, output, { encoding: "utf8", flag: "wx" });
process.stdout.write(
  `${createHash("sha256").update(output, "utf8").digest("hex")}  ${options.output}\n`,
);
