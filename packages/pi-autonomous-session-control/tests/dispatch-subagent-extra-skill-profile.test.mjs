// ---
// summary: verifies the extra skill-profile resolver seam falls back safely, preserves fail-closed diagnostics, and reaches spawn definitions.
// read_when:
//   - changing consumer-supplied skill-profile resolution or the ASC runtime resolver passthrough.
// ---

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAscExecutionRuntime, createSubagentState } from "../extensions/self/subagent.ts";
import {
  resolveSubagentSkillSelection,
  SubagentSkillSelectionError,
} from "../extensions/self/subagent-skill-selection.ts";
import { createSkillRegistryFixture } from "./dispatch-subagent-harness.mjs";

async function withTemporaryEnv(overrides, fn) {
  const previous = Object.fromEntries(
    Object.entries(overrides).map(([key]) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function materializeFixtureSkillDir() {
  const dir = await mkdtemp(join(tmpdir(), "asc-extra-skill-materialized-"));
  await mkdir(join(dir, "fixture-skill"), { recursive: true });
  await writeFile(
    join(dir, "fixture-skill", "SKILL.md"),
    "---\nname: fixture-skill\ndescription: fixture\n---\n\nfixture body\n",
    "utf8",
  );
  return dir;
}

test("resolveSubagentSkillSelection accepts an extra resolver selection when the built-in registry misses", async () => {
  const skillDir = await materializeFixtureSkillDir();
  try {
    const cwd = await mkdtemp(join(tmpdir(), "asc-extra-skill-cwd-"));
    try {
      const selection = await withTemporaryEnv({ ASC_SKILL_REGISTRY_PATH: undefined }, () =>
        resolveSubagentSkillSelection({
          requestedSkillProfile: "agent-fixture",
          ctx: { cwd },
          extraProfileResolver: async (profile) => {
            if (profile !== "agent-fixture") return undefined;
            return {
              noSkills: true,
              skillSources: [skillDir],
              skillProfile: profile,
              loadedSkills: ["fixture-skill"],
              librarySkills: [],
              skillWarnings: [],
            };
          },
        }),
      );

      assert.equal(selection.noSkills, true);
      assert.deepEqual(selection.skillSources, [skillDir]);
      assert.equal(selection.skillProfile, "agent-fixture");
      assert.deepEqual(selection.loadedSkills, ["fixture-skill"]);
      const text = await readFile(join(skillDir, "fixture-skill", "SKILL.md"), "utf8");
      assert.match(text, /fixture body/);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  } finally {
    await rm(skillDir, { recursive: true, force: true });
  }
});

test("resolveSubagentSkillSelection keeps original fail-closed diagnostics when the extra resolver declines", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "asc-extra-skill-cwd-"));
  try {
    await withTemporaryEnv({ ASC_SKILL_REGISTRY_PATH: undefined }, async () => {
      await assert.rejects(
        resolveSubagentSkillSelection({
          requestedSkillProfile: "agent-fixture",
          ctx: { cwd },
          extraProfileResolver: async () => undefined,
        }),
        (error) => {
          assert.ok(error instanceof SubagentSkillSelectionError);
          assert.match(error.message, /no ai-society skill registry was found/);
          return true;
        },
      );
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("resolveSubagentSkillSelection still prefers the built-in registry over the extra resolver", async () => {
  const fixture = await createSkillRegistryFixture();
  try {
    await withTemporaryEnv({ ASC_SKILL_REGISTRY_PATH: fixture.registryPath }, async () => {
      const selection = await resolveSubagentSkillSelection({
        requestedSkillProfile: "ak",
        ctx: { cwd: process.cwd() },
        extraProfileResolver: async () => {
          throw new Error("extra resolver must not be consulted for builtin profiles");
        },
      });

      assert.equal(selection.skillProfile, "ak");
      assert.ok(selection.loadedSkills.includes("ak-exact-task-execution"));
      await selection.cleanup?.();
    });
  } finally {
    await fixture.cleanup();
  }
});

test("createAscExecutionRuntime passes the extra resolver through to the spawned definition", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "asc-extra-skill-sessions-"));
  const state = createSubagentState(sessionsDir);
  const skillDir = await materializeFixtureSkillDir();
  let capturedDef;
  let cleanedUp = false;

  const runtime = createAscExecutionRuntime({
    sessionsDir,
    state,
    modelProvider: () => "test/model",
    customSpawnerCapacityOwnership: "parent_owned",
    extraSkillProfileResolver: async (profile) => {
      if (profile !== "agent-fixture") return undefined;
      return {
        noSkills: true,
        skillSources: [skillDir],
        skillProfile: profile,
        loadedSkills: ["fixture-skill"],
        librarySkills: [],
        skillWarnings: [],
        cleanup: async () => {
          cleanedUp = true;
        },
      };
    },
    spawner: async (def) => {
      capturedDef = def;
      return { output: "ok", exitCode: 0, elapsed: 10, status: "done" };
    },
  });

  try {
    const result = await withTemporaryEnv({ ASC_SKILL_REGISTRY_PATH: undefined }, () =>
      runtime.execute(
        {
          profile: "custom",
          objective: "exercise extra skill profile resolver",
          systemPrompt: "fixture system prompt",
          skillProfile: "agent-fixture",
        },
        { cwd: sessionsDir },
      ),
    );

    assert.equal(result.ok, true);
    assert.equal(capturedDef.noSkills, true);
    assert.deepEqual(capturedDef.skillSources, [skillDir]);
    assert.equal(result.details.skillProfile, "agent-fixture");
    assert.deepEqual(result.details.loadedSkills, ["fixture-skill"]);
    assert.equal(cleanedUp, true);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
    await rm(skillDir, { recursive: true, force: true });
  }
});
