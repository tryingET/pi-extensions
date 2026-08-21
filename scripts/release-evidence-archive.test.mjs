// ---
// summary: "Tests deterministic durable release evidence archives, no-clobber behavior, and tamper rejection."
// read_when:
//   - "Changing release-evidence-archive.mjs or GitHub Release asset retention."
// ---

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "release-evidence-archive.mjs");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

function evidenceFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-evidence-fixture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "evidence");
  fs.mkdirSync(path.join(directory, "local-dependencies"), { recursive: true });
  const files = {
    "tryinget-fixture-1.0.0.tgz": "main tarball",
    "tryinget-fixture-1.0.0.tgz.sha256": "0".repeat(64) + "  tryinget-fixture-1.0.0.tgz\n",
    "tryinget-fixture-1.0.0.tgz.manifest.json": "{}\n",
    "tryinget-fixture-1.0.0.tgz.evidence.json": "{}\n",
    "tryinget-fixture-1.0.0.tgz.spdx.json": "{}\n",
    "tryinget-fixture-1.0.0.tgz.provenance.sigstore.json": "{}\n",
    "tryinget-fixture-1.0.0.tgz.sbom.sigstore.json": "{}\n",
    "tryinget-fixture-1.0.0.tgz.evidence.sigstore.json": "{}\n",
    "local-dependencies/tryinget-dependency-0.1.0.tgz": "dependency",
  };
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
  }
  return { root, directory };
}

function create(directory, output) {
  return run([
    "create",
    "--directory",
    directory,
    "--output",
    output,
    "--source-date-epoch",
    "1700000000",
  ]);
}

test("creates byte-identical archives for identical evidence", (t) => {
  const fixture = evidenceFixture(t);
  const first = path.join(fixture.root, "first.release-evidence.tar.gz");
  const second = path.join(fixture.root, "second.release-evidence.tar.gz");
  let result = create(fixture.directory, first);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  result = create(fixture.directory, second);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(sha256(first), sha256(second));
  assert.equal(fs.readFileSync(`${first}.sha256`, "utf8").split("  ")[0], sha256(first));

  const verified = run(["verify", "--archive", first, "--checksum", `${first}.sha256`]);
  assert.equal(verified.status, 0, `${verified.stdout}\n${verified.stderr}`);
  assert.match(verified.stdout, /Verified durable release evidence archive/u);
});

test("fails closed on archive tampering and output clobber", (t) => {
  const fixture = evidenceFixture(t);
  const output = path.join(fixture.root, "evidence.tar.gz");
  let result = create(fixture.directory, output);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const duplicate = create(fixture.directory, output);
  assert.notEqual(duplicate.status, 0);
  assert.match(`${duplicate.stdout}\n${duplicate.stderr}`, /already exists/u);

  fs.appendFileSync(output, "tamper", "utf8");
  result = run(["verify", "--archive", output, "--checksum", `${output}.sha256`]);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /SHA-256 changed/u);
});

test("rejects symlinks, incomplete evidence, and output inside the source directory", (t) => {
  const fixture = evidenceFixture(t);
  fs.symlinkSync("tryinget-fixture-1.0.0.tgz", path.join(fixture.directory, "alias.tgz"));
  let result = create(fixture.directory, path.join(fixture.root, "symlink.tar.gz"));
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /must not contain symlinks/u);
  fs.unlinkSync(path.join(fixture.directory, "alias.tgz"));

  result = create(fixture.directory, path.join(fixture.directory, "inside.tar.gz"));
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /must be outside/u);

  fs.unlinkSync(path.join(fixture.directory, "tryinget-fixture-1.0.0.tgz.sbom.sigstore.json"));
  result = create(fixture.directory, path.join(fixture.root, "incomplete.tar.gz"));
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /missing a required/u);
});
