/**
summary: "Verify landing regressions through installed registered Pi code-context calls."
read_when:
  - "Changing workspace trust or zero-budget refusal during landing."
*/
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { mustfixScenario } from "../scripts/dogfood-mustfix.mjs";
import type { SmokeTool } from "./runtime-smoke.ts";

export async function runRipwireLandingSmoke(tool: SmokeTool, context: ExtensionContext) {
  const outside = await mkdtemp(join(tmpdir(), "landing-outside-"));
  const alias = join(context.cwd, "outside-alias");
  const source = "export function privateLandingCanary() { return 123; }\n";
  const providers = { agents: "off", docs: "off", git: "off", session: "off", ripwire: "required" };
  try {
    await writeFile(join(outside, "private.ts"), source);
    await symlink(outside, alias, "dir");
    const blocked = await tool.execute(
      "landing-root-alias",
      { objective: "Find privateLandingCanary", providers, cwd: alias, repoRoot: alias },
      undefined,
      undefined,
      context,
    );
    assert.equal(blocked.details?.ok, false);
    const text = blocked.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    assert.match(text, /invalid_workspace/);
    assert.doesNotMatch(text, /private\.ts/);
    const zero = await tool.execute(
      "landing-zero-budget",
      { objective: "Find implementation", providers, budget: { maxBytes: 0 } },
      undefined,
      undefined,
      context,
    );
    assert.equal(zero.details?.ok, false);
    assert.ok(zero.content.every((item) => item.type !== "text" || item.text.length === 0));
    assert.equal(await readFile(join(outside, "private.ts"), "utf8"), source);
    await mustfixScenario((args, env) =>
      tool.execute("mustfix-registered-workflow", args, undefined, undefined, {
        ...context,
        cwd: env.cwd,
        getSystemPrompt: () => "",
        getContextUsage: () => ({ tokens: 0, contextWindow: 100000 }),
      } as ExtensionContext),
    );
    console.log("ripwire registered mustfix workflow PASS");
    console.log("ripwire registered landing regressions PASS");
  } finally {
    await rm(alias, { force: true });
    await rm(outside, { recursive: true, force: true });
  }
}
