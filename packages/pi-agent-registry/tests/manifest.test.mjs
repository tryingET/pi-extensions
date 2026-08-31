// ---
// summary: verifies fail-closed agent.json manifest validation across schema, name, path-containment, skills, tools, defaults, and scope rules.
// read_when:
//   - changing manifest schema validation or path containment policy.
// ---

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AGENT_MANIFEST_SCHEMA,
  assertAgentExtensionsExist,
  expandAgentActivities,
  loadAgentManifest,
  readAgentSystemPrompt,
  resolveAgentExtensions,
  validateAgentManifest,
} from "../src/manifest.ts";

const STEWARD_FIXTURE = new URL("./fixtures/agent-fixture-steward/", import.meta.url).pathname;

function baseValid() {
  return {
    schema: AGENT_MANIFEST_SCHEMA,
    name: "agent-test-fixture",
    system_prompt_file: "prompt.md",
    tools: ["read"],
  };
}

async function withManifestDir(files, fn) {
  const dir = await mkdtemp(join(tmpdir(), "agent-manifest-test-"));
  try {
    for (const [name, contents] of Object.entries(files)) {
      await mkdir(join(dir, name, ".."), { recursive: true });
      await writeFile(join(dir, name), contents, "utf8");
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("valid manifest loads with normalized defaults", async () => {
  const manifest = await loadAgentManifest(STEWARD_FIXTURE);
  assert.equal(manifest.schema, AGENT_MANIFEST_SCHEMA);
  assert.equal(manifest.name, "agent-fixture-steward");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.display_name, "Fixture Steward");
  assert.equal(manifest.role, "Fixture Steward");
  assert.equal(manifest.creation_task, "AK-5098");
  assert.equal(manifest.system_prompt_file, "docs/person/system-prompt.md");
  assert.deepEqual(manifest.skills, { profile: "ec-defaults", extra: ["local-helper-skill"] });
  assert.deepEqual(manifest.tools, ["read", "bash", "edit"]);
  assert.deepEqual(manifest.defaults, { model: null, thinking: "high" });
  assert.deepEqual(manifest.scope, {
    repos: ["/tmp/fixture-owned/*"],
    forbidden: [".git", "node_modules"],
  });
  assert.deepEqual(manifest.activities, ["prompts/activities/weekly-review.md"]);
  assert.equal(manifest.root, STEWARD_FIXTURE.replace(/\/$/u, ""));
});

test("agent.json symlinks fail closed before manifest bytes are read", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-manifest-symlink-file-"));
  const outside = await mkdtemp(join(tmpdir(), "agent-manifest-symlink-target-"));
  try {
    await writeFile(join(outside, "agent.json"), JSON.stringify(baseValid()), "utf8");
    await symlink(join(outside, "agent.json"), join(root, "agent.json"));
    await assert.rejects(loadAgentManifest(root), /non-symlink regular file/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("manifest and prompt bytes reject malformed UTF-8, BOM, and unpaired surrogates", async () => {
  const validBytes = Buffer.from(JSON.stringify(baseValid()), "utf8");
  await withManifestDir(
    {
      "agent.json": Buffer.concat([
        validBytes.subarray(0, -1),
        Buffer.from([0xff]),
        Buffer.from("}"),
      ]),
    },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /not strict UTF-8/);
    },
  );
  await withManifestDir(
    { "agent.json": Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), validBytes]) },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /not valid JSON/);
    },
  );
  await withManifestDir(
    {
      "agent.json": `{"schema":"${AGENT_MANIFEST_SCHEMA}","name":"agent-test-fixture","system_prompt_file":"prompt.md","tools":[],"role":"\\ud800"}`,
    },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /unpaired Unicode surrogate/);
    },
  );
  await withManifestDir(
    { "agent.json": JSON.stringify(baseValid()), "prompt.md": Buffer.from([0xff]) },
    async (dir) => {
      const manifest = await loadAgentManifest(dir);
      await assert.rejects(readAgentSystemPrompt(manifest), /not strict UTF-8/);
    },
  );
});

test("schema mismatch fails closed", async () => {
  await withManifestDir(
    { "agent.json": JSON.stringify({ ...baseValid(), schema: "other/2" }) },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /schema must be/);
    },
  );
});

test("schema-1 additive top-level fields are ignored by runtime normalization", async () => {
  await withManifestDir(
    { "agent.json": JSON.stringify({ ...baseValid(), additive_future_field: true }) },
    async (dir) => {
      const manifest = await loadAgentManifest(dir);
      assert.equal("additive_future_field" in manifest, false);
    },
  );
});

test("ratified v2 template fields and null profile validate without breaking legacy manifests", () => {
  const manifest = validateAgentManifest(
    {
      ...baseValid(),
      version: "0.1.0",
      role: "Quality Reviewer",
      creation_task: "AK-5105",
      system_prompt_file: "docs/person/system-prompt.md",
      skills: { profile: null, extra: [] },
      extensions: [],
      defaults: { model: null, thinking: "medium" },
      scope: { repos: [], forbidden: [], note: "" },
      activities: ["prompts/activities/*.md"],
      tools: [],
    },
    "/tmp/agent-root",
    "/tmp/agent-root/agent.json",
  );
  assert.equal(manifest.role, "Quality Reviewer");
  assert.equal(manifest.creation_task, "AK-5105");
  assert.deepEqual(manifest.skills, { extra: [] });
  assert.deepEqual(manifest.scope, { repos: [], forbidden: [] });

  assert.throws(
    () =>
      validateAgentManifest(
        { ...baseValid(), role: "bad\u0000role", creation_task: "AK-0" },
        "/tmp/agent-root",
        "/tmp/agent-root/agent.json",
      ),
    /role must be|creation_task must match/,
  );
});

test("reserved and malformed names fail closed", async () => {
  await withManifestDir(
    { "agent.json": JSON.stringify({ ...baseValid(), name: "custom" }) },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /reserved by ASC subagent profiles/);
    },
  );
  await withManifestDir(
    { "agent.json": JSON.stringify({ ...baseValid(), name: "Bad_Name" }) },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /name must match/);
    },
  );
});

test("system_prompt_file containment and existence fail closed", async () => {
  await withManifestDir(
    { "agent.json": JSON.stringify({ ...baseValid(), system_prompt_file: "/etc/passwd" }) },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /system_prompt_file must be a relative path/);
    },
  );
  await withManifestDir(
    { "agent.json": JSON.stringify({ ...baseValid(), system_prompt_file: "../escape.md" }) },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /system_prompt_file must be a relative path/);
    },
  );
  await withManifestDir(
    { "agent.json": JSON.stringify(baseValid()), "prompt.md": "body" },
    async (dir) => {
      await rm(join(dir, "prompt.md"));
      const manifest = await loadAgentManifest(dir);
      await assert.rejects(readAgentSystemPrompt(manifest), /does not exist or cannot be resolved/);
    },
  );
});

test("unknown engineering-core profile fails closed at load when profiles are supplied", async () => {
  const ecProfiles = new Map([["ec-defaults", ["ec-discipline-testing"]]]);
  await withManifestDir(
    {
      "agent.json": JSON.stringify({
        ...baseValid(),
        skills: { profile: "ec-not-a-profile" },
      }),
      "prompt.md": "body",
    },
    async (dir) => {
      await assert.rejects(
        loadAgentManifest(dir, { ecProfiles }),
        /skills\.profile "ec-not-a-profile" is not a known engineering-core profile/,
      );
    },
  );
});

test("malformed skills extras fail closed", async () => {
  await withManifestDir(
    {
      "agent.json": JSON.stringify({
        ...baseValid(),
        skills: { extra: ["good-skill", "good-skill"] },
      }),
      "prompt.md": "body",
    },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /skills\.extra contains duplicate entries/);
    },
  );
  await withManifestDir(
    {
      "agent.json": JSON.stringify({ ...baseValid(), skills: { extra: [42] } }),
      "prompt.md": "body",
    },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /skills\.extra\[0\] must be a skill name/);
    },
  );
});

test("tools shape failures fail closed", async () => {
  await withManifestDir(
    { "agent.json": JSON.stringify({ ...baseValid(), tools: "read" }) },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /tools must be an array/);
    },
  );
  await withManifestDir(
    { "agent.json": JSON.stringify({ ...baseValid(), tools: ["read", "READ"] }) },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /tools\[1\]/);
    },
  );
});

test("known nested fields remain strict while schema-1 nested additions are ignored", async () => {
  await withManifestDir(
    {
      "agent.json": JSON.stringify({ ...baseValid(), defaults: { thinking: "ultra" } }),
      "prompt.md": "body",
    },
    async (dir) => {
      await assert.rejects(loadAgentManifest(dir), /defaults\.thinking must be one of/);
    },
  );
  await withManifestDir(
    {
      "agent.json": JSON.stringify({
        ...baseValid(),
        defaults: { temperature: 0 },
        scope: { territory: [] },
        skills: { future_selector: "value" },
      }),
      "prompt.md": "body",
    },
    async (dir) => {
      const manifest = await loadAgentManifest(dir);
      assert.deepEqual(manifest.defaults, { model: null, thinking: "medium" });
      assert.equal(manifest.scope, undefined);
      assert.equal(manifest.skills, undefined);
    },
  );
});

test("missing activity files fail closed at resolution time", async () => {
  await withManifestDir(
    {
      "agent.json": JSON.stringify({ ...baseValid(), activities: ["gone.md"] }),
      "prompt.md": "body",
    },
    async (dir) => {
      const manifest = await loadAgentManifest(dir);
      await assert.rejects(expandAgentActivities(manifest), /does not exist or cannot be resolved/);
    },
  );
});

test("activity globs expand to matched files and fail closed when empty", async () => {
  await withManifestDir(
    {
      "agent.json": JSON.stringify({ ...baseValid(), activities: ["acts/*.md"] }),
      "prompt.md": "body",
      "acts/one.md": "one",
      "acts/two.md": "two",
      "acts/skip.txt": "skip",
    },
    async (dir) => {
      const manifest = await loadAgentManifest(dir);
      const expanded = await expandAgentActivities(manifest);
      assert.deepEqual(expanded, ["acts/one.md", "acts/two.md"]);
    },
  );
  await withManifestDir(
    {
      "agent.json": JSON.stringify({ ...baseValid(), activities: ["acts/*.md"] }),
      "prompt.md": "body",
    },
    async (dir) => {
      await mkdir(join(dir, "acts"), { recursive: true });
      const manifest = await loadAgentManifest(dir);
      await assert.rejects(expandAgentActivities(manifest), /activities glob matched no files/);
    },
  );
  await withManifestDir(
    {
      "agent.json": JSON.stringify({ ...baseValid(), activities: ["activity-*.md"] }),
      "prompt.md": "body",
      "activity-one.md": "one",
      "activity-two.md": "two",
    },
    async (dir) => {
      const manifest = await loadAgentManifest(dir);
      assert.deepEqual(await expandAgentActivities(manifest), [
        "activity-one.md",
        "activity-two.md",
      ]);
    },
  );

  assert.throws(
    () =>
      validateAgentManifest(
        { ...baseValid(), activities: ["acts-*/one.md"] },
        "/tmp/agent-root",
        "/tmp/agent-root/agent.json",
      ),
    /glob metacharacters only in the file name/,
  );
});

test("validateAgentManifest accepts empty tools (read-only agent) and rejects escapes", () => {
  const manifest = validateAgentManifest(
    { ...baseValid(), tools: [] },
    "/tmp/agent-root",
    "/tmp/agent-root/agent.json",
  );
  assert.deepEqual(manifest.tools, []);

  assert.throws(
    () =>
      validateAgentManifest(
        { ...baseValid(), activities: ["../outside.md"] },
        "/tmp/agent-root",
        "/tmp/agent-root/agent.json",
      ),
    /activities\[0\] must be a relative path inside the agent repo/,
  );
});

test("resolveAgentExtensions resolves relative entries against the manifest root", () => {
  const manifest = validateAgentManifest(
    { ...baseValid(), extensions: ["vault-client", "./exts/local.ts"] },
    "/tmp/agent-root",
    "/tmp/agent-root/agent.json",
  );
  assert.deepEqual(resolveAgentExtensions(manifest), [
    "vault-client",
    "/tmp/agent-root/exts/local.ts",
  ]);
});

test("filesystem-backed manifest resources reject symlink escapes", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-manifest-symlink-root-"));
  const outside = await mkdtemp(join(tmpdir(), "agent-manifest-symlink-outside-"));
  try {
    await writeFile(join(outside, "outside.md"), "outside secret", "utf8");
    await symlink(join(outside, "outside.md"), join(root, "prompt.md"));
    await writeFile(join(root, "agent.json"), JSON.stringify(baseValid()), "utf8");
    const manifest = await loadAgentManifest(root);
    await assert.rejects(readAgentSystemPrompt(manifest), /resolves outside the agent repo root/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("extension paths reject traversal, missing files, and symlink escapes", async () => {
  assert.throws(
    () =>
      validateAgentManifest(
        { ...baseValid(), extensions: ["../outside.ts"] },
        "/tmp/agent-root",
        "/tmp/agent-root/agent.json",
      ),
    /contained \.\/ path/,
  );
  assert.throws(
    () =>
      validateAgentManifest(
        { ...baseValid(), extensions: ["nested/outside.ts"] },
        "/tmp/agent-root",
        "/tmp/agent-root/agent.json",
      ),
    /filesystem paths must start with \./,
  );

  const root = await mkdtemp(join(tmpdir(), "agent-extension-root-"));
  const outside = await mkdtemp(join(tmpdir(), "agent-extension-outside-"));
  try {
    await writeFile(join(root, "prompt.md"), "persona", "utf8");
    await writeFile(join(outside, "outside.ts"), "export default () => {};", "utf8");
    await mkdir(join(root, "extensions"), { recursive: true });
    await symlink(join(outside, "outside.ts"), join(root, "extensions", "escape.ts"));
    await writeFile(
      join(root, "agent.json"),
      JSON.stringify({ ...baseValid(), extensions: ["./extensions/escape.ts"] }),
      "utf8",
    );
    const manifest = await loadAgentManifest(root);
    await assert.rejects(
      assertAgentExtensionsExist(manifest),
      /resolves outside the agent repo root/,
    );

    const missing = validateAgentManifest(
      { ...baseValid(), extensions: ["./extensions/missing.ts"] },
      root,
      join(root, "agent.json"),
    );
    await assert.rejects(
      assertAgentExtensionsExist(missing),
      /does not exist or cannot be resolved inside the agent repo/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
