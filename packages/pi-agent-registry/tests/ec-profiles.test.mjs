// ---
// summary: verifies governed EC profile envelope parsing, deprecated aliases, and legacy transition reads.
// read_when:
//   - changing engineering-core profiles.json schema handling.
// ---

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  EC_PROFILE_SCHEMA,
  EcProfileError,
  knownEcProfiles,
  loadEcProfiles,
  planSkillSelection,
} from "../src/ec-profiles.ts";

async function withProfileFixture(payload, fn) {
  const root = await mkdtemp(join(tmpdir(), "ec-profile-envelope-"));
  try {
    await writeFile(join(root, "profiles.json"), JSON.stringify(payload), "utf8");
    await mkdir(join(root, "skill-a"), { recursive: true });
    await writeFile(join(root, "skill-a", "SKILL.md"), "---\nname: skill-a\n---\n", "utf8");
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("loads engineering-core.skill-profiles/1 and resolves deprecated aliases", async () => {
  await withProfileFixture(
    {
      schema: EC_PROFILE_SCHEMA,
      generated: { generator: "fixture", source_digest: "sha256:fixture" },
      profiles: { "ec-current": ["skill-a"] },
      deprecated_aliases: { "ec-old": "ec-current" },
    },
    async (root) => {
      const ec = await loadEcProfiles(join(root, "profiles.json"));
      assert.equal(ec.schema, EC_PROFILE_SCHEMA);
      assert.deepEqual(ec.profiles.get("ec-current"), ["skill-a"]);
      assert.equal(ec.deprecatedAliases.get("ec-old"), "ec-current");
      assert.deepEqual(knownEcProfiles(ec).get("ec-old"), ["skill-a"]);

      const selection = planSkillSelection({
        profile: "ec-old",
        ec,
        manifestRoot: root,
        userSkillsRoot: join(root, "user-skills"),
      });
      assert.equal(selection.profile, "ec-old");
      assert.deepEqual(selection.profileMembers, ["skill-a"]);
    },
  );
});

test("retains legacy raw-map read compatibility during migration", async () => {
  await withProfileFixture({ "ec-legacy": ["skill-a"] }, async (root) => {
    const ec = await loadEcProfiles(join(root, "profiles.json"));
    assert.equal(ec.schema, "legacy-raw-map");
    assert.deepEqual(ec.profiles.get("ec-legacy"), ["skill-a"]);
    assert.equal(ec.deprecatedAliases.size, 0);
  });
});

test("fails closed on envelope schema drift and malformed aliases", async () => {
  await withProfileFixture(
    {
      schema: "engineering-core.skill-profiles/2",
      generated: {},
      profiles: {},
      deprecated_aliases: {},
    },
    async (root) => {
      await assert.rejects(
        loadEcProfiles(join(root, "profiles.json")),
        /skill profile schema mismatch/,
      );
    },
  );

  await withProfileFixture(
    {
      schema: EC_PROFILE_SCHEMA,
      generated: {},
      profiles: { "ec-current": ["skill-a"] },
      deprecated_aliases: { "ec-old": "ec-missing" },
    },
    async (root) => {
      await assert.rejects(loadEcProfiles(join(root, "profiles.json")), (error) => {
        assert.ok(error instanceof EcProfileError);
        assert.match(error.message, /references unknown canonical profile/);
        return true;
      });
    },
  );
});

test("fails closed when governed envelope fields are missing", async () => {
  await withProfileFixture(
    { schema: EC_PROFILE_SCHEMA, generated: {}, profiles: {} },
    async (root) => {
      await assert.rejects(
        loadEcProfiles(join(root, "profiles.json")),
        /must contain a deprecated_aliases object/,
      );
    },
  );
});

test("rejects traversal-shaped profile members before source or destination resolution", async () => {
  await withProfileFixture(
    {
      schema: EC_PROFILE_SCHEMA,
      profiles: { "ec-hostile": ["../../escape"] },
      deprecated_aliases: {},
    },
    async (root) => {
      await assert.rejects(
        loadEcProfiles(join(root, "profiles.json")),
        /array of valid skill names/,
      );
    },
  );
});

test("rejects skill-source symlinks that escape their owning root", async () => {
  const root = await mkdtemp(join(tmpdir(), "ec-profile-symlink-root-"));
  const outside = await mkdtemp(join(tmpdir(), "ec-profile-symlink-outside-"));
  try {
    await mkdir(join(outside, "skill-a"), { recursive: true });
    await writeFile(join(outside, "skill-a", "SKILL.md"), "outside", "utf8");
    await symlink(join(outside, "skill-a"), join(root, "skill-a"));
    await writeFile(
      join(root, "profiles.json"),
      JSON.stringify({
        schema: EC_PROFILE_SCHEMA,
        profiles: { "ec-current": ["skill-a"] },
        deprecated_aliases: {},
      }),
      "utf8",
    );
    const ec = await loadEcProfiles(join(root, "profiles.json"));
    assert.throws(
      () =>
        planSkillSelection({
          profile: "ec-current",
          ec,
          manifestRoot: root,
          userSkillsRoot: join(root, "user-skills"),
        }),
      /resolves outside its allowed root/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
