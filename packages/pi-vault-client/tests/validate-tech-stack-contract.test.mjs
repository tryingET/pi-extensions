import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validateTechStackContract } from "../../../scripts/validate-tech-stack-contract.mjs";

function withTempDir(run) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pi-vault-tech-stack-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writePolicy(dir, command) {
  const policyPath = path.join(dir, "policy.json");
  writeFileSync(
    policyPath,
    JSON.stringify(
      {
        lane: "ts",
        tech_stack_core: {
          tool: "tech-stack-core",
          lane: "pi-ts",
          repository: "https://github.com/lightningralf/tech-stack-core",
          ref: "0123456789abcdef0123456789abcdef01234567",
          command,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  return policyPath;
}

test("validateTechStackContract accepts the exact structured command shape without smoke execution", () => {
  withTempDir((dir) => {
    const policyPath = writePolicy(
      dir,
      "uv tool run --from ~/ai-society/core/tech-stack-core tech-stack-core show pi-ts --prefer-repo",
    );

    assert.doesNotThrow(() => {
      validateTechStackContract({
        policyPath,
        expectedLane: "ts",
        expectedTechStackLane: "pi-ts",
        smokeMode: "off",
      });
    });
  });
});

test("validateTechStackContract rejects shell operators before execution", () => {
  withTempDir((dir) => {
    const proofPath = path.join(dir, "proof.txt");
    const policyPath = writePolicy(
      dir,
      `uv tool run --from ~/ai-society/core/tech-stack-core tech-stack-core show pi-ts --prefer-repo; echo injected > ${proofPath}`,
    );

    assert.throws(() => {
      validateTechStackContract({
        policyPath,
        expectedLane: "ts",
        expectedTechStackLane: "pi-ts",
        smokeMode: "if-available",
      });
    }, /must not contain shell operators, command substitution, or newlines/);
    assert.equal(readFileSync(policyPath, "utf8").includes("proof.txt"), true);
    assert.equal(existsSync(proofPath), false);
  });
});

test("validateTechStackContract rejects commands that deviate from the exact argv contract", () => {
  withTempDir((dir) => {
    const policyPath = writePolicy(
      dir,
      "uv tool run --from ~/ai-society/core/tech-stack-core tech-stack-core show pi-ts --prefer-repo --extra",
    );

    assert.throws(() => {
      validateTechStackContract({
        policyPath,
        expectedLane: "ts",
        expectedTechStackLane: "pi-ts",
        smokeMode: "off",
      });
    }, /must be exactly: uv tool run --from <repo> tech-stack-core show <lane> --prefer-repo/);
  });
});
