#!/usr/bin/env node
/**
summary: "Creates and verifies deterministic durable archives for retained npm release evidence."
read_when:
  - "Changing GitHub Release evidence retention, archive reproducibility, or release recovery."
*/

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REQUIRED_SUFFIXES = [
  ".tgz",
  ".manifest.json",
  ".evidence.json",
  ".spdx.json",
  ".provenance.sigstore.json",
  ".sbom.sigstore.json",
  ".evidence.sigstore.json",
];
const SHA256_RE = /^[0-9a-f]{64}$/u;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {};
  while (args.length > 0) {
    const flag = args.shift();
    if (!flag?.startsWith("--")) fail(`Unexpected argument: ${String(flag)}`);
    const value = args.shift();
    if (value === undefined || value.startsWith("--")) fail(`Missing value for ${flag}`);
    options[flag.slice(2)] = value;
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== "string" || !value.trim()) fail(`Missing --${name}`);
  return value;
}

function canonicalExisting(value) {
  return fs.realpathSync(path.resolve(value));
}

function assertOutside(parent, child, label) {
  const relative = path.relative(parent, child);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    fail(`${label} must be outside ${parent}`);
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    for (;;) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function walkEvidence(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
      if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
        fail(`Unsafe evidence path: ${relative}`);
      }
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) fail(`Release evidence must not contain symlinks: ${relative}`);
      if (stat.isDirectory()) visit(absolute);
      else if (stat.isFile()) files.push(relative);
      else fail(`Release evidence must contain only regular files and directories: ${relative}`);
    }
  };
  visit(root);
  files.sort();
  if (files.length === 0) fail("Release evidence directory is empty");
  for (const suffix of REQUIRED_SUFFIXES) {
    if (!files.some((file) => file.endsWith(suffix))) {
      fail(`Release evidence is missing a required ${suffix} file`);
    }
  }
  return files;
}

function writeEnv(envFile, values) {
  if (!envFile) return;
  const text = `${Object.entries(values)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\n")}\n`;
  fs.appendFileSync(path.resolve(envFile), text, "utf8");
}

function writeNoClobber(filePath, bytes, mode = 0o600) {
  const fd = fs.openSync(filePath, "wx", mode);
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function archiveEntries(archivePath) {
  const stdout = execFileSync("tar", ["-tzf", archivePath], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const entries = stdout
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((entry) => entry.replace(/^\.\//u, ""));
  for (const entry of entries) {
    if (path.posix.isAbsolute(entry) || entry === ".." || entry.startsWith("../") || entry.includes("/../")) {
      fail(`Unsafe archive entry: ${entry}`);
    }
  }
  return entries;
}

function verifyArchive(options) {
  const archivePath = canonicalExisting(requireOption(options, "archive"));
  const checksumPath = canonicalExisting(requireOption(options, "checksum"));
  const stat = fs.lstatSync(archivePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("Evidence archive must be a regular file");
  if (stat.size <= 0 || stat.size > MAX_ARCHIVE_BYTES) fail("Evidence archive size is invalid");
  const expectedLine = fs.readFileSync(checksumPath, "utf8");
  const expectedMatch = expectedLine.match(/^([0-9a-f]{64})  ([^\n]+)\n$/u);
  if (!expectedMatch) fail("Evidence archive checksum sidecar is malformed");
  if (expectedMatch[2] !== path.basename(archivePath)) fail("Evidence archive checksum names another file");
  const actual = sha256File(archivePath);
  if (actual !== expectedMatch[1]) fail(`Evidence archive SHA-256 changed: ${actual}`);
  execFileSync("gzip", ["-t", archivePath], { stdio: "inherit" });
  const entries = archiveEntries(archivePath);
  for (const suffix of REQUIRED_SUFFIXES) {
    if (!entries.some((entry) => entry.endsWith(suffix))) {
      fail(`Evidence archive is missing a required ${suffix} entry`);
    }
  }
  process.stdout.write(`Verified durable release evidence archive ${path.basename(archivePath)} (${actual}).\n`);
  return { archivePath, checksumPath, sha256: actual, entries };
}

function createArchive(options) {
  const directory = canonicalExisting(requireOption(options, "directory"));
  const directoryStat = fs.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    fail("Evidence source must be a real directory");
  }
  const output = path.resolve(requireOption(options, "output"));
  const epoch = Number(requireOption(options, "source-date-epoch"));
  if (!Number.isSafeInteger(epoch) || epoch < 0) fail("--source-date-epoch must be a non-negative integer");
  assertOutside(directory, output, "Evidence archive");
  if (fs.existsSync(output) || fs.existsSync(`${output}.sha256`)) fail("Evidence archive output already exists");
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  walkEvidence(directory);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-release-evidence-archive-"));
  const tarPath = path.join(tempRoot, "evidence.tar");
  const gzipPath = path.join(tempRoot, "evidence.tar.gz");
  try {
    execFileSync(
      "tar",
      [
        "--sort=name",
        `--mtime=@${epoch}`,
        "--owner=0",
        "--group=0",
        "--numeric-owner",
        "--format=posix",
        "--pax-option=delete=atime,delete=ctime",
        "-C",
        directory,
        "-cf",
        tarPath,
        ".",
      ],
      { stdio: "inherit" },
    );
    const compressed = execFileSync("gzip", ["-n", "-9", "-c", tarPath], {
      encoding: null,
      maxBuffer: MAX_ARCHIVE_BYTES,
    });
    writeNoClobber(gzipPath, compressed);
    fs.renameSync(gzipPath, output);
    const digest = sha256File(output);
    const checksumPath = `${output}.sha256`;
    writeNoClobber(checksumPath, Buffer.from(`${digest}  ${path.basename(output)}\n`, "utf8"));
    verifyArchive({ archive: output, checksum: checksumPath });
    writeEnv(options["output-env-file"], {
      RELEASE_EVIDENCE_ARCHIVE_PATH: output,
      RELEASE_EVIDENCE_ARCHIVE_NAME: path.basename(output),
      RELEASE_EVIDENCE_ARCHIVE_SHA256: digest,
      RELEASE_EVIDENCE_ARCHIVE_CHECKSUM_PATH: checksumPath,
    });
    process.stdout.write(`${JSON.stringify({ archive: output, checksum: checksumPath, sha256: digest }, null, 2)}\n`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "create") return createArchive(options);
  if (command === "verify") return verifyArchive(options);
  fail("Usage: release-evidence-archive.mjs <create|verify> [options]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export { archiveEntries, sha256File, walkEvidence };
