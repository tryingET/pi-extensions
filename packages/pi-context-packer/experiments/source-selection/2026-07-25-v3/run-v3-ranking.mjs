#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { evaluateV3Experiment } from "./v3-experiment.mjs";

function usage() {
  return "usage: node run-v3-ranking.mjs --input FILE --input-sha256 HEX --output FILE";
}

function parseArguments(args) {
  const allowed = new Set(["--input", "--input-sha256", "--output"]);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!allowed.has(key) || !value || values.has(key)) throw new Error(usage());
    values.set(key, value);
  }
  if (values.size !== allowed.size) throw new Error(usage());
  if (!/^[a-f0-9]{64}$/u.test(values.get("--input-sha256"))) {
    throw new Error("--input-sha256 must be lowercase SHA-256 hex");
  }
  return {
    input: values.get("--input"),
    inputSha256: values.get("--input-sha256"),
    output: values.get("--output"),
  };
}

const options = parseArguments(process.argv.slice(2));
const inputBytes = await readFile(options.input);
const actualHash = createHash("sha256").update(inputBytes).digest("hex");
if (actualHash !== options.inputSha256) throw new Error("prepared input SHA-256 mismatch");
const result = evaluateV3Experiment(JSON.parse(inputBytes.toString("utf8")));
const output = `${JSON.stringify({ inputSha256: actualHash, result }, null, 2)}\n`;
await writeFile(options.output, output, { flag: "wx", mode: 0o644 });
process.stdout.write(
  `${createHash("sha256").update(output, "utf8").digest("hex")}  ${options.output}\n`,
);
