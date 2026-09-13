import assert from "node:assert/strict";
import test from "node:test";
import { renderExploreResult } from "../src/explore-renderer.ts";
import { sciErrorText } from "../src/sci-error-projection.ts";
import { createHarness, fakeBridge } from "./extension-test-helpers.ts";

const name = "explore_symbol_impact";
const privateText = "/srv/private/source.ts xoxb-secret-value-123456";
const reasons = [
  "workspace_ref_required",
  "workspace_ref_mismatch",
  "workspace_binding_mismatch",
  "workspace_path_invalid",
  "workspace_path_unresolved",
  "workspace_state_changed",
  "workspace_state_unavailable",
];

function envelope(reason: string) {
  const message = "The requested workspace operation could not be completed";
  return {
    isError: true,
    error: {
      code: "InvalidParams",
      message,
      data: { reason, remediation: "Check the current workspace before proceeding." },
    },
    content: [{ type: "text", text: message }],
  };
}

function render(text: string, expanded: boolean, isError = true) {
  const tool = createHarness(fakeBridge().bridge).tools.get(name);
  assert.ok(tool?.renderResult);
  return tool.renderResult(
    { content: [{ type: "text", text }] },
    { expanded, isPartial: false },
    {},
    { toolCallId: "error-render", isError },
  );
}

for (const reason of reasons) {
  test(`public ${reason} survives both error views without success metadata`, () => {
    const text = sciErrorText(name, envelope(reason));
    assert.match(text, new RegExp(`reason: ${reason}`));
    for (const expanded of [false, true]) {
      const component = render(text, expanded);
      assert.match(component.render(1000).join("\n"), new RegExp(reason));
      assert.doesNotMatch(
        component.render(1000).join("\n"),
        /result unavailable|could not be rendered/,
      );
      for (const width of [1, 8, 40, 80]) {
        const lines = component.render(width);
        assert.ok(lines.every((line) => line.length <= width));
      }
    }
  });
}

test("known generic plain-text producer failure remains visible in both views", () => {
  const text = sciErrorText(name, { isError: true, content: [] });
  for (const expanded of [false, true]) {
    const output = render(text, expanded).render(1000).join("\n");
    assert.match(output, /returned an error/);
    assert.doesNotMatch(output, /could not be rendered|result unavailable/);
  }
});

test("unsafe, prefixed or extended error text is not reflected", () => {
  const safe = sciErrorText(name, envelope("workspace_ref_mismatch"));
  for (const text of [
    privateText,
    `${safe}\n${privateText}`,
    `${privateText} ${safe}`,
    JSON.stringify(envelope("workspace_ref_mismatch")),
  ]) {
    for (const expanded of [false, true]) {
      const output = render(text, expanded).render(1000).join("\n");
      assert.match(output, /SCI explore failed/);
      assert.doesNotMatch(output, /srv\/private|xoxb-secret|workspace_ref_mismatch/);
    }
  }
});

test("host error flag dominates stale successful presentation and retained detail", () => {
  const fake = fakeBridge();
  const tool = createHarness(fake.bridge).tools.get(name);
  assert.ok(tool?.renderResult);
  const result = {
    content: [{ type: "text", text: privateText }],
    details: { explorePresentation: { requestedMode: "compact", status: "confirmed" } },
  };
  const output = tool
    .renderResult(
      result,
      { expanded: true, isPartial: false },
      {},
      {
        toolCallId: "error-render",
        isError: true,
      },
    )
    .render(1000)
    .join("\n");
  assert.match(output, /SCI explore failed/);
  assert.doesNotMatch(output, /confirmed|srv\/private|xoxb-secret/);
});

test("malformed error content cannot throw into Pi raw-text renderer fallback", () => {
  const result = Object.defineProperty({}, "content", {
    get() {
      throw new Error(privateText);
    },
  });
  let output = "";
  assert.doesNotThrow(() => {
    output = renderExploreResult(
      result as never,
      { expanded: true, isPartial: false },
      "bad",
      new Map(),
    )
      .render(1000)
      .join("\n");
  });
  assert.match(output, /withheld/);
  assert.doesNotMatch(output, /srv\/private|xoxb-secret/);
});

test("tool failures still throw rather than returning counterfeit isError result flags", async () => {
  const fake = fakeBridge();
  fake.bridge.callTool = async () => envelope("workspace_ref_mismatch");
  const harness = createHarness(fake.bridge);
  const tool = harness.tools.get(name);
  assert.ok(tool);
  await assert.rejects(
    tool.execute("error-signal", { symbol: "Target" }, undefined, undefined, {
      cwd: "/workspace/repo",
    }),
    /reason: workspace_ref_mismatch/,
  );
  assert.equal(harness.customEntries.length, 0);
});

test("local-bridge-looking injected errors remain redacted in model and operator views", async () => {
  // A malicious Error getter must not escape the bridge catch and leak its thrown text.
  const throwingMessage = Object.defineProperty(new Error(), "message", {
    get() {
      throw new Error(privateText);
    },
  });
  const getterBridge = fakeBridge();
  getterBridge.bridge.callTool = async () => {
    throw throwingMessage;
  };
  const getterTool = createHarness(getterBridge.bridge).tools.get(name);
  assert.ok(getterTool);
  await assert.rejects(
    getterTool.execute("throwing-message", { symbol: "Target" }, undefined, undefined, {
      cwd: "/workspace/repo",
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /srv\/private|xoxb-secret/);
      assert.match(error.message, /Backend diagnostics, paths, and stderr were withheld/);
      return true;
    },
  );
  for (const message of [
    `SCI NEXUS ${privateText}`,
    `SCI bridge workspace is immutable ${privateText}`,
  ]) {
    const fake = fakeBridge();
    fake.bridge.callTool = async () => {
      throw new Error(message);
    };
    const tool = createHarness(fake.bridge).tools.get(name);
    assert.ok(tool);
    await assert.rejects(
      tool.execute("injected-local", { symbol: "Target" }, undefined, undefined, {
        cwd: "/workspace/repo",
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Backend diagnostics, paths, and stderr were withheld/);
        assert.doesNotMatch(error.message, /srv\/private|xoxb-secret/);
        assert.doesNotMatch(
          render(error.message, true).render(1000).join("\n"),
          /srv\/private|xoxb-secret/,
        );
        return true;
      },
    );
  }
});
