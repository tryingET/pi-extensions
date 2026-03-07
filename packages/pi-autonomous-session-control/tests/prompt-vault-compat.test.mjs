import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePromptVaultCompatibility,
  formatPromptVaultCompatibilityReport,
} from "../extensions/self/prompt-vault-compat.ts";

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

test("evaluatePromptVaultCompatibility reports limited for older versions", () => {
  const snapshot = evaluatePromptVaultCompatibility({
    autonomyVersion: "0.1.2",
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

test("formatPromptVaultCompatibilityReport includes status and recommendations", () => {
  const snapshot = evaluatePromptVaultCompatibility({
    autonomyVersion: "0.1.3",
    vaultClientVersion: "1.2.0",
    schemaVersion: 1,
  });

  const report = formatPromptVaultCompatibilityReport(snapshot);
  assert.match(report, /status: SUPPORTED/);
  assert.match(report, /Recommended actions/);
});
