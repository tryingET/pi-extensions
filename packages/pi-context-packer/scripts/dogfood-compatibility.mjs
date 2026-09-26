/** Exercise nested package discovery and lossless expansion through the visible packet. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { contextPacketToolResult } from "../src/context-pack.js";
import { fixtureDigest } from "./dogfood-fixtures.mjs";

export const visibleSelections = (result) => {
  const text = result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
  return [...text.matchAll(/\n# code\.selection\.json\n([^\n]+)\n/gu)].map((m) => JSON.parse(m[1]));
};

/** @param {(input: Record<string, unknown>, env: {cwd: string}) => Promise<any>} call */
export async function compatibilityScenario(call = contextPacketToolResult) {
  const root = await mkdtemp(join(tmpdir(), "ripwire-packages-"));
  const cppPath = "packages/group/comparator/src/<compare>.cpp";
  const tsPath = "packages/pi-typescript-tool/src/runner.ts";
  const providers = { agents: "off", docs: "off", git: "off", session: "off", ripwire: "required" };
  try {
    await mkdir(join(root, ".git"));
    await writeFile(join(root, ".git/HEAD"), "ref: refs/heads/main\n");
    for (const path of [cppPath, tsPath])
      await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(
      join(root, cppPath),
      "struct Item { int value; bool operator<(const Item& other) const { return value < other.value; } };\n",
    );
    await writeFile(
      join(root, tsPath),
      "export function compatibilityTypedRunner() { return 'TYPED_PACKAGE'; }\n",
    );
    const before = await fixtureDigest(root);
    // A package cwd must retain its actual monorepo identity and discover a sibling package.
    const env = { cwd: join(root, "packages/pi-typescript-tool") };
    const input = { objective: "Find operator< for comparing Item", providers };
    const discovered = await call(input, env);
    assert.equal(discovered.details.ok, true);
    assert.equal(discovered.details.providerRuns.ripwire.analyzedFiles, 2);
    const selection = visibleSelections(discovered).find((item) => item.name === "operator<");
    assert.ok(selection, "Use the lossless visible selector, not a sanitized label");
    assert.equal(selection.path, cppPath);
    const expanded = await call({ ...input, code: { mode: "expand", selection } }, env);
    assert.equal(expanded.details.ok, true);
    assert.match(expanded.content[0].text, /return value < other.value/);
    const typed = await call({ objective: "Find compatibilityTypedRunner", providers }, env);
    assert.equal(typed.details.ok, true);
    assert.ok(visibleSelections(typed).some((item) => item.path === tsPath));
    assert.equal(await fixtureDigest(root), before);
    return {
      gate: "current-main-compatibility",
      realBinary: true,
      nestedPackageScope: true,
      losslessVisibleExpansion: true,
      acquisitionUnchanged: true,
      modelTaskBenchmark: false,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
