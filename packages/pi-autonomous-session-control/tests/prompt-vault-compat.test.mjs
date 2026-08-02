// summary: "Tests prompt-vault compatibility version, schema, timeout, and report behavior."
// read_when:
//   - "Changing prompt-vault compatibility evaluation or diagnostics."

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  evaluatePromptVaultCompatibility,
  formatPromptVaultCompatibilityReport,
  getPromptVaultCompatibilitySnapshot,
} from "../extensions/self/prompt-vault-compat.ts";

const currentPackage = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
);

const currentPackageVersion = currentPackage.version;

test("evaluatePromptVaultCompatibility reports supported for matching matrix", () => {
  const snapshot = evaluatePromptVaultCompatibility({
    autonomyVersion: "0.1.3",
    vaultClientVersion: "1.2.0",
    schemaVersion: 1,
  });

  assert.equal(snapshot.status, "supported");
  assert.equal(snapshot.checks.autonomyVersionOk, true);
  assert.equal(snapshot.checks.vaultClientVersionOk, true);
  assert.equal(snapshot.checks.schemaVersionOk, true);
});

test("evaluatePromptVaultCompatibility does not reject the current package version", () => {
  const snapshot = evaluatePromptVaultCompatibility({
    autonomyVersion: currentPackageVersion,
    vaultClientVersion: "1.2.0",
    schemaVersion: 1,
  });

  assert.equal(snapshot.autonomyVersion, currentPackageVersion);
  assert.equal(snapshot.minimumAutonomyVersion, "0.1.0");
  assert.equal(snapshot.status, "supported");
  assert.equal(snapshot.checks.autonomyVersionOk, true);
});

test("evaluatePromptVaultCompatibility falls back to historical floor for unparseable package manifest versions", (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "asc-prompt-vault-compat-"));
  t.after(() => rmSync(tempDir, { force: true, recursive: true }));

  const packagePath = join(tempDir, "package.json");
  writeFileSync(packagePath, JSON.stringify({ version: "dev" }), "utf-8");

  const snapshot = evaluatePromptVaultCompatibility({
    autonomyVersion: "0.1.0",
    vaultClientVersion: "1.2.0",
    schemaVersion: 1,
    paths: { autonomyPackagePath: packagePath },
  });

  assert.equal(snapshot.minimumAutonomyVersion, "0.1.3");
  assert.equal(snapshot.status, "limited");
  assert.equal(snapshot.checks.autonomyVersionOk, false);
});

test("evaluatePromptVaultCompatibility does not certify arbitrary low manifest/autonomy versions", (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "asc-prompt-vault-compat-low-"));
  t.after(() => rmSync(tempDir, { force: true, recursive: true }));

  const packagePath = join(tempDir, "package.json");
  writeFileSync(
    packagePath,
    JSON.stringify({
      name: "@tryinget/pi-autonomous-session-control",
      version: "0.0.1",
      exports: { "./execution": "./execution.ts" },
      files: ["extensions/self"],
    }),
    "utf-8",
  );

  const snapshot = evaluatePromptVaultCompatibility({
    autonomyVersion: "0.0.1",
    vaultClientVersion: "1.2.0",
    schemaVersion: 1,
    paths: { autonomyPackagePath: packagePath },
  });

  assert.equal(snapshot.status, "limited");
  assert.equal(snapshot.checks.autonomyVersionOk, false);
  assert.notEqual(snapshot.minimumAutonomyVersion, "0.0.1");
});

test("evaluatePromptVaultCompatibility reports limited for older versions", () => {
  const snapshot = evaluatePromptVaultCompatibility({
    autonomyVersion: "0.0.9",
    vaultClientVersion: "1.1.0",
    schemaVersion: 1,
  });

  assert.equal(snapshot.status, "limited");
  assert.equal(snapshot.checks.autonomyVersionOk, false);
  assert.equal(snapshot.checks.vaultClientVersionOk, false);
});

test("evaluatePromptVaultCompatibility reports incompatible when schema is ahead", () => {
  const snapshot = evaluatePromptVaultCompatibility({
    autonomyVersion: "0.1.3",
    vaultClientVersion: "1.2.0",
    schemaVersion: 2,
  });

  assert.equal(snapshot.status, "incompatible");
  assert.equal(snapshot.checks.schemaVersionOk, false);
  assert.match(snapshot.issues.join("\n"), /schema version 2/i);
});

test("getPromptVaultCompatibilitySnapshot bounds the Dolt schema probe", (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), "asc-prompt-vault-dolt-timeout-"));
  const binDir = join(tempDir, "bin");
  const vaultDir = join(tempDir, "vault-db");
  const fakeDolt = join(binDir, "dolt");
  const previousPath = process.env.PATH;
  const previousTimeout = process.env.PI_PROMPT_VAULT_SCHEMA_PROBE_TIMEOUT_MS;

  t.after(() => {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;

    if (previousTimeout === undefined) delete process.env.PI_PROMPT_VAULT_SCHEMA_PROBE_TIMEOUT_MS;
    else process.env.PI_PROMPT_VAULT_SCHEMA_PROBE_TIMEOUT_MS = previousTimeout;

    rmSync(tempDir, { force: true, recursive: true });
  });

  mkdirSync(binDir, { recursive: true });
  mkdirSync(vaultDir, { recursive: true });
  writeFileSync(fakeDolt, "#!/usr/bin/env bash\nsleep 5\n", { encoding: "utf-8", mode: 0o755 });
  process.env.PATH = `${binDir}:${previousPath || ""}`;
  process.env.PI_PROMPT_VAULT_SCHEMA_PROBE_TIMEOUT_MS = "25";

  const snapshot = getPromptVaultCompatibilitySnapshot({ vaultDir });

  assert.equal(snapshot.status, "unavailable");
  assert.equal(snapshot.schemaVersion, undefined);
  assert.match(snapshot.schemaError, /timed out/i);
});

test("formatPromptVaultCompatibilityReport includes status and recommendations", () => {
  const snapshot = evaluatePromptVaultCompatibility({
    autonomyVersion: "0.1.3",
    vaultClientVersion: "1.2.0",
    schemaVersion: 1,
  });

  const report = formatPromptVaultCompatibilityReport(snapshot);
  assert.match(report, /status: SUPPORTED/);
  assert.match(report, new RegExp(`autonomy >= ${snapshot.minimumAutonomyVersion}`));
  assert.match(report, /Recommended actions/);
});
