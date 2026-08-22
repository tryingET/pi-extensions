/**
summary: "Integration tests for workstation contract generations and health modes."
read_when:
  - "Changing resolveContractForModel, contract refresh, or background health behavior."
*/
import assert from "node:assert/strict";
import test from "node:test";
import {
  refreshWorkstationContractGeneration,
  resolveContractForModel,
  resolveContractStatus,
} from "../extensions/workstation-inference-contract.ts";
import {
  CONTRACT_JSON_ENV,
  contract,
  withInlineContract,
} from "./workstation-inference-test-helpers.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("model resolution stays on one immutable generation until refresh", async () => {
  await withInlineContract(contract({ health_url: undefined }), async () => {
    const first = await resolveContractForModel("baseline-text-visible");
    process.env[CONTRACT_JSON_ENV] = JSON.stringify(
      contract({
        health_url: undefined,
        models: [
          {
            pi_model_id: "baseline-text-visible",
            name: "Updated",
            reasoning: false,
            input: ["text"],
          },
        ],
      }),
    );

    const beforeRefresh = await resolveContractForModel("baseline-text-visible");
    assert.equal(beforeRefresh.generationId, first.generationId);
    assert.equal(beforeRefresh.model.name, "Visible");

    await refreshWorkstationContractGeneration();
    const afterRefresh = await resolveContractForModel("baseline-text-visible");
    assert.notEqual(afterRefresh.generationId, first.generationId);
    assert.equal(afterRefresh.model.name, "Updated");
  });
});

test("background health returns before a slow probe and singleflights callers", async () => {
  const originalFetch = globalThis.fetch;
  const gate = deferred();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return gate.promise;
  };
  try {
    await withInlineContract(contract(), async () => {
      const requests = Promise.all(
        Array.from({ length: 100 }, () =>
          resolveContractForModel("baseline-text-visible", { healthMode: "background" }),
        ),
      );
      const outcome = await Promise.race([
        requests.then(() => "resolved"),
        delay(50).then(() => "blocked"),
      ]);
      assert.equal(outcome, "resolved");
      assert.equal(calls, 1);
      gate.resolve({ ok: true, status: 200 });
      await requests;
    });
  } finally {
    globalThis.fetch = originalFetch;
    gate.resolve({ ok: true, status: 200 });
  }
});

test("blocking health remains available for governed paths", async () => {
  const originalFetch = globalThis.fetch;
  const gate = deferred();
  globalThis.fetch = async () => gate.promise;
  try {
    await withInlineContract(contract(), async () => {
      const request = resolveContractForModel("baseline-text-visible", {
        healthMode: "blocking",
      });
      const outcome = await Promise.race([
        request.then(() => "resolved"),
        delay(25).then(() => "waiting"),
      ]);
      assert.equal(outcome, "waiting");
      gate.resolve({ ok: true, status: 200 });
      assert.equal((await request).model.pi_model_id, "baseline-text-visible");
    });
  } finally {
    globalThis.fetch = originalFetch;
    gate.resolve({ ok: true, status: 200 });
  }
});

test("failed explicit refresh reports the previous generation as usable", async () => {
  await withInlineContract(contract({ health_url: undefined }), async () => {
    await resolveContractStatus();
    process.env[CONTRACT_JSON_ENV] = "{not-json";
    const status = await resolveContractStatus({ refreshContracts: true });
    assert.equal(status.status, "ok");
    assert.match(status.summary, /previous generation/);
    assert.match(status.detail, /contract refresh failed/);
    assert.equal(status.contract?.models[0]?.pi_model_id, "baseline-text-visible");
  });
});
