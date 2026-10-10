import assert from "node:assert/strict";
import { chmod, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import extension from "../extensions/obsidian-clipper.ts";
import { command, loopback, parseContract, readContract, recipe } from "../src/contract.ts";
import { contract, environment, fixture } from "./helpers.ts";

const parse = (value) => parseContract(JSON.stringify(value));
test("exact alias and non-secret additive recipe; capability is not payload", () => {
  const result = recipe(parse(contract()));
  assert.equal(result.model.providerModelId, "baseline-multimodal");
  assert.equal(result.defaultModel, result.model.id);
  assert.equal(result.provider.baseUrl, "http://127.0.0.1:1234/v1/chat/completions");
  assert.equal(result.provider.apiKey, "");
  assert.equal(result.provider.apiKeyRequired, true);
  assert.equal(result.previewOnly, true);
  assert.equal(result.endpointAuthentication, "unknown");
  assert.equal(result.payload, "text-only");
  assert.equal(result.browserConfigured, "unknown");
  assert.equal(result.liveAvailability, "not-probed");
  assert.match(result.apiKeyInstruction, /Operator supplies/);
  assert.match(
    result.apiKeyInstruction,
    /rejects an empty key before any request, even if the endpoint is keyless/,
  );
  assert.match(result.apiKeyInstruction, /UNKNOWN until owner-verified/);
  assert.match(result.apiKeyInstruction, /No dummy or blank credential is asserted to work/);
  assert.match(result.steps.join(" "), /required nonempty native UI key-field value/);
  assert.match(result.steps.join(" "), /clears sync storage/);
  assert.doesNotMatch(JSON.stringify(result), /MUST-NOT-EXPORT|upstream_model/);
});
test("wrong authority/schema/scope, missing/raw/duplicate alias, malformed model fields", () => {
  for (const [field, value] of [
    ["schema_version", 2],
    ["authority", "browser"],
    ["family", "gpu"],
    ["surface", "candidate"],
  ]) {
    assert.throws(() => parse({ ...contract(), [field]: value }));
  }
  for (const field of ["context_window", "max_tokens"]) {
    for (const value of [-1, 0, 3.5, 2097153, "2000"]) {
      const c = contract();
      c.models[0][field] = value;
      assert.throws(() => parse(c));
    }
  }
  for (const id of ["baseline-text", "raw-upstream", "bad alias", ""]) {
    const c = contract();
    c.models[0].pi_model_id = id;
    assert.throws(() => parse(c));
  }
  for (const input of [["text"], ["text", "image", "video"], ["image", "image"]]) {
    const c = contract();
    c.models[0].input = input;
    assert.throws(() => parse(c));
  }
  const c = contract();
  c.models.push(c.models[0]);
  assert.throws(() => parse(c));
});
test("credential fields, model/JSON/file and nesting budgets", () => {
  for (const key of [
    "apiKey",
    "api_key",
    "authorization",
    "password",
    "credential",
    "access_token",
  ]) {
    assert.throws(() => parse({ ...contract(), extra: { [key]: "NEVER-EXPORT" } }), /Credential/);
  }
  assert.throws(() => parseContract("{"), /Invalid contract JSON/);
  assert.throws(() => parseContract("x".repeat(65537)), /byte limit/);
  assert.throws(() => parse({ ...contract(), extra: "a".repeat(4097) }), /string limit/);
  assert.throws(() => parse({ ...contract(), models: Array(33).fill(contract().models[0]) }));
  let nested = {};
  for (let i = 0; i < 13; i++) nested = { nested };
  assert.throws(() => parse({ ...contract(), nested }), /nesting/);
});
test("loopback literals only, canonical URL paths and same origin", () => {
  for (const url of [
    "http://localhost:1234/v1",
    "http://127.0.0.2:1234/v1",
    "http://2130706433:1234/v1",
    "http://127.0.0.1:1234/v1?key=secret",
    "http://secret@127.0.0.1:1234/v1",
    "http://127.0.0.1:1234/v1#x",
    "http://127.0.0.1:1234/v1/",
    "https://remote.example/v1",
  ]) {
    assert.throws(() => loopback(url, "/v1"));
  }
  assert.equal(loopback("http://[::1]:1234/v1", "/v1"), "http://[::1]:1234/v1");
  assert.throws(
    () => parse({ ...contract(), health_url: "http://127.0.0.1:7777/health" }),
    /origins/,
  );
});
test("freshness is declaration only; stale setup fails closed; future skew tolerates exactly 60s", () => {
  const c = contract();
  c.generated_at = "2020-01-01T00:00:00Z";
  const stale = parse(c);
  assert.equal(stale.freshness, "stale");
  assert.throws(() => recipe(stale), /stale/);
  c.generated_at = "2099-01-01T00:00:00Z";
  assert.throws(() => parse(c), /future/);
  const now = Date.parse("2026-10-04T00:00:00Z");
  c.generated_at = "2026-10-04T00:01:00Z";
  assert.equal(parseContract(JSON.stringify(c), now).freshness, "fresh");
  c.generated_at = "2026-10-04T00:01:01Z";
  assert.throws(() => parseContract(JSON.stringify(c), now), /future/);
  for (const age of [0, 86401, "3600", 1.1])
    assert.throws(() => parse({ ...contract(), refresh_after_seconds: age }));
});
test("bounded trusted file reader denies symlink, writable/large/nonregular/relative files", async () => {
  const f = await fixture();
  try {
    const path = join(f.dir, "contract.json");
    await writeFile(path, JSON.stringify(contract()), { mode: 0o600 });
    await environment({ PI_OBSIDIAN_CLIPPER_CONTRACT: path }, async () => {
      assert.equal((await readContract()).alias, "baseline-multimodal");
      assert.equal((await command("status")).nativeArtifact, "not-checked");
      await chmod(path, 0o666);
      await assert.rejects(readContract());
      await chmod(path, 0o600);
      await writeFile(path, "x".repeat(65537));
      await assert.rejects(readContract());
    });
    const link = join(f.dir, "link");
    await symlink(path, link);
    for (const value of [link, f.dir, "relative.json", join(f.dir, "missing")]) {
      await environment({ PI_OBSIDIAN_CLIPPER_CONTRACT: value }, () =>
        assert.rejects(readContract()),
      );
    }
  } finally {
    await f.dispose();
  }
});
test("extension load registers only; command has deterministic headless JSON and errors", async () => {
  const commands = new Map();
  const tools = new Map();
  const messages = [];
  extension({
    registerCommand: (name, value) => commands.set(name, value),
    registerTool: (tool) => tools.set(tool.name, tool),
    sendMessage: (message, options) => messages.push({ message, options }),
  });
  assert.deepEqual([...commands.keys()], ["obsidian-clipper"]);
  assert.deepEqual([...tools.keys()], ["obsidian_clipper_setup", "obsidian_clipper_extract"]);
  assert.ok(!tools.has("obsidian_clipper_save")); // no confirmation/path/write/overwrite surface exists
  for (const mode of ["json", "rpc", "tui"]) {
    await commands.get("obsidian-clipper").handler("help", { mode, hasUI: mode !== "json" });
    const sent = messages.pop();
    const value = JSON.parse(sent.message.content);
    assert.equal(value.save, "unsupported");
    assert.equal(sent.options.triggerTurn, false);
  }
  // Real print-mode stdout packets are checked through the pinned CLI in artifact.test.ts.
  await commands.get("obsidian-clipper").handler("unexpected", { mode: "json" });
  assert.match(JSON.parse(messages.pop().message.content).error, /Use status/);
  await assert.rejects(command("setup --probe"));
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(tools.get("obsidian_clipper_setup").execute("id", {}, cancelled.signal));
});
