/**
summary: "A startup health timeout must recover inside the first Pi stream, not require resubmitting the prompt."
read_when:
  - "Changing cached-negative health recovery or first-use provider gating."
*/
import assert from "node:assert/strict";
import test from "node:test";
import {
  clearWorkstationHealthCache,
  primeWorkstationHealth,
  providerModel,
  workstationHealthStatus,
} from "../extensions/workstation-inference-contract.ts";
import { streamWorkstationInference } from "../extensions/workstation-inference-stream.ts";
import { contract, withInlineContract } from "./workstation-inference-test-helpers.mjs";

function abortedProbe(signal) {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

function completionResponse() {
  return new Response(
    `data: ${JSON.stringify({
      id: "health-recovery-probe",
      object: "chat.completion.chunk",
      created: 1,
      choices: [
        { index: 0, delta: { role: "assistant", content: "RECOVERED" }, finish_reason: "stop" },
      ],
    })}\n\ndata: [DONE]\n\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

for (const recovery of [
  "healthy",
  "non-json",
  "unhealthy",
  "timeout",
  "dead-lane",
  "body-timeout",
  "body-error",
  "cleared-dead-lane",
]) {
  test(`first stream after primed timeout: ${recovery}`, async () => {
    const oldFetch = globalThis.fetch;
    const envKey = "PI_WORKSTATION_INFERENCE_HEALTH_TIMEOUT_MS";
    const oldTimeout = process.env[envKey];
    process.env[envKey] = "15";
    let healthCalls = 0;
    let providerCalls = 0;
    globalThis.fetch = async (_url, init) => {
      healthCalls += 1;
      if (healthCalls === 1 || recovery === "timeout") return abortedProbe(init.signal);
      if (recovery === "unhealthy") return new Response("unavailable", { status: 503 });
      if (recovery === "non-json") return new Response("OK");
      if (recovery === "body-timeout" || recovery === "body-error") {
        return new Response(
          new ReadableStream({
            start(controller) {
              if (recovery === "body-error") {
                controller.error(new TypeError("health body connection lost"));
              } else {
                controller.enqueue(new TextEncoder().encode('{"status":'));
                init.signal.addEventListener("abort", () => controller.error(init.signal.reason), {
                  once: true,
                });
              }
            },
          }),
        );
      }
      if (recovery === "cleared-dead-lane") clearWorkstationHealthCache();
      return Response.json({
        status: recovery === "dead-lane" ? "degraded-default-lane" : "ok",
        lanes: [
          {
            lane_id: "aeon-test",
            models: ["baseline-text-visible"],
            healthy: !recovery.endsWith("dead-lane"),
            detail: "test lane observation",
          },
        ],
      });
    };
    try {
      await withInlineContract(contract(), async () => {
        // Same priming path used by provider startup; let it really time out.
        await primeWorkstationHealth();
        assert.match(workstationHealthStatus()[0].unhealthy, /health timed out after 15ms/);
        const model = {
          ...providerModel(contract().models[0]),
          provider: "workstation-inference",
          api: "workstation-inference",
          baseUrl: "http://127.0.0.1:1234/v1",
        };
        const events = [];
        for await (const event of streamWorkstationInference(
          model,
          { messages: [{ role: "user", content: "Say RECOVERED", timestamp: 1 }] },
          {
            maxTokens: 32,
            fetch: async () => {
              providerCalls += 1;
              return completionResponse();
            },
          },
        )) {
          events.push(event);
        }
        assert.equal(healthCalls, 2, "first request must await one new health observation");
        if (recovery === "healthy" || recovery === "non-json") {
          assert.equal(providerCalls, 1, "one dispatch, no model retry");
          assert.equal(
            events.some((event) => event.type === "error"),
            false,
          );
          assert.equal(events.at(-1).type, "done");
          assert.equal(events.at(-1).message.content[0].text, "RECOVERED");
        } else {
          assert.equal(providerCalls, 0, "fresh unhealthy observation must deny dispatch");
          assert.equal(events.at(-1).type, "error");
          const expected = {
            unhealthy: /health returned HTTP 503/,
            timeout: /health timed out after 15ms/,
            "dead-lane": /unhealthy lane aeon-test/,
            "body-timeout": /health timed out after 15ms/,
            "body-error": /health body connection lost/,
            "cleared-dead-lane": /health cache cleared during probe/,
          };
          assert.match(events.at(-1).error.errorMessage, expected[recovery]);
        }
      });
    } finally {
      globalThis.fetch = oldFetch;
      if (oldTimeout === undefined) delete process.env[envKey];
      else process.env[envKey] = oldTimeout;
    }
  });
}
