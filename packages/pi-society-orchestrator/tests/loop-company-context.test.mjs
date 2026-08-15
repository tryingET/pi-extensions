/**
summary: "Tests ambient company resolution for cognitive tools and the loop-runs checkpoint store env override."
read_when:
  - "Changing resolveAmbientCompanyContext, LoopRunCheckpointStore defaults, or test-state isolation for loop tools."
*/
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LoopRunCheckpointStore } from "../src/loops/run-checkpoint.ts";
import { resolveAmbientCompanyContext } from "../src/runtime/cognitive-tools.ts";

function fakeRuntime(source, company = "softwareco") {
  return {
    resolveCurrentCompanyContext(_cwd) {
      return { company, source };
    },
  };
}

test("resolveAmbientCompanyContext: explicit lookup context wins", () => {
  const company = resolveAmbientCompanyContext(fakeRuntime("cwd:/x"), {
    currentCompany: "core",
  });
  assert.equal(company, "core");
});

test("resolveAmbientCompanyContext: PI_COMPANY env beats ambient inference", () => {
  const previous = process.env.PI_COMPANY;
  try {
    process.env.PI_COMPANY = "holdingco";
    const company = resolveAmbientCompanyContext(fakeRuntime("cwd:/x"));
    assert.equal(company, "holdingco");
  } finally {
    if (previous === undefined) delete process.env.PI_COMPANY;
    else process.env.PI_COMPANY = previous;
  }
});

test("resolveAmbientCompanyContext: ambient inference resolves company-less scratch contexts (51-run regression)", () => {
  // Regression for the 51 loop-tool failures: a scratch cwd asserts nothing
  // about company, so ambient context must carry through instead of the
  // prompt plane failing closed.
  const company = resolveAmbientCompanyContext(fakeRuntime("cwd:/home/x/softwareco/y"), {
    cwd: "/tmp/pi-orch-loop-tool-no-company",
  });
  assert.equal(company, "softwareco");
});

test("resolveAmbientCompanyContext: unresolvable ambient returns undefined (fail-closed preserved)", () => {
  const company = resolveAmbientCompanyContext(fakeRuntime("contract-default"));
  assert.equal(company, undefined);
});

test("resolveAmbientCompanyContext: missing runtime resolver returns undefined", () => {
  const company = resolveAmbientCompanyContext({});
  assert.equal(company, undefined);
});
test("LoopRunCheckpointStore: PI_ORCH_LOOP_RUNS_DIR redirects the default store root away from live operator state", () => {
  const previous = process.env.PI_ORCH_LOOP_RUNS_DIR;
  const scratch = mkdtempSync(path.join(os.tmpdir(), "loop-runs-redirect-"));
  try {
    process.env.PI_ORCH_LOOP_RUNS_DIR = path.join(scratch, "loop-runs");
    const store = new LoopRunCheckpointStore();
    assert.equal(store.rootDir, process.env.PI_ORCH_LOOP_RUNS_DIR);
    assert.ok(
      !existsSync(
        path.join(
          os.homedir(),
          ".pi",
          "agent",
          "state",
          "pi-society-orchestrator",
          "loop-runs",
          "sentinel-that-would-prove-live-writes",
        ),
      ),
    );
    store.create({
      runId: "kaizen-1786745821676",
      plugin: "kaizen",
      pluginSemanticsHash: "hash",
      phases: ["plan"],
      objective: "test",
      cwd: scratch,
      artifactHashes: {},
      stateFingerprint: "fingerprint",
    });
    assert.ok(
      existsSync(path.join(process.env.PI_ORCH_LOOP_RUNS_DIR, "kaizen-1786745821676.run.json")),
    );
  } finally {
    if (previous === undefined) delete process.env.PI_ORCH_LOOP_RUNS_DIR;
    else process.env.PI_ORCH_LOOP_RUNS_DIR = previous;
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("LoopRunCheckpointStore: explicit root is honored without the env override", () => {
  const store = new LoopRunCheckpointStore(path.join(os.tmpdir(), "loop-runs-explicit"));
  assert.ok(store.rootDir.endsWith("loop-runs-explicit"));
});
