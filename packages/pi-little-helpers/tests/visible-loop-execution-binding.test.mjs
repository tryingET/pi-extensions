// summary: verifies mandatory persisted execution bindings and private no-replace loop configs.
// read_when:
//   - changing visible-loop binding serialization, run-id safety, or config persistence.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  createVisibleLoopRunConfig,
  resetVisibleLoopRuntimeForRecoveryTest,
  startVisibleLoopChildRunner,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import { createContext } from "./sidequest-harness.mjs";

test("visible-loop child rejects an unbound persisted config before prompt effects", async () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-unbound-config-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const stateDir = `${stateHome}/pi-little-helpers/visible-loop`;
    mkdirSync(stateDir, { recursive: true });
    const configPath = `${stateDir}/visible-loop-unbound-test.json`;
    writeFileSync(
      configPath,
      `${JSON.stringify({
        schemaVersion: 1,
        runId: "visible-loop-unbound-test",
        loopCount: 1,
        cwd: `${stateHome}/repo`,
        prompts: ["must not run"],
        reportBack: "manual",
        createdAt: new Date().toISOString(),
      })}\n`,
    );
    const userMessages = [];
    const harness = createContext({ cwd: `${stateHome}/repo` });

    await startVisibleLoopChildRunner(
      configPath,
      { sendUserMessage: (message) => userMessages.push(message) },
      harness.ctx,
      env,
    );

    assert.deepEqual(userMessages, []);
    assert.match(harness.notifications.at(-1).message, /executionBinding is required/);
    assert.match(harness.notifications.at(-1).message, /--task, --objective, or --candidate/);
  } finally {
    resetVisibleLoopRuntimeForRecoveryTest();
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("visible-loop config creation is private, no-replace, and run-id safe", () => {
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-no-replace-`);
  try {
    const env = { ...process.env, XDG_STATE_HOME: stateHome };
    const config = createVisibleLoopRunConfig({
      loopCount: 1,
      cwd: `${stateHome}/repo`,
      reportBack: "manual",
      executionBinding: { mode: "operator_objective", objective: "no replace test" },
      runId: "visible-loop-no-replace-test",
      prompts: ["bounded work"],
    });
    const configPath = writeVisibleLoopRunConfig(config, env);
    const original = readFileSync(configPath, "utf8");

    assert.equal(statSync(configPath).mode & 0o777, 0o600);
    assert.throws(() => writeVisibleLoopRunConfig(config, env), /EEXIST/);
    assert.equal(readFileSync(configPath, "utf8"), original);

    assert.throws(
      () => writeVisibleLoopRunConfig({ ...config, runId: "../escape" }, env),
      /safe visible-loop identifier/,
    );
  } finally {
    rmSync(stateHome, { recursive: true, force: true });
  }
});

test("candidate execution binding requires its exact owner envelope", () => {
  assert.throws(
    () =>
      createVisibleLoopRunConfig({
        loopCount: 1,
        cwd: "/repo",
        reportBack: "manual",
        executionBinding: {
          mode: "self_evolution_candidate",
          candidateId: "evolution-missing-envelope",
        },
        prompts: ["must not run"],
      }),
    /requires a matching selfEvolutionEnvelope/,
  );
});
