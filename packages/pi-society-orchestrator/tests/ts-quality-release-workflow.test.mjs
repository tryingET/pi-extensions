import assert from "node:assert/strict";
import test from "node:test";
import extension from "../extensions/society-orchestrator.ts";
import {
  formatTsQualityReleaseWorkflowResult,
  TsQualityReleaseWorkflowRunner,
} from "../src/runtime/ts-quality-release-workflow.ts";

function registerTsQualityReleaseTool(runner) {
  const tools = new Map();
  extension(
    {
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
      registerCommand() {},
      on() {},
    },
    { tsQualityReleaseWorkflowRunner: runner },
  );

  const tool = tools.get("ts_quality_release_workflow");
  assert.ok(tool, "expected ts_quality_release_workflow to register");
  return tool;
}

test("ts-quality release workflow exposes a Pi Society tool around repo-local release leaves", async () => {
  const runner = {
    async run(params) {
      assert.equal(params.action, "plan");
      assert.equal(params.version, "0.1.1");
      return {
        ok: true,
        action: "plan",
        cwd: "/tmp/ts-quality",
        version: "0.1.1",
        tag: "v0.1.1",
        applied: false,
        externalMutationApproved: false,
        steps: [
          {
            name: "plan release",
            command: ["npm", "run", "--silent", "release:plan", "--", "--version", "0.1.1"],
            status: "done",
            stdout: "{}",
          },
        ],
        nextStep: "Review the plan, then run prepare with apply=true for v0.1.1.",
      };
    },
  };
  const tool = registerTsQualityReleaseTool(runner);
  const result = await tool.execute("tc-release", { action: "plan", version: "0.1.1" });

  assert.equal(result.details.ok, true);
  assert.equal(result.details.action, "plan");
  assert.match(result.content[0].text, /ts-quality release workflow — plan — ok/);
  assert.match(result.content[0].text, /release:plan/);
});

test("ts-quality release workflow plans git mutations without applying by default", async () => {
  const runner = new TsQualityReleaseWorkflowRunner({ defaultCwd: "/tmp/ts-quality" });
  const result = await runner.run({ action: "commit_tag", version: "0.1.1" });

  assert.equal(result.ok, true);
  assert.equal(result.applied, false);
  assert.deepEqual(
    result.steps.map((step) => step.status),
    ["planned", "planned", "planned"],
  );
  assert.match(formatTsQualityReleaseWorkflowResult(result), /git tag -a v0\.1\.1/);
});

test("ts-quality release workflow requires explicit external approval only for applied public mutations", async () => {
  const runner = new TsQualityReleaseWorkflowRunner({ defaultCwd: "/tmp/ts-quality" });

  const plannedPush = await runner.run({ action: "push", version: "0.1.1" });
  assert.equal(plannedPush.ok, true);
  assert.deepEqual(
    plannedPush.steps.map((step) => step.status),
    ["planned", "planned"],
  );

  const push = await runner.run({ action: "push", version: "0.1.1", apply: true });
  assert.equal(push.ok, false);
  assert.match(push.error || "", /externalMutationApproved=true/);

  const github = await runner.run({
    action: "create_github_release",
    version: "0.1.1",
    apply: true,
  });
  assert.equal(github.ok, false);
  assert.match(github.error || "", /externalMutationApproved=true/);
});
