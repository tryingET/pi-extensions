#!/usr/bin/env node
import { lstatSync, readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { MODE_DEFINITION_MAX_BYTES, parseModeDefinition } from "../src/mode-definitions.ts";
import { MODE_PRESET_MAX_BYTES, parseModePreset } from "../src/mode-presets.ts";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: npm run mode:lint -- <mode-or-preset.json> [...]");
  process.exit(2);
}

let failures = 0;
for (const path of paths) {
  try {
    if (extname(path) !== ".json") throw new Error("file must use .json extension");
    if (lstatSync(path).isSymbolicLink()) throw new Error("symbolic links are not accepted");
    const size = statSync(path).size;
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const preset = raw && typeof raw === "object" && "selection" in raw;
    if (size > (preset ? MODE_PRESET_MAX_BYTES : MODE_DEFINITION_MAX_BYTES)) {
      throw new Error("file exceeds the bounded input size");
    }
    const parsed = preset ? parseModePreset(raw) : parseModeDefinition(raw);
    if (basename(path) !== `${parsed.key}.json`) {
      throw new Error(`filename must be ${parsed.key}.json`);
    }
    console.log(`OK ${path} (${preset ? "preset" : "mode"})`);
  } catch (error) {
    failures++;
    console.error(`ERROR ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
process.exitCode = failures > 0 ? 1 : 0;
