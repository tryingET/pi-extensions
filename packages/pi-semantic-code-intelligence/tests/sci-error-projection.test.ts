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

async function rejectedMessage(
  tool: RegisteredTool,
  params: Record<string, unknown> = {},
): Promise<string> {
  let observed: unknown;
  try {
    await tool.execute("boundary-call", params, undefined, undefined, { cwd: "/workspace/repo" });
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
      `SCI workflow ${name} rejected the request (reason: outside_workspace). Use a repo-relative path in a Pi session started at the target repository root. A shell cd does not rebind this Pi session's workspace; start a target-root Pi session and retry. Producer diagnostics, paths, and stderr were withheld.`,
    );
    assert.equal(message.includes(PRODUCER_MESSAGE), false);
    assert.equal(message.includes(PRODUCER_REMEDIATION), false);
    assert.doesNotMatch(message, /\/srv\/private|xoxb-secret/);
  }

  assert.deepEqual(harness.calls, [...SCI_COMPOSITE_TOOL_NAMES]);
});

test("allowlisted reason projection tolerates safe producer wording drift without echoing it", async () => {
  const bridgeMessage = "The requested file does not belong to this workspace.";
  const bridgeRemediation = "Open the intended project and use a relative file.";
  const harness = createErrorHarness(() => ({
    isError: true,
    error: {
      code: "InvalidParams",
      message: bridgeMessage,
      data: {
        reason: "outside_workspace",
        remediation: bridgeRemediation,
      },
    },
    content: [{ type: "text", text: bridgeMessage }],
  }));
  const tool = harness.tools.get("locate_confirm_definition");
  assert.ok(tool);

  const message = await rejectedMessage(tool);
  assert.match(message, /reason: outside_workspace/);
  assert.match(message, /target repository root/);
  assert.match(message, /shell cd does not rebind/);
  assert.equal(message.includes(bridgeMessage), false);
  assert.equal(message.includes(bridgeRemediation), false);
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
      label: "unknown reason",
      result: {
        ...boundaryResult(),
        error: {
          ...(boundaryResult().error as object),
          data: {
            reason: "future_reason",
            remediation: "Use a bounded recovery path.",
          },
        },
      },
    },
    {
      label: "bare password assignment in producer message",
      result: {
        ...boundaryResult(),
        error: { ...(boundaryResult().error as object), message: "PASSWORD=hunter2" },
        content: [{ type: "text", text: "PASSWORD=hunter2" }],
      },
    },
    {
      label: "password-labelled producer remediation",
      result: {
        ...boundaryResult(),
        error: {
          ...(boundaryResult().error as object),
          data: {
            reason: "outside_workspace",
            remediation: "password: hunter2",
          },
        },
      },
    },
    {
      label: "stderr-labelled producer message",
      result: {
        ...boundaryResult(),
        error: { ...(boundaryResult().error as object), message: "stderr: connection reset" },
        content: [{ type: "text", text: "stderr: connection reset" }],
      },
    },
    {
      label: "empty producer prose",
      result: {
        ...boundaryResult(),
        error: {
          ...(boundaryResult().error as object),
          message: "",
          data: { reason: "outside_workspace", remediation: "" },
        },
        content: [{ type: "text", text: "" }],
      },
    },
    {
      label: "inconsistent producer content receipt",
      result: {
        ...boundaryResult(),
        content: [{ type: "text", text: "Different safe producer wording." }],
      },
    },
    {
      label: "stderr prose without punctuation label",
      result: {
        ...boundaryResult(),
        error: { ...(boundaryResult().error as object), message: "stderr output follows" },
        content: [{ type: "text", text: "stderr output follows" }],
      },
    },
    {
      label: "password prose without punctuation label",
      result: {
        ...boundaryResult(),
        error: { ...(boundaryResult().error as object), message: "password is hunter" },
        content: [{ type: "text", text: "password is hunter" }],
      },
    },
    {
      label: "stack trace prose",
      result: {
        ...boundaryResult(),
        error: { ...(boundaryResult().error as object), message: "stack trace: redacted" },
        content: [{ type: "text", text: "stack trace: redacted" }],
      },
    },
    {
      label: "unicode control-bearing prose",
      result: {
        ...boundaryResult(),
        error: { ...(boundaryResult().error as object), message: "workspace\u0085mismatch" },
        content: [{ type: "text", text: "workspace\u0085mismatch" }],
      },
    },
    {
      label: "secret-bearing producer message",
      result: {
        ...boundaryResult(),
        error: {
          ...(boundaryResult().error as object),
          message: `outside ${SECRET_PATH} ${SECRET_TOKEN}`,
        },
      },
    },
    {
      label: "secret-bearing producer remediation",
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

test("obvious non-relative file inputs fail locally while relative and symlink-shaped paths reach SCI", async () => {
  const invalidValues = [
    "/srv/private/outside.ts",
    "file:///srv/private/outside.ts",
    "../outside.ts",
    "src/../../outside.ts",
    "C:\\private\\outside.ts",
    "\\\\server\\share\\outside.ts",
    "%2e%2e/outside.ts",
    "src/inside\0outside.ts",
  ];
  const blocked = createErrorHarness((name) => ({
    content: [{ type: "text", text: JSON.stringify({ workflow: name, ok: false }) }],
  }));

  for (const name of [
    "explore_symbol_impact",
    "locate_confirm_definition",
    "rename_safely",
  ] as const) {
    const tool = blocked.tools.get(name);
    assert.ok(tool);
    for (const file of invalidValues) {
      const message = await rejectedMessage(tool, { file });
      assert.equal(
        message,
        `SCI workflow ${name} rejected a path before execution (reason: repo_relative_path_required). Use a repo-relative path in a Pi session started at the target repository root. A shell cd does not rebind this Pi session's workspace; start a target-root Pi session and retry. The supplied path and current workspace were withheld.`,
      );
      assert.equal(message.includes(file), false);
      assert.equal(message.includes("/workspace/repo"), false);
    }
  }

  const structural = blocked.tools.get("structural_patch_checks");
  assert.ok(structural);
  for (const file of invalidValues) {
    const message = await rejectedMessage(structural, { paths: ["src/ok.ts", file] });
    assert.match(message, /reason: repo_relative_path_required/);
    assert.equal(message.includes(file), false);
  }
  assert.deepEqual(blocked.calls, []);

  const forwarded = createErrorHarness((name) => ({
    content: [{ type: "text", text: JSON.stringify({ workflow: name, ok: false }) }],
  }));
  const relativeCases: Array<[SciCompositeToolName, Record<string, unknown>]> = [
    ["explore_symbol_impact", { file: "./src/example.ts" }],
    ["locate_confirm_definition", { file: "src/outside-link.ts" }],
    ["rename_safely", { file: "src/example.ts" }],
    ["structural_patch_checks", { paths: ["src/example.ts", "src/outside-link.ts"] }],
  ];
  for (const [name, params] of relativeCases) {
    const tool = forwarded.tools.get(name);
    assert.ok(tool);
    await tool.execute("relative-call", params, undefined, undefined, { cwd: "/workspace/repo" });
  }
  assert.deepEqual(
    forwarded.calls,
    relativeCases.map(([name]) => name),
  );
});
