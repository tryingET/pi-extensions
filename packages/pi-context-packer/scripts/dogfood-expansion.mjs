/** Verify deep-source expansion, duplicate names, and stale-selection refusal. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContextPacket, contextPacketToolResult } from "../src/context-pack.js";
import { digest } from "../src/ripwire-corpus.js";
import { fixtureDigest } from "./dogfood-fixtures.mjs";
export async function expansionScenario() {
  const root = await mkdtemp(join(tmpdir(), "ripwire-expansion-"));
  try {
    await mkdir(join(root, "src"));
    const path = "src/deep.ts";
    await writeFile(
      join(root, path),
      `${"\n".repeat(200)}export function exactDeepTarget() { return 'deep-answer-42'; }\n`,
    );
    await writeFile(
      join(root, "src", "other.ts"),
      "export function exactDeepTarget() { return 'wrong-answer'; }\n",
    );
    const input = {
      objective: "Locate exactDeepTarget",
      providers: { ripwire: "required", agents: "off", docs: "off", git: "off", session: "off" },
    };
    const env = { cwd: root };
    const before = await fixtureDigest(root);
    const discovery = await buildContextPacket(input, env);
    const found = discovery.packet.sections
      .find((x) => x.provider === "ripwire")
      .items.find((x) => x.provenance.path === path);
    assert.ok(found);
    const selection = {
      path,
      name: "exactDeepTarget",
      line: found.provenance.line,
      contentSha256: found.provenance.contentSha256,
    };
    assert.ok(selection.line > 120);
    const request = { ...input, code: { mode: "expand", selection } };
    const expanded = await contextPacketToolResult(request, env);
    assert.equal(expanded.details.ok, true);
    assert.match(expanded.content[0].text, /deep-answer-42/);
    assert.doesNotMatch(expanded.content[0].text, /wrong-answer/);
    assert.equal(await fixtureDigest(root), before);
    const wrongLine = await contextPacketToolResult(
      { ...request, code: { mode: "expand", selection: { ...selection, line: 202 } } },
      env,
    );
    assert.equal(wrongLine.isError, true);
    await writeFile(join(root, path), `${await readFile(join(root, path), "utf8")}\n// changed\n`);
    const stale = await contextPacketToolResult(request, env);
    assert.equal(stale.isError, true);
    assert.match(stale.content[0].text, /stale_selection/);
    const largeSource = `export function largeBody() { return "${"z".repeat(20000)}"; }\n`;
    await writeFile(join(root, "src/large.ts"), largeSource);
    const large = await contextPacketToolResult(
      {
        ...input,
        code: {
          mode: "expand",
          selection: {
            path: "src/large.ts",
            name: "largeBody",
            line: 1,
            contentSha256: digest(largeSource),
          },
        },
      },
      env,
    );
    assert.equal(large.details.ok, true);
    assert.match(large.content[0].text, /body_truncated/);
    return {
      largeBodyTruncationDisclosed: true,
      gate: "RW-05",
      realBinary: true,
      deepDefinitionLine: selection.line,
      duplicateNameDisambiguated: true,
      wrongLineRefused: true,
      staleSelectionRefused: true,
      acquisitionUnchanged: true,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
