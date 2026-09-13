import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { SciMcpBridge } from "../src/mcp-bridge.ts";
import { createHarness } from "./extension-test-helpers.ts";

// Never silently use the session's SCI_MCP_COMMAND. This opt-in identifies a reviewed private build.
const command = process.env.SCI_TEST_MCP_COMMAND;
test(
  "normal-mode private MCP errors reach the real Pi tool row with recovery in both views",
  {
    skip: !command && "set SCI_TEST_MCP_COMMAND to a reviewed private MCP build",
  },
  async (t) => {
    assert.ok(command && path.isAbsolute(command));
    const workspace = await mkdtemp(path.join(tmpdir(), "sci-error-transport-"));
    const bridge = new SciMcpBridge({
      command,
      environment: { DEBUG: "", NODE_ENV: "production" },
    });
    t.after(async () => {
      await bridge.close();
      await rm(workspace, { recursive: true, force: true });
    });
    await mkdir(path.join(workspace, "src"));
    const source = "export const Target = 1;\n";
    await writeFile(path.join(workspace, "src", "target.js"), source);
    await writeFile(path.join(workspace, ".gitignore"), ".ontology/\n");
    function git(cwd: string, args: string[]) {
      const child = spawnSync("git", args, { cwd, encoding: "utf8", timeout: 10_000 });
      assert.equal(child.status, 0, `synthetic fixture git ${args[0]} must succeed`);
    }
    git(workspace, ["init", "-q"]);
    git(workspace, ["add", ".gitignore", "src/target.js"]);
    git(workspace, [
      "-c",
      "user.name=SCI Fixture",
      "-c",
      "user.email=sci@example.invalid",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-qm",
      "fixture",
    ]);
    const harness = createHarness(bridge);
    const tool = harness.tools.get("explore_symbol_impact");
    assert.ok(tool?.renderResult);
    await bridge.workspaceContext(workspace);

    const piDist = path.dirname(
      fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")),
    );
    // Same host row linked from Pi's Custom Rendering documentation, not a renderer-only mock.
    const { ToolExecutionComponent } = await import(
      pathToFileURL(path.join(piDist, "modes/interactive/components/tool-execution.js")).href
    );
    const { initTheme } = await import(
      pathToFileURL(path.join(piDist, "modes/interactive/theme/theme.js")).href
    );
    initTheme();

    const nested = path.join(workspace, "nested");
    await mkdir(nested);
    git(nested, ["init", "-q"]);
    await writeFile(path.join(nested, "target.js"), source);
    for (const [file, reason] of [
      ["src/missing.js", "workspace_path_unresolved"],
      ["nested/target.js", "workspace_ref_mismatch"],
    ]) {
      const args = { symbol: "Target", file };
      let failure: unknown;
      try {
        await tool.execute("transport-error", args, undefined, undefined, { cwd: workspace });
      } catch (error) {
        failure = error;
      }
      assert.ok(failure instanceof Error, "must remain a thrown Pi tool failure");
      assert.match(failure.message, new RegExp(`reason: ${reason}`));
      assert.doesNotMatch(failure.message, new RegExp(workspace));
      const row = new ToolExecutionComponent(
        "explore_symbol_impact",
        "transport-error",
        args,
        { showImages: false },
        tool,
        { requestRender() {} },
        workspace,
      );
      row.updateResult(
        { content: [{ type: "text", text: failure.message }], isError: true },
        false,
      );
      for (const expanded of [false, true]) {
        row.setExpanded(expanded);
        const rendered = stripVTControlCharacters(row.render(180).join("\n"));
        assert.match(rendered, new RegExp(reason));
        assert.doesNotMatch(rendered, /result unavailable|could not be rendered|raw fallback/);
      }
    }
    assert.equal(await readFile(path.join(workspace, "src", "target.js"), "utf8"), source);
    assert.equal(await readFile(path.join(nested, "target.js"), "utf8"), source);
    assert.equal(
      harness.customEntries.filter((entry) => entry.customType === "pi-sci-explore-operator-v1")
        .length,
      0,
    );
  },
);
