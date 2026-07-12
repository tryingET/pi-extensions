// ---
// summary: verifies governed skill-profile resolution, safe materialization, registry boundaries, bootstrap ordering, and no-skills behavior.
// read_when:
//   - changing child skill discovery, profile allowlists, or dispatch skill isolation.
// ---

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createSkillRegistryFixture,
  executeToolExpectFailure,
  setup,
  withTemporaryEnv,
} from "./dispatch-subagent-harness.mjs";

test("dispatch_subagent resolves skillProfile through the skill registry and returns metadata", async () => {
  const fixture = await createSkillRegistryFixture();
  let materializedSnapshot;
  let materializedRoot;
  const updates = [];
  const harness = await setup(async (def) => {
    materializedRoot = def.skillSources[0];
    materializedSnapshot = {
      librarian: await readFile(join(materializedRoot, "skill-librarian", "SKILL.md"), "utf8"),
      ak: await readFile(join(materializedRoot, "ak-exact-task-execution", "SKILL.md"), "utf8"),
      sourceOwner: await readFile(
        join(materializedRoot, "source-owner-boundary-router", "SKILL.md"),
        "utf8",
      ),
    };
    return {
      output: "ok",
      exitCode: 0,
      elapsed: 250,
      status: "done",
    };
  });

  try {
    await withTemporaryEnv({ ASC_SKILL_REGISTRY_PATH: fixture.registryPath }, async () => {
      const result = await harness.tool.execute(
        "tc-skill-profile-ak",
        {
          profile: "reviewer",
          objective: "Review AK task posture",
          skillProfile: "ak",
        },
        null,
        (update) => updates.push(update),
        { cwd: process.cwd() },
      );

      const def = harness.getCapturedDef();
      assert.equal(result.details.status, "done");
      assert.equal(def.noSkills, true);
      assert.equal(def.skillSources.length, 1);
      assert.equal(result.details.skillProfile, "ak");
      assert.deepEqual(result.details.loadedSkills, ["skill-librarian", "ak-exact-task-execution"]);
      assert.deepEqual(result.details.librarySkills, ["source-owner-boundary-router"]);
      assert.deepEqual(result.details.skillWarnings, []);
      assert.equal(result.details.skillRegistry, fixture.registryPath);
      assert.equal(updates[0].details.skillProfile, "ak");
      assert.deepEqual(updates[0].details.loadedSkills, [
        "skill-librarian",
        "ak-exact-task-execution",
      ]);
      assert.doesNotMatch(materializedSnapshot.librarian, /disable-model-invocation:\s*true/);
      assert.doesNotMatch(materializedSnapshot.ak, /disable-model-invocation:\s*true/);
      assert.match(materializedSnapshot.sourceOwner, /disable-model-invocation:\s*true/);
    });

    assert.equal(existsSync(materializedRoot), false);
  } finally {
    await harness.cleanup();
    await fixture.cleanup();
  }
});
test("dispatch_subagent rejects unknown skillProfile before spawn without leaking activeCount", async () => {
  const fixture = await createSkillRegistryFixture();
  const harness = await setup();

  try {
    await withTemporaryEnv({ ASC_SKILL_REGISTRY_PATH: fixture.registryPath }, async () => {
      const result = await executeToolExpectFailure(
        harness.tool,
        "tc-skill-profile-unknown",
        {
          profile: "reviewer",
          objective: "Review skill profile",
          skillProfile: "not-a-profile",
        },
        null,
        null,
        { cwd: process.cwd() },
      );

      assert.equal(result.details.status, "error");
      assert.equal(result.details.reason, "skill_profile_failed");
      assert.equal(result.details.failureKind, "skill_profile_failed");
      assert.equal(harness.state.activeCount, 0);
      assert.equal(harness.getCapturedDef(), undefined);
      assert.match(result.content[0].text, /Unknown skillProfile: not-a-profile/);
    });
  } finally {
    await harness.cleanup();
    await fixture.cleanup();
  }
});
test("dispatch_subagent rejects registry skill paths outside the library root", async () => {
  const root = await mkdtemp(join(tmpdir(), "subagent-skill-registry-escape-"));
  const libraryRoot = join(root, "skills");
  const outsideRoot = join(root, "outside");
  const harness = await setup();

  try {
    await mkdir(libraryRoot, { recursive: true });
    await mkdir(outsideRoot, { recursive: true });
    const outsideSkill = join(outsideRoot, "SKILL.md");
    await writeFile(
      outsideSkill,
      ["---", "name: skill-librarian", "description: Outside", "---", "", "# Outside", ""].join(
        "\n",
      ),
    );
    const registryPath = join(root, "skills-registry.json");
    await writeFile(
      registryPath,
      `${JSON.stringify(
        {
          schema_version: "ai-society-skill-registry-v1-test",
          library_root: libraryRoot,
          skills: [{ name: "skill-librarian", path: outsideSkill, profile_fit: ["minimal"] }],
        },
        null,
        2,
      )}\n`,
    );

    await withTemporaryEnv({ ASC_SKILL_REGISTRY_PATH: registryPath }, async () => {
      const result = await executeToolExpectFailure(
        harness.tool,
        "tc-skill-path-escape",
        {
          profile: "reviewer",
          objective: "Review skill registry escape",
          skillProfile: "minimal",
        },
        null,
        null,
        { cwd: process.cwd() },
      );

      assert.equal(result.details.status, "error");
      assert.equal(result.details.failureKind, "skill_profile_failed");
      assert.equal(harness.state.activeCount, 0);
      assert.equal(harness.getCapturedDef(), undefined);
      assert.match(result.content[0].text, /outside the allowlisted skill library root/);
    });
  } finally {
    await harness.cleanup();
    await rm(root, { recursive: true, force: true });
  }
});
test("dispatch_subagent checks missing child extensions before materializing skillProfile", async () => {
  const fixture = await createSkillRegistryFixture();
  const harness = await setup();

  try {
    await withTemporaryEnv(
      {
        ASC_SKILL_REGISTRY_PATH: fixture.registryPath,
        PI_VAULT_CLIENT_EXTENSION: "/tmp/does-not-exist-vault-client.ts",
      },
      async () => {
        const result = await executeToolExpectFailure(
          harness.tool,
          "tc-missing-extension-before-skills",
          {
            profile: "reviewer",
            objective: "Review extension and skill bootstrap",
            extensions: ["vault-client"],
            skillProfile: "ak",
          },
          null,
          null,
          { cwd: process.cwd() },
        );

        assert.equal(result.details.status, "error");
        assert.equal(result.details.failureKind, "extension_bootstrap_missing");
        assert.equal(result.details.skillProfile, undefined);
        assert.equal(harness.state.activeCount, 0);
        assert.equal(harness.getCapturedDef(), undefined);
        assert.match(result.content[0].text, /vault-client/);
      },
    );
  } finally {
    await harness.cleanup();
    await fixture.cleanup();
  }
});
test("dispatch_subagent rejects raw skills before spawn", async () => {
  const harness = await setup();

  try {
    const result = await executeToolExpectFailure(
      harness.tool,
      "tc-raw-skills-rejected",
      {
        profile: "reviewer",
        objective: "Review raw skills",
        skills: ["/tmp/raw-skill-path"],
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(result.details.status, "error");
    assert.equal(result.details.reason, "skill_profile_failed");
    assert.equal(result.details.failureKind, "skill_profile_failed");
    assert.equal(harness.state.activeCount, 0);
    assert.equal(harness.getCapturedDef(), undefined);
    assert.match(result.content[0].text, /DispatchSubagentRequest\.skills is not enabled yet/);
  } finally {
    await harness.cleanup();
  }
});
test("dispatch_subagent supports noSkills without a skill profile", async () => {
  const harness = await setup();

  try {
    const result = await harness.tool.execute(
      "tc-no-skills",
      {
        profile: "reviewer",
        objective: "Review without child skills",
        noSkills: true,
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def = harness.getCapturedDef();
    assert.equal(result.details.status, "done");
    assert.equal(def.noSkills, true);
    assert.deepEqual(def.skillSources, []);
    assert.equal(result.details.skillProfile, undefined);
    assert.deepEqual(result.details.loadedSkills, []);
    assert.deepEqual(result.details.librarySkills, []);
  } finally {
    await harness.cleanup();
  }
});
