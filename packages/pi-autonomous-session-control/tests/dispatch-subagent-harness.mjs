// ---
// summary: provides temporary dispatch tool fixtures, expected-failure handling, environment isolation, and a test skill registry.
// read_when:
//   - writing dispatch_subagent tests that need captured spawn definitions or skill-profile fixtures.
// ---

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSubagentState,
  registerSubagentTool,
  SUBAGENT_PROFILES,
} from "../extensions/self/subagent.ts";

export { SUBAGENT_PROFILES };

export async function executeToolExpectFailure(tool, ...args) {
  try {
    await tool.execute(...args);
  } catch (error) {
    if (error?.result) {
      return {
        content: [{ type: "text", text: error.result.text }],
        details: error.result.details,
        error,
      };
    }
    throw error;
  }
  throw new Error("Expected dispatch_subagent to throw a tool error");
}

export async function setup(spawnerOverride, modelProvider = () => "test/model") {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-dispatch-test-"));
  const state = createSubagentState(sessionsDir);

  let registeredTool;
  let capturedDef;
  let capturedModel;

  const pi = {
    registerTool(definition) {
      registeredTool = definition;
    },
  };

  const spawner =
    spawnerOverride ||
    (async (def, model) => {
      capturedDef = def;
      capturedModel = model;
      return {
        output: "ok",
        exitCode: 0,
        elapsed: 250,
        status: "done",
      };
    });

  registerSubagentTool(pi, state, modelProvider, async (...args) => {
    const def = args[0];
    const model = args[1];
    capturedDef = def;
    capturedModel = model;
    return spawner(...args);
  });

  return {
    state,
    tool: registeredTool,
    getCapturedDef: () => capturedDef,
    getCapturedModel: () => capturedModel,
    cleanup: async () => {
      await rm(sessionsDir, { recursive: true, force: true });
    },
  };
}

export async function withTemporaryEnv(overrides, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export async function createSkillRegistryFixture() {
  const root = await mkdtemp(join(tmpdir(), "subagent-skill-registry-"));
  const libraryRoot = join(root, "skills");

  const writeSkill = async (name, profileFit = []) => {
    const dir = join(libraryRoot, name);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "SKILL.md"),
      [
        "---",
        `name: ${name}`,
        `description: Test skill ${name}`,
        "disable-model-invocation: true",
        "---",
        "",
        `# ${name}`,
        "",
      ].join("\n"),
    );
    return {
      name,
      path: join(libraryRoot, name, "SKILL.md"),
      profile_fit: profileFit,
    };
  };

  const skills = [
    await writeSkill("skill-librarian", ["minimal", "ak", "governance", "dspx-skill-authoring"]),
    await writeSkill("ak-exact-task-execution", ["ak"]),
    await writeSkill("source-owner-boundary-router", ["governance"]),
    await writeSkill("dspx-skill-feedback-loop", ["dspx-skill-authoring"]),
  ];

  const registryPath = join(root, "skills-registry.json");
  await writeFile(
    registryPath,
    `${JSON.stringify(
      {
        schema_version: "ai-society-skill-registry-v1-test",
        library_root: libraryRoot,
        skills,
      },
      null,
      2,
    )}\n`,
  );

  return {
    root,
    registryPath,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
