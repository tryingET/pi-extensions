/** Real-binary regressions, with expansion selections read only from model-visible text. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextPacketToolResult } from "../src/context-pack.js";
import { fixtureDigest } from "./dogfood-fixtures.mjs";

const providers = { agents: "off", docs: "off", git: "off", session: "off", ripwire: "required" };
const textOf = (result) =>
  result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
function selectionFromText(text) {
  const path = /^- path: (.+)$/mu.exec(text)?.[1];
  const name = /^- symbol: (.+)$/mu.exec(text)?.[1];
  const contentSha256 = /^- source SHA-256: ([a-f0-9]{64})$/mu.exec(text)?.[1];
  assert.ok(path && name && contentSha256, "Discovery must expose exact selection metadata");
  const location = text.split("\n").find((line) => line.startsWith(`${path}:`));
  const line = Number(location?.slice(path.length + 1));
  assert.ok(Number.isSafeInteger(line) && line > 0, "Discovery must expose the source line");
  return { path, name, line, contentSha256 };
}

/** @param {(input: Record<string, unknown>, env: {cwd: string}) => Promise<unknown>} call */
export async function mustfixScenario(call = contextPacketToolResult) {
  const root = await mkdtemp(join(tmpdir(), "ripwire-mustfix-live-"));
  const env = { cwd: root };
  const input = {
    objective: "Inspect the selected symbol",
    seeds: [{ kind: "symbol", value: "moduleFormatProbeMjs" }],
    providers,
  };
  try {
    await mkdir(join(root, "src"));
    const file = join(root, "src", "modern.mjs");
    await writeFile(
      file,
      `${"\n".repeat(200)}export function moduleFormatProbeMjs() { return 'MODULE_BODY_VERIFIED'; }\n`,
    );
    for (const ext of ["cjs", "mts", "cts"])
      await writeFile(
        join(root, "src", `modern.${ext}`),
        `function companion${ext}() { return 1; }\n`,
      );
    const before = await fixtureDigest(root);
    const discovery = await call(input, env);
    assert.equal(discovery.details.ok, true);
    assert.equal(discovery.details.providerRuns.ripwire.analyzedFiles, 4);
    const selection = selectionFromText(textOf(discovery));
    assert.equal(selection.name, "moduleFormatProbeMjs");
    assert.equal(selection.path, "src/modern.mjs");
    assert.equal(selection.line, 201);
    const expanded = await call({ ...input, code: { mode: "expand", selection } }, env);
    assert.equal(expanded.details.ok, true);
    assert.match(textOf(expanded), /MODULE_BODY_VERIFIED/);
    assert.equal(await fixtureDigest(root), before);

    // The fixture edit is intentional; each acquisition itself must preserve the new source.
    await writeFile(file, `${await readFile(file, "utf8")}\n// newer working tree\n`);
    const changed = await fixtureDigest(root);
    const stale = await call({ ...input, code: { mode: "expand", selection } }, env);
    assert.equal(stale.isError, true);
    assert.match(textOf(stale), /stale_selection/);
    const rediscovered = await call(input, env);
    assert.equal(rediscovered.details.ok, true);
    const updated = selectionFromText(textOf(rediscovered));
    assert.notEqual(updated.contentSha256, selection.contentSha256);
    const fresh = await call(
      { ...input, code: { mode: "expand", selection: updated, refresh: true } },
      env,
    );
    assert.equal(fresh.details.ok, true);
    assert.match(textOf(fresh), /MODULE_BODY_VERIFIED/);
    assert.equal(await fixtureDigest(root), changed);

    let executions = 0;
    const guardedEnv = {
      ...env,
      countTokens: (text) => Math.ceil(Buffer.byteLength(text) / 4),
      ripwire: { onExecution: () => executions++ },
    };
    for (const budget of [{ maxTokens: 0, maxBytes: 4096, reserveTokens: 0 }, { maxBytes: -1 }]) {
      const zero = await contextPacketToolResult({ ...input, budget }, guardedEnv);
      assert.equal(zero.isError, true);
      assert.equal(executions, 0);
    }
    const temporary = join(root, ".temporary");
    await mkdir(temporary);
    const prior = process.env.TMPDIR;
    try {
      process.env.TMPDIR = temporary;
      const refused = await call(input, env);
      assert.equal(refused.isError, true);
      assert.match(textOf(refused), /unsafe_temporary_directory/);
      assert.deepEqual(await readdir(temporary), []);
    } finally {
      if (prior === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = prior;
    }
    return {
      scenario: "mustfix-code-context",
      realBinary: true,
      moduleVariants: 4,
      seedHintUsed: true,
      modelVisibleSelectionRoundTrip: true,
      staleRediscovery: true,
      zeroHeadroomExecutions: executions,
      sourceLocalTempRefused: true,
      modelTaskBenchmark: false,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
