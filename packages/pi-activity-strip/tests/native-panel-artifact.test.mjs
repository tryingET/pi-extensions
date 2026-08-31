// ---
// summary: "verifies the staged native panel matches its source lock and artifact receipt"
// read_when:
//   - "changing native panel packaging, build metadata, or binary selection"
// ---

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(packageRoot, "native", "bin", "linux-x64-gnu");
const binaryPath = path.join(artifactDir, "pi-activity-strip-panel");
const artifactPath = path.join(artifactDir, "artifact.json");
const lockPath = path.join(packageRoot, "native", "panel", "Cargo.lock");

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sourceSha256() {
  const panelRoot = path.join(packageRoot, "native", "panel");
  const files = ["Cargo.toml", "Cargo.lock"];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(path.join(panelRoot, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(relative);
      else if (entry.isFile()) files.push(relative);
    }
  };
  visit("src");
  files.sort();
  const manifest = files
    .map((relative) => `${sha256(path.join(panelRoot, relative))}  ${relative}\n`)
    .join("");
  return createHash("sha256").update(manifest).digest("hex");
}

test("staged native panel is executable and bound to its Cargo lock", () => {
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const binary = fs.readFileSync(binaryPath);
  const mode = fs.statSync(binaryPath).mode;

  assert.equal(artifact.schema, "pi-activity-strip-native-artifact.v1");
  assert.equal(artifact.target, "x86_64-unknown-linux-gnu");
  assert.equal(binary.subarray(0, 4).toString("hex"), "7f454c46");
  assert.notEqual(mode & 0o111, 0);
  assert.equal(artifact.sha256, sha256(binaryPath));
  assert.equal(artifact.cargoLockSha256, sha256(lockPath));
  assert.equal(artifact.sourceSha256, sourceSha256());
  assert.match(artifact.rustc, /^rustc 1\.98\.0 /);
  assert.match(artifact.glibcFloor, /^GLIBC_/);
  assert.ok(artifact.neededSonames.includes("libgtk4-layer-shell.so.0"));
  assert.ok(artifact.neededSonames.includes("libgtk-4.so.1"));
});
