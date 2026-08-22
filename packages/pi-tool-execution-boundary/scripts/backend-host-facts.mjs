import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectHostFacts } from "../src/host-facts.js";

const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
const stateIndex = process.argv.indexOf("--state-path");
const statePath = stateIndex >= 0 ? process.argv[stateIndex + 1] : process.cwd();
const facts = collectHostFacts({ statePath });
const text = `${JSON.stringify(facts, null, 2)}\n`;
if (output) {
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(path.resolve(output), text, { mode: 0o600 });
}
process.stdout.write(text);
