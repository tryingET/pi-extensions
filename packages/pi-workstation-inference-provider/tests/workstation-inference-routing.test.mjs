/**
summary: "Preserve adapter aliases and effort controls through Pi's actual transport; assemble streamed tool arguments."
read_when:
  - "Changing workstation request model routing or thinking controls."
*/
import assert from "node:assert/strict";
import test from "node:test";
import { providerModel } from "../extensions/workstation-inference-contract.ts";
import { streamWorkstationInference } from "../extensions/workstation-inference-stream.ts";
import { contract, withInlineContract } from "./workstation-inference-test-helpers.mjs";

const RAW_MODEL = "local/test-aeon-artifact";
const EFFORTS = ["minimal", "low", "medium", "high", "xhigh"];
const COMMAND = "printf AEON_TOOL_PROBE";
const context = {
  messages: [{ role: "user", content: "Call bash with the requested command.", timestamp: 1 }],
  tools: [
    {
      name: "bash",
      description: "A test-only shell tool; never executed by these tests.",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  ],
};

function baselineModel(id = "baseline-text") {
  return {
    pi_model_id: id,
    upstream_model: RAW_MODEL,
    reasoning: id !== "baseline-text-visible",
    thinking_format: "qwen",
    thinking_level_map: Object.fromEntries(EFFORTS.map((effort) => [effort, effort])),
    input: ["text"],
  };
}

// Exercise the real Pi OpenAI SDK/parser, not a mock streamSimple. The server
// names the underlying model, sends a name-only delta, then argument fragments.
function toolResponse() {
  const chunks = [
    { delta: { role: "assistant", content: "" }, finish_reason: null },
    {
      delta: {
        tool_calls: [{ index: 0, id: "call-probe", type: "function", function: { name: "bash" } }],
      },
      finish_reason: null,
    },
    ...['{"command": "', "printf AEON", "_TOOL_PROBE", '"}'].map((argumentsDelta) => ({
      delta: { tool_calls: [{ index: 0, function: { arguments: argumentsDelta } }] },
      finish_reason: null,
    })),
    { delta: {}, finish_reason: "tool_calls" },
  ];
  const sse = `${chunks
    .map(
      (choice) =>
        `data: ${JSON.stringify({
          id: "chat-probe",
          object: "chat.completion.chunk",
          created: 1,
          model: RAW_MODEL,
          choices: [{ index: 0, ...choice }],
        })}\n\n`,
    )
    .join("")}data: [DONE]\n\n`;
  const bytes = new TextEncoder().encode(sse);
  return new Response(
    new ReadableStream({
      start(controller) {
        // Deliberately split JSON, SSE lines and argument strings across reads.
        for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

async function capture(
  selectedModel,
  options = {},
  contractOverrides = {},
  requestContext = context,
) {
  const requests = [];
  let result;
  await withInlineContract(
    contract({ health_url: undefined, models: [selectedModel], ...contractOverrides }),
    async () => {
      const model = {
        ...providerModel(selectedModel),
        provider: "workstation-inference",
        api: "workstation-inference",
        baseUrl: "http://127.0.0.1:1234/v1",
      };
      const stream = streamWorkstationInference(model, requestContext, {
        maxTokens: 1024,
        ...options,
        fetch: async (url, init) => {
          requests.push({ url: String(url), payload: JSON.parse(init.body) });
          return toolResponse();
        },
      });
      for await (const event of stream) {
        assert.notEqual(event.type, "error", event.error?.errorMessage);
        if (event.type === "done") result = event.message;
      }
    },
  );
  assert.equal(requests.length, 1);
  assert.ok(result);
  return { ...requests[0], result };
}

for (const effort of [undefined, ...EFFORTS]) {
  test(`baseline alias preserves adapter-owned effort ${effort ?? "off"}`, async () => {
    const { url, payload, result } = await capture(baselineModel(), { reasoning: effort });
    assert.equal(url, "http://127.0.0.1:1234/v1/chat/completions");
    assert.equal(payload.model, "baseline-text");
    assert.equal(payload.enable_thinking, effort !== undefined);
    assert.equal(payload.reasoning_effort, effort);
    // Budgets and native-effort translation belong to workstation, not Pi.
    assert.equal(payload.thinking_token_budget, undefined);
    assert.equal(payload.tools[0].function.parameters.required[0], "command");
    assert.equal(result.model, "baseline-text");
    assert.equal(result.stopReason, "toolUse");
    assert.deepEqual(result.content.find((block) => block.type === "toolCall").arguments, {
      command: COMMAND,
    });
  });
}

test("visible alias reaches the adapter even with a remembered high effort", async () => {
  const { payload } = await capture(baselineModel("baseline-text-visible"), { reasoning: "high" });
  assert.equal(payload.model, "baseline-text-visible");
  assert.equal(payload.reasoning_effort, undefined);
  assert.equal(payload.enable_thinking, undefined);
  // The adapter's visible alias owns the false default; no duplicated policy.
});

test("canary aliases and the id spelling retain their exact adapter route", async () => {
  const model = { ...baselineModel(), pi_model_id: undefined, id: "baseline-text-canary" };
  const { payload } = await capture(model, {}, { surface: "canary" });
  assert.equal(payload.model, "baseline-text-canary");
});

test("non-baseline contracts retain upstream model routing", async () => {
  const { payload } = await capture(baselineModel(), {}, { family: "native-multimodal" });
  assert.equal(payload.model, RAW_MODEL);
});

test("legacy contracts without a family retain upstream model routing", async () => {
  const { payload } = await capture(baselineModel(), {}, { family: undefined });
  assert.equal(payload.model, RAW_MODEL);
});

test("caller payload hook still runs and tool history retains complete arguments", async () => {
  const first = await capture(baselineModel(), { reasoning: "low" });
  const call = first.result.content.find((block) => block.type === "toolCall");
  let hookModel;
  const next = await capture(
    baselineModel(),
    {
      reasoning: "low",
      onPayload(payload, model) {
        hookModel = model.id;
        return { ...payload, temperature: 0.25 };
      },
    },
    {},
    {
      ...context,
      messages: [
        ...context.messages,
        first.result,
        {
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          content: [{ type: "text", text: "AEON_TOOL_PROBE" }],
          isError: false,
          timestamp: 2,
        },
      ],
    },
  );
  assert.equal(hookModel, "baseline-text");
  assert.equal(next.payload.temperature, 0.25);
  const assistant = next.payload.messages.find((message) => message.role === "assistant");
  assert.deepEqual(JSON.parse(assistant.tool_calls[0].function.arguments), { command: COMMAND });
  assert.ok(next.payload.messages.some((message) => message.role === "tool"));
});
