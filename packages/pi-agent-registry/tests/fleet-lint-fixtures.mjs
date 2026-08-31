import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { compileFleetSystemPrompt, FLEET_PERSONA_FILES } from "../src/fleet-prompt-compiler.ts";

export function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

export function initRepo(root) {
  mkdirSync(root, { recursive: true });
  execFileSync("git", ["init", "--quiet", "--initial-branch", "main", root]);
  git(root, "config", "user.name", "Fleet Lint Test");
  git(root, "config", "user.email", "fleet-lint@example.invalid");
}

export function commitAll(root, message = "fixture") {
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", message);
  return git(root, "rev-parse", "HEAD");
}

export function createProfileRepo(root) {
  initRepo(root);
  mkdirSync(join(root, "skills", "skill-a"), { recursive: true });
  writeFileSync(
    join(root, "skills", "profiles.json"),
    `${JSON.stringify(
      {
        schema: "engineering-core.skill-profiles/1",
        profiles: { "ec-current": ["skill-a"] },
        deprecated_aliases: { "ec-old": "ec-current" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(root, "skills", "skill-a", "SKILL.md"), "---\nname: skill-a\n---\n");
  return commitAll(root, "profile fixture");
}

export function createTemplateRepo(root) {
  initRepo(root);
  const source = join(root, "copier", "tpl-agent-repo");
  mkdirSync(join(source, "contracts"), { recursive: true });
  mkdirSync(join(source, "scripts"), { recursive: true });
  writeFileSync(join(source, "agent.json.j2"), "{}\n");
  writeFileSync(join(source, "copier.yml"), "_subdirectory: ''\n");
  writeFileSync(
    join(source, "contracts", "template-ownership.yml"),
    "schema: ai-society.template-ownership/1\n",
  );
  writeFileSync(
    join(source, "scripts", "compile-system-prompt.py"),
    "# trusted template compiler\n",
  );
  return commitAll(root, "template fixture");
}

function ownershipContract() {
  return `schema: ai-society.template-ownership/1
template_owned:
  - scripts/**
agent_owned:
  - .copier-answers.yml
  - agent.json
  - docs/person/**
`;
}

export async function createAgentRepo(params) {
  const {
    root,
    name,
    role = "Test Role",
    creationTask = "AK-100",
    profile = "ec-current",
    tools = [],
    templateRoot,
    templateCommit,
    extras = [],
    additiveField,
    stalePrompt = false,
  } = params;
  initRepo(root);
  mkdirSync(join(root, "docs", "person"), { recursive: true });
  mkdirSync(join(root, "prompts", "activities"), { recursive: true });
  mkdirSync(join(root, "contracts"), { recursive: true });
  mkdirSync(join(root, "diary"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  const manifest = {
    activities: ["prompts/activities/*.md"],
    creation_task: creationTask,
    defaults: {
      model: null,
      thinking: "medium",
      ...(additiveField ? { future_mode: true } : {}),
    },
    extensions: [],
    name,
    role,
    schema: "ai-society.agent/1",
    scope: { repos: [], forbidden: [], note: "" },
    skills: { profile, extra: extras },
    system_prompt_file: "docs/person/system-prompt.md",
    tools,
    version: "0.1.0",
    ...(additiveField ? { additive_future_field: true } : {}),
  };
  writeFileSync(join(root, "agent.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of FLEET_PERSONA_FILES) {
    writeFileSync(join(root, "docs", "person", file), `# ${file}\n\n${name} ${file}\n`);
  }
  writeFileSync(join(root, "prompts", "activities", "check.md"), "# Check\n");
  writeFileSync(join(root, "contracts", "template-ownership.yml"), ownershipContract());
  writeFileSync(
    join(root, ".copier-answers.yml"),
    `_src_path: ${join(templateRoot, "copier", "tpl-agent-repo")}\n_commit: ${templateCommit}\nrepo_slug: ${name}\n`,
  );
  writeFileSync(join(root, "diary", "entry.md"), "# Recent activity\n");
  writeFileSync(
    join(root, "scripts", "compile-system-prompt.py"),
    "raise SystemExit('must not execute')\n",
  );
  const manifestBytes = readFileSync(join(root, "agent.json"));
  const compiled = await compileFleetSystemPrompt({
    manifestBytes,
    readFile: async (path) => {
      try {
        return readFileSync(join(root, path));
      } catch {
        return undefined;
      }
    },
  });
  writeFileSync(join(root, "docs", "person", "system-prompt.md"), compiled.expected);
  if (stalePrompt) {
    writeFileSync(join(root, "docs", "person", "identity.md"), "# Changed after compile\n");
  }
  return commitAll(root, "agent fixture");
}

export function createMissingManifestRepo(root) {
  initRepo(root);
  writeFileSync(join(root, "README.md"), "legacy agent\n");
  return commitAll(root, "legacy fixture");
}

export function createMalformedManifestRepo(root) {
  initRepo(root);
  writeFileSync(join(root, "agent.json"), "{not-json\n");
  return commitAll(root, "malformed fixture");
}
