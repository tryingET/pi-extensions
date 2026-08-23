import assert from "node:assert/strict";
import test from "node:test";

import { createSemanticCodeExtension } from "../src/extension.ts";
import type { SciBridge, SciBridgeCallResult } from "../src/mcp-bridge.ts";
import { SCI_COMPOSITE_TOOL_NAMES, type SciCompositeToolName } from "../src/tool-definitions.ts";

const PRODUCER_MESSAGE = "Requested path must stay within the configured workspace";
const PRODUCER_REMEDIATION =
  "Use a path within the configured workspace, expressed as a workspace-relative path or a contained absolute path.";
const SECRET_PATH = "/srv/private/outside.ts";
const SECRET_TOKEN = "xoxb-secret-value-123456";

interface RegisteredTool {
  name: SciCompositeToolName;
  execute: (...args: unknown[]) => Promise<unknown>;
}

function boundaryResult(): SciBridgeCallResult {
  return {
    isError: true,
    error: {
      code: "InvalidParams",
      message: PRODUCER_MESSAGE,
      data: {
        reason: "outside_workspace",
        remediation: PRODUCER_REMEDIATION,
      },
    },
    content: [{ type: "text", text: PRODUCER_MESSAGE }],
  };
}

function createErrorHarness(resultFactory: (name: SciCompositeToolName) => SciBridgeCallResult) {
  const tools = new Map<SciCompositeToolName, RegisteredTool>();
  const calls: SciCompositeToolName[] = [];
  const bridge: SciBridge = {
    async callTool(name) {
      calls.push(name);
      return resultFactory(name);
    },
    async advertisedToolNames() {
      return [...SCI_COMPOSITE_TOOL_NAMES];
    },
    async close() {},
  };
  createSemanticCodeExtension({ bridgeFactory: () => bridge })({
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
    registerEntryRenderer() {},
    appendEntry() {},
    on() {},
  } as never);
  return { tools, calls };
}

async function rejectedMessage(tool: RegisteredTool): Promise<string> {
  let observed: unknown;
  try {
    await tool.execute("boundary-call", {}, undefined, undefined, { cwd: "/workspace/repo" });
  } catch (error) {
    observed = error;
  }
  assert.ok(
    observed instanceof Error,
    "native tool must throw so Pi marks the result isError:true",
  );
  return observed.message;
}

test("all six native tools project the exact workspace-boundary envelope into local recovery text", async () => {
  const harness = createErrorHarness(() => boundaryResult());

  for (const name of SCI_COMPOSITE_TOOL_NAMES) {
    const tool = harness.tools.get(name);
    assert.ok(tool);
    const message = await rejectedMessage(tool);
    assert.equal(
      message,
      `SCI workflow ${name} rejected the request (reason: outside_workspace). Retry with a workspace-relative path or an absolute path contained by the configured workspace. Producer diagnostics, paths, and stderr were withheld.`,
    );
    assert.equal(message.includes(PRODUCER_MESSAGE), false);
    assert.equal(message.includes(PRODUCER_REMEDIATION), false);
    assert.doesNotMatch(message, /\/srv\/private|xoxb-secret/);
  }

  assert.deepEqual(harness.calls, [...SCI_COMPOSITE_TOOL_NAMES]);
});

test("forged or drifted boundary metadata falls back to the generic redacted error", async () => {
  const cases: Array<{ label: string; result: SciBridgeCallResult }> = [
    {
      label: "reason appears only in producer content",
      result: {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              reason: "outside_workspace",
              remediation: `${SECRET_PATH} ${SECRET_TOKEN}`,
            }),
          },
        ],
      },
    },
    {
      label: "top-level diagnostics extension",
      result: {
        ...boundaryResult(),
        diagnostics: `${SECRET_PATH} ${SECRET_TOKEN}`,
      },
    },
    {
      label: "top-level structured content extension",
      result: {
        ...boundaryResult(),
        structuredContent: { path: SECRET_PATH, token: SECRET_TOKEN },
      },
    },
    {
      label: "top-level MCP metadata extension",
      result: {
        ...boundaryResult(),
        _meta: { stderr: `${SECRET_PATH} ${SECRET_TOKEN}` },
      },
    },
    {
      label: "missing isError flag",
      result: {
        error: boundaryResult().error,
        content: boundaryResult().content,
      },
    },
    {
      label: "false isError with error envelope",
      result: {
        ...boundaryResult(),
        isError: false,
      },
    },
    {
      label: "non-boolean isError",
      result: {
        ...boundaryResult(),
        isError: "true" as never,
      },
    },
    {
      label: "wrong code",
      result: {
        ...boundaryResult(),
        error: { ...(boundaryResult().error as object), code: "InternalError" },
      },
    },
    {
      label: "producer message drift",
      result: {
        ...boundaryResult(),
        error: {
          ...(boundaryResult().error as object),
          message: `outside ${SECRET_PATH} ${SECRET_TOKEN}`,
        },
      },
    },
    {
      label: "producer remediation drift",
      result: {
        ...boundaryResult(),
        error: {
          ...(boundaryResult().error as object),
          data: {
            reason: "outside_workspace",
            remediation: `Use ${SECRET_PATH} with ${SECRET_TOKEN}`,
          },
        },
      },
    },
    {
      label: "unexpected producer data",
      result: {
        ...boundaryResult(),
        error: {
          ...(boundaryResult().error as object),
          data: {
            reason: "outside_workspace",
            remediation: PRODUCER_REMEDIATION,
            path: SECRET_PATH,
          },
        },
      },
    },
    {
      label: "unexpected error field",
      result: {
        ...boundaryResult(),
        error: {
          ...(boundaryResult().error as object),
          stack: `${SECRET_PATH} ${SECRET_TOKEN}`,
        },
      },
    },
    {
      label: "missing fixed content receipt",
      result: { ...boundaryResult(), content: [] },
    },
    {
      label: "extra producer content",
      result: {
        ...boundaryResult(),
        content: [
          { type: "text", text: PRODUCER_MESSAGE },
          { type: "text", text: `${SECRET_PATH} ${SECRET_TOKEN}` },
        ],
      },
    },
  ];

  for (const { label, result } of cases) {
    const harness = createErrorHarness(() => structuredClone(result));
    const tool = harness.tools.get("locate_confirm_definition");
    assert.ok(tool);
    const message = await rejectedMessage(tool);
    assert.equal(
      message,
      "SCI workflow locate_confirm_definition returned an error. Producer diagnostics, paths, and stderr were withheld.",
      label,
    );
    assert.doesNotMatch(message, /\/srv\/private|xoxb-secret/, label);
  }
});
