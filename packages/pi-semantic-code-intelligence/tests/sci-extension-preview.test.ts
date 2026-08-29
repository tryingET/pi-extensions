/**
summary: "SCI extension bridge shutdown, preview-only doors, and file URI containment; split from extension.test.ts."
read_when:
  - "You change bridge shutdown, preview-only doors, and file URI containment behavior."
*/
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { SCI_COMPOSITE_TOOL_NAMES } from "../extensions/semantic-code-intelligence.ts";
import type { SciBridge } from "../src/mcp-bridge.ts";
import { createHarness, fakeBridge } from "./extension-test-helpers.ts";

test("session shutdown closes the long-lived MCP bridge", async () => {
  const fake = fakeBridge();
  const harness = createHarness(fake.bridge);
  await harness.emit("session_shutdown");
  assert.equal(fake.closes, 1);
});

test("preview-only Pi tools reject apply before reaching SCI", async () => {
  const fake = fakeBridge();
  const harness = createHarness(fake.bridge);
  const preview = harness.tools.get("preview_patch_checks");
  assert.ok(preview);

  await assert.rejects(
    preview.execute(
      "call-apply",
      { patch: "diff --git a/a b/a", apply: true },
      new AbortController().signal,
      undefined,
      { cwd: "/workspace/repo" },
    ),
    /preview_patch_checks is preview-only in Pi/,
  );
  assert.deepEqual(fake.calls, []);
});

test("preview-only results remove raw producer apply instructions from content and details", async () => {
  const bridge: SciBridge = {
    async callTool() {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              workflow: "patch_checks_in_snapshot",
              ok: true,
              applied: false,
              snapshot: "snap-preview",
              stage: { accepted: true },
              next: "retry with apply:true and ALLOW_SNAPSHOT_APPLY=1",
              rollback: { command: "ALLOW_SNAPSHOT_APPLY=1 sci apply /workspace/repo" },
              validationPlan: {
                status: "checks_passed",
                apply: { enabled: true },
                rollback: { command: "sci apply --reverse /workspace/repo/.ontology/snapshot" },
              },
            }),
          },
        ],
      };
    },
    async advertisedToolNames() {
      return [...SCI_COMPOSITE_TOOL_NAMES];
    },
    async close() {},
  };
  const previewDoor = createHarness(bridge).tools.get("preview_patch_checks");
  assert.ok(previewDoor);
  const result = await previewDoor.execute(
    "call-preview",
    { patch: "diff --git a/a b/a" },
    new AbortController().signal,
    undefined,
    { cwd: "/workspace/repo" },
  );

  assert.doesNotMatch(
    result.content[0].text,
    /ALLOW_SNAPSHOT_APPLY|apply:true|\/workspace\/repo|"apply":/,
  );
  assert.doesNotMatch(
    JSON.stringify(result.details),
    /ALLOW_SNAPSHOT_APPLY|apply:true|\/workspace\/repo/,
  );
  assert.equal(JSON.parse(result.content[0].text).ok, true);
  assert.match(result.content[0].text, /mutation is unavailable through this native Pi surface/i);
});

test("preview-only output rejects applied state and recursive apply instructions", async () => {
  const payloads = [
    { workflow: "patch_checks_in_snapshot", ok: true, applied: true },
    {
      workflow: "patch_checks_in_snapshot",
      ok: true,
      applied: false,
      validationPlan: { status: "checks_passed" },
      nested: { instructions: "apply the snapshot now" },
    },
  ];

  for (const payload of payloads) {
    const bridge: SciBridge = {
      async callTool() {
        return { content: [{ type: "text", text: JSON.stringify(payload) }] };
      },
      async advertisedToolNames() {
        return [...SCI_COMPOSITE_TOOL_NAMES];
      },
      async close() {},
    };
    const previewDoor = createHarness(bridge).tools.get("preview_patch_checks");
    assert.ok(previewDoor);
    const result = await previewDoor.execute(
      "call-preview-invalid",
      { patch: "diff --git a/a b/a" },
      undefined,
      undefined,
      {
        cwd: "/workspace/repo",
      },
    );
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, "indeterminate");
    assert.doesNotMatch(result.content[0].text, /ALLOW_SNAPSHOT_APPLY|applied.true/);
  }
});

test("contained file URIs become relative while outside paths and diagnostics fail closed", async () => {
  const workspace = "/workspace/repo";
  const payloads: Array<{
    payload: Record<string, unknown>;
    accepted: boolean;
    expectedUri?: string;
  }> = [
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        definitions: [{ uri: pathToFileURL(path.join(workspace, "src/target.ts")).href }],
      },
      accepted: true,
      expectedUri: "src/target.ts",
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        definitions: [{ uri: pathToFileURL("/srv/private/target.ts").href }],
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        stderr: "compiler details",
      },
      accepted: true,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        nested: { cwd: workspace },
      },
      accepted: true,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        backend: "ast-grep",
      },
      accepted: true,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        note: "backend wrote /srv/private/target.ts",
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        note: "inspect file:///srv/private/target.ts",
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        note: "backend wrote [/srv/private/target.ts]",
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        nested: { "/srv/private/target.ts": "hidden key" },
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        definitions: [{ uri: "../../srv/private/target.ts" }],
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        note: "backend%20wrote%20%2Fsrv%2Fprivate%2Ftarget.ts",
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        note: "backend%252520wrote%252520%25252Fsrv%25252Fprivate%25252Ftarget.ts",
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "locate_confirm_definition",
        ok: true,
        note: "snapshot:////srv/private/target.ts",
      },
      accepted: false,
    },
    {
      payload: {
        workflow: "patch_checks_in_snapshot",
        ok: true,
        applied: false,
        validationPlan: { status: "checks_passed" },
      },
      accepted: false,
    },
  ];

  for (const { payload, accepted, expectedUri } of payloads) {
    if (payload.workflow === "locate_confirm_definition") {
      payload.symbol ??= "Target";
      payload.decision ??= "fast";
      payload.definitions ??= [{ uri: pathToFileURL(path.join(workspace, "src/default.ts")).href }];
    }
    const bridge: SciBridge = {
      async callTool() {
        return { content: [{ type: "text", text: JSON.stringify(payload) }] };
      },
      async advertisedToolNames() {
        return [...SCI_COMPOSITE_TOOL_NAMES];
      },
      async close() {},
    };
    const locate = createHarness(bridge).tools.get("locate_confirm_definition");
    assert.ok(locate);
    const result = await locate.execute("call-disclosure", {}, undefined, undefined, {
      cwd: workspace,
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ok, accepted);
    assert.doesNotMatch(result.content[0].text, /\/workspace\/repo|\/srv\/private|stderr/);
    if (accepted) {
      if (expectedUri) assert.equal(parsed.definitions[0].uri, expectedUri);
      assert.equal(result.details.producerResultSanitized, true);
    } else {
      assert.equal(parsed.status, "indeterminate");
    }
  }
});
