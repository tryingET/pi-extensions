import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextPacketToolResult } from "../src/context-pack.js";

export async function budgetScenario() {
  const root = await mkdtemp(join(tmpdir(), "rw-budget-"));
  try {
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs", "unicode.md"), `# 文档\n${"語🙂 budgets\n".repeat(250)}`);
    const base = {
      cwd: root,
      repoRoot: root,
      objective: "Read design",
      seeds: [{ kind: "path", value: "docs/unicode.md" }],
      providers: { agents: "off", git: "off", session: "off", docs: "required" },
    };
    for (const maxBytes of [1, 30, 150, 1800, 4000, 20000]) {
      const out = await contextPacketToolResult({
        ...base,
        budget: { maxBytes, maxTokens: 20000, reserveTokens: 1 },
      });
      assert.ok(Buffer.byteLength(out.content[0].text) <= maxBytes);
      assert.equal(out.details.outputBudget.bytes, Buffer.byteLength(out.content[0].text));
      if (!out.details.ok) assert.equal(out.isError, true);
    }
    const empty = await contextPacketToolResult(base, { remainingInputTokens: 0 });
    assert.equal(empty.content[0].text, "");
    assert.equal(empty.isError, true);
    const counter = (text) => Buffer.byteLength(text);
    const counted = await contextPacketToolResult(base, {
      countTokens: counter,
      remainingInputTokens: 13000,
    });
    assert.equal(counted.details.outputBudget.method, "host_tokenizer");
    assert.ok(counter(counted.content[0].text) <= 1000);
    const invalid = await contextPacketToolResult(base, { countTokens: () => NaN });
    assert.equal(invalid.details.outputBudget.reason, "token_accounting_failed");
    assert.equal(invalid.content[0].text, "");
    const normal = await contextPacketToolResult(base);
    assert.doesNotMatch(normal.content[0].text, /context_pack_dogfood_observation_v1/);
    assert.match(normal.content[0].text, /Non-authorizations/);
    return {
      gate: "RW-02",
      budgetCases: 6,
      hostHeadroomChecked: true,
      tokenizerNegativeControl: true,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
