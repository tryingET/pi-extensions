import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function listGenerated(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) results.push(...listGenerated(absolute));
    else if (entry.endsWith(".js") || entry.endsWith(".d.ts")) results.push(absolute);
  }
  return results.sort();
}

function artifactFiles() {
  return [path.join(root, "extensions/vault.js"), ...listGenerated(path.join(root, "src"))].sort();
}

function snapshot() {
  return new Map(
    artifactFiles().map((file) => {
      const bytes = readFileSync(file);
      return [
        path.relative(root, file),
        { bytes, sha256: createHash("sha256").update(bytes).digest("hex") },
      ];
    }),
  );
}

function restore(before, after, drift) {
  for (const relative of drift) {
    const absolute = path.join(root, relative);
    const original = before.get(relative);
    if (original) writeFileSync(absolute, original.bytes);
    else if (after.has(relative) && existsSync(absolute)) unlinkSync(absolute);
  }
}

const before = snapshot();
execFileSync(process.execPath, [path.join(root, "scripts/build-runtime.mjs"), "--quiet"], {
  cwd: root,
  stdio: "inherit",
});
const after = snapshot();
const drift = [...new Set([...before.keys(), ...after.keys()])].filter(
  (file) => before.get(file)?.sha256 !== after.get(file)?.sha256,
);
if (drift.length > 0) {
  restore(before, after, drift);
  console.error("Generated package artifacts were stale before build (working tree restored):");
  for (const file of drift) console.error(`- ${file}`);
  process.exit(1);
}
console.log(`Generated runtime clean (${after.size} JavaScript/declaration artifacts).`);
