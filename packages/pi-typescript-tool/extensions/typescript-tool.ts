// Derived from cv/pic v0.2.37 src/typescript/tool.ts (Carlos Villela, Apache-2.0),
// via spike a0411c361. Modified: trusted-only execution, bounded fs/results/errors.
// No saved functions, scopes, browser capabilities or arbitrary Pi tool dispatcher.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { createCapabilities } from "../src/capabilities.ts";
import { runSnippet, throwIfAborted } from "../src/runner.ts";
import { executionError, renderResult } from "../src/serialization.ts";
import { checkSnippet, contractSource, MAX_CODE_BYTES } from "../src/typescript-gate.ts";

export const TOOL_NAME = "typescript";
export const parameters = Type.Object({
  code: Type.String({
    maxLength: MAX_CODE_BYTES,
    description:
      "One trusted TypeScript function or expression; no imports or top-level declarations. Maximum 65536 UTF-8 bytes.",
  }),
});
export type TypeScriptToolInput = Static<typeof parameters>;

export default function typescriptTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAME,
    label: "TypeScript",
    description: [
      "Execute TRUSTED TypeScript only, in-process. Node vm is NOT a sandbox; the typecheck is not a security boundary.",
      "Submit one function (sync or async) taking capabilities, or one expression. Strict type errors prevent execution.",
      "No imports/top-level declarations. Return plain JSON data, a string, or undefined. Unsupported/oversized results fail.",
      "Output: at most 16384 UTF-8 bytes / 2000 lines, 4096 nodes / 32 levels; no raw result retained in details.",
      "fs is read-only and canonical-path checked under ctx.cwd (not race-proof confinement). 128 calls, 1 MiB requested read bytes per execution.",
      "10s initial synchronous VM timeout and cooperative async deadline; CPU loops after await can still hang Pi. No memory isolation.",
      "Contract:",
      contractSource()
        .replace(/^\/\/.*\n/gm, "")
        .trim(),
      'Example: async ({ fs }) => (await fs.list(".")).filter(e => e.kind === "file").map(e => e.name)',
    ].join("\n"),
    promptSnippet: "Execute trusted TypeScript with typed read-only fs helpers (NOT sandboxed)",
    promptGuidelines: [
      "Use typescript only for trusted code; never treat its types or vm as a security boundary.",
    ],
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      let lease: Awaited<ReturnType<typeof createCapabilities>> | undefined;
      try {
        throwIfAborted(signal);
        const gate = checkSnippet(params.code);
        if (!gate.ok)
          throw new Error(`TypeScript validation failed:\n${gate.diagnostics.join("\n")}`);
        throwIfAborted(signal);
        lease = await createCapabilities(ctx.cwd, signal);
        const value = await runSnippet(params.code, gate.kind, lease.capabilities, { signal });
        throwIfAborted(signal);
        const text = renderResult(value);
        return { content: [{ type: "text", text }], details: { kind: gate.kind } };
      } catch (error) {
        throw executionError(error);
      } finally {
        lease?.close();
      }
    },
  });
}
