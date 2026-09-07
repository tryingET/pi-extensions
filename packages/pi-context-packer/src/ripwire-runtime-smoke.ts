/**
summary: "Prove real ripwire execution through the installed context_pack tool closure."
read_when:
  - "Changing installed code-discovery verification."
*/

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ExtensionContext, SessionManager } from "@earendil-works/pi-coding-agent";
import { runRipwirePolicySmoke } from "./ripwire-policy-smoke.ts";
import type { SmokeTool } from "./runtime-smoke.ts";

export async function runRipwireRuntimeSmoke(tool: SmokeTool, ctx?: ExtensionContext) {
  const root = await mkdtemp(join(tmpdir(), "ripwire-registered-"));
  try {
    await mkdir(join(root, "src"));
    const file = join(root, "src", "capability.ts");
    const source =
      "export function providerIsExecutable(mode: string) { return mode === 'wired'; }\n";
    await writeFile(file, source);
    const context = {
      cwd: root,
      model: ctx?.model,
      getSystemPrompt: () => "",
      getContextUsage: () => ({ usedTokens: 0, maxTokens: 100000 }),
    } as unknown as ExtensionContext;
    const args = {
      objective: "Find providerIsExecutable implementation",
      providers: { ripwire: "required", agents: "off", docs: "off", git: "off", session: "off" },
    };
    const result = await tool.execute(
      "ripwire-registered-discovery",
      args,
      undefined,
      undefined,
      context,
    );
    assert.equal(result.details?.ok, true);
    const text = result.content.find((item) => item.type === "text");
    assert.ok(text?.type === "text" && text.text.includes("src/capability.ts:1"));
    assert.ok(text?.type === "text" && text.text.includes("source SHA-256:"));
    const runs = result.details?.providerRuns as Record<string, { analyzedFiles?: number }>;
    assert.equal(runs?.ripwire?.analyzedFiles, 1);
    if (Number(process.env.PI_CONTEXT_PACKER_DOGFOOD_GATE?.slice(3)) >= 5) {
      const body = await tool.execute(
        "ripwire-registered-expand",
        {
          ...args,
          code: {
            mode: "expand",
            selection: {
              path: "src/capability.ts",
              line: 1,
              name: "providerIsExecutable",
              contentSha256: createHash("sha256").update(source).digest("hex"),
            },
          },
        },
        undefined,
        undefined,
        context,
      );
      assert.equal(body.details?.ok, true);
      assert.ok(body.content.some((x) => x.type === "text" && x.text.includes("mode === 'wired'")));
      console.log("ripwire registered expansion PASS");
    }
    if (Number(process.env.PI_CONTEXT_PACKER_DOGFOOD_GATE?.slice(3)) >= 6) {
      const cache = await mkdtemp(join(tmpdir(), "ripwire-registered-cache-"));
      const prior = process.env.PI_CONTEXT_PACKER_RIPWIRE_CACHE_ROOT;
      try {
        process.env.PI_CONTEXT_PACKER_RIPWIRE_CACHE_ROOT = cache;
        await tool.execute("cache-cold", args, undefined, undefined, context);
        const warm = await tool.execute("cache-warm", args, undefined, undefined, context);
        assert.equal(
          (warm.details?.providerRuns as Record<string, { cache?: string }>)?.ripwire?.cache,
          "hit",
        );
        console.log("ripwire registered cache PASS");
      } finally {
        if (prior === undefined) delete process.env.PI_CONTEXT_PACKER_RIPWIRE_CACHE_ROOT;
        else process.env.PI_CONTEXT_PACKER_RIPWIRE_CACHE_ROOT = prior;
        await rm(cache, { recursive: true, force: true });
      }
    }
    if (Number(process.env.PI_CONTEXT_PACKER_DOGFOOD_GATE?.slice(3)) >= 7) {
      const session = SessionManager.inMemory(root);
      const c = { ...context, sessionManager: session } as ExtensionContext;
      const served = await tool.execute("working-first", args, undefined, undefined, c);
      session.appendMessage({
        role: "toolResult",
        toolCallId: "working-first",
        toolName: "context_pack",
        content: served.content,
        details: served.details,
        isError: false,
        timestamp: Date.now(),
      });
      const repeated = await tool.execute("working-repeat", args, undefined, undefined, c);
      assert.ok(
        repeated.content.some((x) => x.type === "text" && x.text.includes("Already loaded")),
      );
      const refreshed = await tool.execute(
        "working-refresh",
        { ...args, code: { mode: "discover", refresh: true } },
        undefined,
        undefined,
        c,
      );
      assert.equal(
        (refreshed.details?.providerRuns as Record<string, { duplicates: number }>)?.ripwire
          ?.duplicates,
        0,
      );
      const fresh = await tool.execute("working-new", args, undefined, undefined, {
        ...context,
        sessionManager: SessionManager.inMemory(root),
      } as ExtensionContext);
      assert.equal(
        (fresh.details?.providerRuns as Record<string, { duplicates: number }>)?.ripwire
          ?.duplicates,
        0,
      );
      const kept = session.appendMessage({
        role: "toolResult",
        toolCallId: "working-repeat",
        toolName: "context_pack",
        content: repeated.content,
        details: repeated.details,
        isError: false,
        timestamp: Date.now(),
      });
      session.appendCompaction("Older source summarized", kept, 100);
      const afterCompaction = await tool.execute(
        "working-compacted",
        args,
        undefined,
        undefined,
        c,
      );
      assert.equal(
        (afterCompaction.details?.providerRuns as Record<string, { duplicates: number }>)?.ripwire
          ?.duplicates,
        0,
      );
      console.log("ripwire registered working set PASS");
    }
    if (Number(process.env.PI_CONTEXT_PACKER_DOGFOOD_GATE?.slice(3)) >= 9)
      await runRipwirePolicySmoke(tool, context);
    const off = await tool.execute(
      "ripwire-registered-off",
      { ...args, providers: { ...args.providers, ripwire: "off" } },
      undefined,
      undefined,
      context,
    );
    assert.equal(Object.keys(off.details?.providerRuns as object).length, 0);
    assert.equal(await readFile(file, "utf8"), source);
    console.log("ripwire registered discovery PASS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
