// summary: proves aggregate fleet lint is immutable, deterministic, complete across malformed/missing repos, and non-authorizing.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadEcProfiles } from "../src/ec-profiles.ts";
import { defaultFleetLintRoots, lintAgentFleet } from "../src/fleet-lint.ts";
import {
  commitAll,
  createAgentRepo,
  createMalformedManifestRepo,
  createMissingManifestRepo,
  createProfileRepo,
  createTemplateRepo,
  git,
  initRepo,
} from "./fleet-lint-fixtures.mjs";

const OBSERVED_AT = "2026-08-31T00:00:00.000Z";

async function fixture(t) {
  const root = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "agent-fleet-lint-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fleetRoot = join(root, "agents");
  const ecRoot = join(root, "engineering-core");
  const templateRoot = join(root, "template-repo");
  createProfileRepo(ecRoot);
  const templateCommit = createTemplateRepo(templateRoot);
  const ec = await loadEcProfiles(join(ecRoot, "skills", "profiles.json"));
  return { root, fleetRoot, ecRoot, templateRoot, templateCommit, ec };
}

function codes(report, repo) {
  return report.repositories
    .find((entry) => entry.repo === repo)
    ?.diagnostics.map((entry) => entry.code);
}

test("fleet lint defaults to the canonical fleet home while explicit env roots override", () => {
  const previous = process.env.PI_AGENT_REGISTRY_ROOTS;
  delete process.env.PI_AGENT_REGISTRY_ROOTS;
  try {
    assert.deepEqual(defaultFleetLintRoots(), [
      join(process.env.HOME, "ai-society/agents/agent-*"),
    ]);
    process.env.PI_AGENT_REGISTRY_ROOTS = "/one/agent-*:/two/agent-*";
    assert.deepEqual(defaultFleetLintRoots(), ["/one/agent-*", "/two/agent-*"]);
  } finally {
    if (previous === undefined) delete process.env.PI_AGENT_REGISTRY_ROOTS;
    else process.env.PI_AGENT_REGISTRY_ROOTS = previous;
  }
});

test("observation time is strict RFC3339 and never preserves path-shaped input", async () => {
  await assert.rejects(lintAgentFleet({ observedAt: "/2020/01/01" }), /RFC3339/);
  await assert.rejects(lintAgentFleet({ observedAt: "2026-02-31T00:00:00Z" }), /valid RFC3339/);
});

test("one clean managed-v2 agent yields a deterministic healthy immutable observation", async (t) => {
  const f = await fixture(t);
  const agentRoot = join(f.fleetRoot, "agent-one");
  await createAgentRepo({
    root: agentRoot,
    name: "agent-one",
    role: "Quality Reviewer",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });

  const first = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
  });
  const second = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: "2026-08-31T00:01:00.000Z",
  });
  const equivalentOffset = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: "2026-08-31T02:00:00+02:00",
  });

  assert.equal(first.summary.status, "healthy");
  assert.equal(first.summary.errors, 0);
  assert.equal(first.repositories.length, 1);
  assert.equal(first.repositories[0].manifest.role, "Quality Reviewer");
  assert.equal(first.repositories[0].manifest.creationTask, "AK-100");
  assert.equal(first.repositories[0].profile.status, "canonical");
  assert.equal(first.repositories[0].prompt.status, "current");
  assert.equal(first.repositories[0].template.provenanceStatus, "verified_local_source");
  assert.equal(first.repositories[0].revision.status, "clean_observed");
  assert.equal(first.repositories[0].lifecycle.signal, "recent_activity");
  assert.equal(first.policy.dispatchPosture, "fleet_phase_0_disabled");
  assert.equal(first.authorityEffect, "none");
  assert.match(first.reportSha256, /^[0-9a-f]{64}$/u);
  assert.match(first.stateSha256, /^[0-9a-f]{64}$/u);
  assert.equal(first.stateSha256, second.stateSha256);
  assert.notEqual(first.reportSha256, second.reportSha256);
  assert.equal(equivalentOffset.observedAt, OBSERVED_AT);
  assert.equal(equivalentOffset.reportSha256, first.reportSha256);
  assert.equal(existsSync(join(agentRoot, "must-not-exist")), false);
});

test("profile-less template manifests remain runtime-compatible but fail fleet conformance", async (t) => {
  const f = await fixture(t);
  await createAgentRepo({
    root: join(f.fleetRoot, "agent-profileless"),
    name: "agent-profileless",
    profile: null,
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
  });
  assert.ok(codes(report, "agents/agent-profileless")?.includes("profile.missing"));
  assert.equal(report.repositories[0].profile.status, "none");
  assert.equal(report.summary.status, "unhealthy");
});

test("fleet lint CLI emits machine JSON and preserves unhealthy exit semantics", async (t) => {
  const f = await fixture(t);
  await createAgentRepo({
    root: join(f.fleetRoot, "agent-cli"),
    name: "agent-cli",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const args = [
    "scripts/fleet-lint.mjs",
    "--root",
    join(f.fleetRoot, "agent-*"),
    "--ec-profiles",
    join(f.ecRoot, "skills", "profiles.json"),
    "--observed-at",
    OBSERVED_AT,
  ];
  const healthy = spawnSync(process.execPath, args, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(healthy.status, 0, healthy.stderr);
  assert.equal(JSON.parse(healthy.stdout).summary.status, "healthy");

  createMissingManifestRepo(join(f.fleetRoot, "agent-missing"));
  const unhealthy = spawnSync(process.execPath, args, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(unhealthy.status, 1, unhealthy.stderr);
  assert.equal(JSON.parse(unhealthy.stdout).summary.status, "unhealthy");

  const infrastructureFailure = spawnSync(
    process.execPath,
    args.map((value) =>
      value === join(f.fleetRoot, "agent-*") ? join(f.fleetRoot, "typo-*") : value,
    ),
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(infrastructureFailure.status, 2);
  assert.match(infrastructureFailure.stderr, /matched no repositories/);
  assert.doesNotMatch(infrastructureFailure.stderr, new RegExp(f.root, "u"));

  const missingProfilePath = join(f.root, "missing", "profiles.json");
  const profileFailure = spawnSync(
    process.execPath,
    args.map((value) =>
      value === join(f.ecRoot, "skills", "profiles.json") ? missingProfilePath : value,
    ),
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(profileFailure.status, 2);
  assert.match(profileFailure.stderr, /profile source could not be loaded/);
  assert.doesNotMatch(profileFailure.stderr, new RegExp(f.root, "u"));
});

test("missing and malformed manifests remain visible in one bounded aggregate report", async (t) => {
  const f = await fixture(t);
  createMissingManifestRepo(join(f.fleetRoot, "agent-missing"));
  createMalformedManifestRepo(join(f.fleetRoot, "agent-malformed"));

  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
  });

  assert.equal(report.summary.status, "unhealthy");
  assert.equal(report.summary.candidateRepositories, 2);
  assert.equal(report.summary.manifests, 1);
  assert.ok(codes(report, "agents/agent-missing")?.includes("fleet.manifest_missing"));
  assert.ok(codes(report, "agents/agent-malformed")?.includes("manifest.invalid"));
});

test("oversized repository resources become local diagnostics without hiding later candidates", async (t) => {
  const f = await fixture(t);
  const oversized = join(f.fleetRoot, "agent-oversized");
  initRepo(oversized);
  writeFileSync(join(oversized, "agent.json"), `{"padding":"${"x".repeat(70 * 1024)}"}\n`);
  commitAll(oversized, "oversized manifest");
  await createAgentRepo({
    root: join(f.fleetRoot, "agent-valid"),
    name: "agent-valid",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });

  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
  });
  assert.equal(report.repositories.length, 2);
  assert.ok(codes(report, "agents/agent-oversized")?.includes("manifest.capture_failed"));
  assert.ok(!codes(report, "agents/agent-oversized")?.includes("repository.lint_failed"));
  assert.equal(
    report.repositories.find((entry) => entry.repo === "agents/agent-valid")?.prompt.status,
    "current",
  );
});

test("lint reports exact role collisions, additive fields, deprecated profiles, and stale prompts", async (t) => {
  const f = await fixture(t);
  await createAgentRepo({
    root: join(f.fleetRoot, "agent-one"),
    name: "agent-one",
    role: "Quality  Reviewer",
    profile: "ec-old",
    additiveField: true,
    stalePrompt: true,
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  await createAgentRepo({
    root: join(f.fleetRoot, "agent-two"),
    name: "agent-two",
    role: "quality reviewer",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });

  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
  });

  assert.equal(report.collisions.length, 1);
  assert.equal(report.collisions[0].kind, "role");
  assert.deepEqual(report.collisions[0].repositories, ["agents/agent-one", "agents/agent-two"]);
  const first = codes(report, "agents/agent-one");
  assert.ok(first?.includes("role.exact_collision"));
  assert.ok(first?.includes("manifest.additive_field_ignored"));
  assert.ok(first?.includes("profile.deprecated_alias"));
  assert.ok(first?.includes("prompt.compiled_stale"));
});

test("noncanonical runtime prompts and malformed ownership cannot appear healthy", async (t) => {
  const f = await fixture(t);
  const agentRoot = join(f.fleetRoot, "agent-noncanonical");
  await createAgentRepo({
    root: agentRoot,
    name: "agent-noncanonical",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const manifest = JSON.parse(readFileSync(join(agentRoot, "agent.json"), "utf8"));
  manifest.system_prompt_file = "docs/person/runtime-prompt.md";
  writeFileSync(join(agentRoot, "agent.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(agentRoot, "docs", "person", "runtime-prompt.md"), "untrusted runtime\n");
  writeFileSync(
    join(agentRoot, "contracts", "template-ownership.yml"),
    "schema: ai-society.template-ownership/1\ntemplate_owned:\n  - docs///**\nagent_owned:\n  - .copier-answers.yml\n  - agent.json\n  - docs/person/**\n",
  );
  commitAll(agentRoot, "hostile prompt and ownership");
  const garbageRoot = join(f.fleetRoot, "agent-garbage-ownership");
  await createAgentRepo({
    root: garbageRoot,
    name: "agent-garbage-ownership",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  writeFileSync(
    join(garbageRoot, "contracts", "template-ownership.yml"),
    `${readFileSync(join(garbageRoot, "contracts", "template-ownership.yml"), "utf8")}\u2028unsupported syntax\n`,
  );
  commitAll(garbageRoot, "unsupported ownership syntax");

  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
  });
  const entry = report.repositories.find(
    (candidate) => candidate.repo === "agents/agent-noncanonical",
  );
  assert.ok(entry);
  assert.equal(entry.prompt.status, "unverifiable");
  assert.ok(
    entry.diagnostics.some((item) => item.code === "manifest.system_prompt_file_noncanonical"),
  );
  assert.ok(entry.diagnostics.some((item) => item.code === "template.ownership_invalid"));
  assert.ok(
    codes(report, "agents/agent-garbage-ownership")?.includes("template.ownership_invalid"),
  );
  assert.equal(report.summary.status, "unhealthy");
});

test("unverifiable template source failures do not disclose physical paths", async (t) => {
  const f = await fixture(t);
  const agentRoot = join(f.fleetRoot, "agent-redacted");
  await createAgentRepo({
    root: agentRoot,
    name: "agent-redacted",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const hostileSource = join(f.root, "not-git", "tpl-agent-repo");
  mkdirSync(hostileSource, { recursive: true });
  writeFileSync(
    join(agentRoot, ".copier-answers.yml"),
    `_src_path: ${hostileSource}\n_commit: ${"a".repeat(40)}\n`,
  );
  commitAll(agentRoot, "unverifiable source");
  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
  });
  assert.ok(codes(report, "agents/agent-redacted")?.includes("template.revision_unverifiable"));
  assert.doesNotMatch(
    JSON.stringify(report),
    new RegExp(f.root.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
  );
});

test("committed symlink manifests fail closed as invalid immutable inputs", async (t) => {
  const f = await fixture(t);
  const root = join(f.fleetRoot, "agent-symlink");
  initRepo(root);
  writeFileSync(
    join(root, "manifest-target.json"),
    JSON.stringify({
      schema: "ai-society.agent/1",
      name: "agent-symlink",
      role: "Symlink Role",
      creation_task: "AK-1",
      system_prompt_file: "docs/person/system-prompt.md",
      tools: [],
    }),
  );
  symlinkSync("manifest-target.json", join(root, "agent.json"));
  commitAll(root, "symlink manifest");

  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
  });
  assert.ok(codes(report, "agents/agent-symlink")?.includes("manifest.committed_blob_invalid"));
  assert.equal(report.summary.status, "unhealthy");
});

test("repository fsmonitor hooks and replacement refs cannot affect immutable capture", async (t) => {
  const f = await fixture(t);
  const agentRoot = join(f.fleetRoot, "agent-hardened");
  await createAgentRepo({
    root: agentRoot,
    name: "agent-hardened",
    role: "Original Role",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const original = git(agentRoot, "rev-parse", "HEAD");
  const manifest = JSON.parse(readFileSync(join(agentRoot, "agent.json"), "utf8"));
  manifest.role = "Replacement Role";
  writeFileSync(join(agentRoot, "agent.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const replacement = commitAll(agentRoot, "replacement payload");
  git(agentRoot, "reset", "--hard", original);
  git(agentRoot, "replace", original, replacement);

  const marker = join(f.root, "fsmonitor-executed");
  const hook = join(f.root, "fsmonitor-hook.sh");
  writeFileSync(hook, `#!/bin/sh\nprintf hook > ${JSON.stringify(marker)}\nprintf '2\\n'\n`);
  chmodSync(hook, 0o700);
  git(agentRoot, "config", "core.fsmonitor", hook);

  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
  });
  assert.equal(existsSync(marker), false);
  assert.equal(report.repositories[0].revision.commit, original);
  assert.equal(report.repositories[0].manifest.role, "Original Role");
  assert.equal(report.summary.status, "healthy");
});

test("initial/final Git endpoint drift becomes a concurrent-change error", async (t) => {
  const f = await fixture(t);
  const agentRoot = join(f.fleetRoot, "agent-race");
  await createAgentRepo({
    root: agentRoot,
    name: "agent-race",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const bin = join(f.root, "bin");
  mkdirSync(bin);
  const wrapper = join(bin, "git");
  writeFileSync(
    wrapper,
    `#!/bin/sh\n${JSON.stringify(realGit)} "$@"\ncode=$?\ncase "$*" in\n  *${agentRoot}*cat-file*blob*) printf race > ${JSON.stringify(join(agentRoot, "race.txt"))} ;;\nesac\nexit "$code"\n`,
  );
  chmodSync(wrapper, 0o700);
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}:${previousPath ?? ""}`;
  try {
    const report = await lintAgentFleet({
      roots: [join(f.fleetRoot, "agent-*")],
      ec: f.ec,
      observedAt: OBSERVED_AT,
    });
    const entry = report.repositories[0];
    assert.equal(entry.revision.status, "concurrent_change");
    assert.ok(entry.diagnostics.some((item) => item.code === "revision.concurrent_change"));
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});

test("an explicitly configured zero-match fleet pattern fails closed", async (t) => {
  const f = await fixture(t);
  mkdirSync(f.fleetRoot, { recursive: true });
  await assert.rejects(
    lintAgentFleet({
      roots: [join(f.fleetRoot, "agent-typo-*")],
      ec: f.ec,
      observedAt: OBSERVED_AT,
    }),
    /configured agent registry pattern matched no repositories/,
  );
});

test("missing committed profile members fail closed without materialization", async (t) => {
  const f = await fixture(t);
  writeFileSync(
    join(f.ecRoot, "skills", "profiles.json"),
    `${JSON.stringify(
      {
        schema: "engineering-core.skill-profiles/1",
        profiles: { "ec-current": ["missing-skill"] },
        deprecated_aliases: {},
      },
      null,
      2,
    )}\n`,
  );
  commitAll(f.ecRoot, "missing profile member");
  const ec = await loadEcProfiles(join(f.ecRoot, "skills", "profiles.json"));
  await createAgentRepo({
    root: join(f.fleetRoot, "agent-profile-member"),
    name: "agent-profile-member",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec,
    observedAt: OBSERVED_AT,
  });
  assert.ok(codes(report, "agents/agent-profile-member")?.includes("profile.member_missing"));
  assert.equal(report.summary.status, "unhealthy");
});

test("dirty worktrees, unknown profiles, unbound extras, and repository bounds fail closed", async (t) => {
  const f = await fixture(t);
  const dirtyRoot = join(f.fleetRoot, "agent-dirty");
  await createAgentRepo({
    root: dirtyRoot,
    name: "agent-dirty",
    profile: "ec-unknown",
    extras: ["user-only-skill"],
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  writeFileSync(join(dirtyRoot, "untracked.txt"), "drift\n");

  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
    maxRepositories: 1,
  });

  const repositoryCodes = codes(report, "agents/agent-dirty");
  assert.ok(repositoryCodes?.includes("revision.worktree_dirty"));
  assert.ok(repositoryCodes?.includes("profile.unknown"));
  assert.ok(repositoryCodes?.includes("skill.extra_revision_unbound"));
  assert.equal(report.repositories[0].revision.commit, git(dirtyRoot, "rev-parse", "HEAD"));
  assert.equal(report.summary.status, "unhealthy");

  createMissingManifestRepo(join(f.fleetRoot, "agent-second"));
  const bounded = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
    maxRepositories: 1,
  });
  assert.equal(bounded.summary.candidateRepositories, 2);
  assert.equal(bounded.summary.includedRepositories, 1);
  assert.equal(bounded.summary.omittedRepositories, 1);
  assert.ok(bounded.diagnostics.some((entry) => entry.code === "fleet.repository_limit_exceeded"));
});

test("oversized provenance and profile members stay local to their repositories", async (t) => {
  const f = await fixture(t);
  const oversizedRoot = join(f.fleetRoot, "agent-oversized-ownership");
  await createAgentRepo({
    root: oversizedRoot,
    name: "agent-oversized-ownership",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  writeFileSync(
    join(oversizedRoot, "contracts", "template-ownership.yml"),
    "x".repeat(64 * 1024 + 1),
  );
  commitAll(oversizedRoot, "oversized ownership");

  await createAgentRepo({
    root: join(f.fleetRoot, "agent-later"),
    name: "agent-later",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  writeFileSync(join(f.ecRoot, "skills", "skill-a", "SKILL.md"), "x".repeat(512 * 1024 + 1));
  commitAll(f.ecRoot, "oversized profile member");

  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
  });
  assert.equal(report.repositories.length, 2);
  assert.ok(
    codes(report, "agents/agent-oversized-ownership")?.includes(
      "template.ownership_capture_failed",
    ),
  );
  assert.ok(codes(report, "agents/agent-later")?.includes("profile.member_capture_failed"));
  assert.equal(report.summary.status, "unhealthy");
});

test("BOM, malformed UTF-8, and ambiguous Copier scalars fail closed without path disclosure", async (t) => {
  const f = await fixture(t);
  const invalidOwnership = join(f.fleetRoot, "agent-invalid-ownership");
  await createAgentRepo({
    root: invalidOwnership,
    name: "agent-invalid-ownership",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  writeFileSync(join(invalidOwnership, "contracts", "template-ownership.yml"), Buffer.from([0xff]));
  commitAll(invalidOwnership, "invalid ownership encoding");

  const bomOwnership = join(f.fleetRoot, "agent-bom-ownership");
  await createAgentRepo({
    root: bomOwnership,
    name: "agent-bom-ownership",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const ownershipBytes = readFileSync(join(bomOwnership, "contracts", "template-ownership.yml"));
  writeFileSync(
    join(bomOwnership, "contracts", "template-ownership.yml"),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), ownershipBytes]),
  );
  commitAll(bomOwnership, "BOM ownership");

  const invalidAnswers = join(f.fleetRoot, "agent-invalid-answers");
  await createAgentRepo({
    root: invalidAnswers,
    name: "agent-invalid-answers",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  writeFileSync(join(invalidAnswers, ".copier-answers.yml"), Buffer.from([0xff]));
  commitAll(invalidAnswers, "invalid answers encoding");

  const ambiguousAnswers = join(f.fleetRoot, "agent-ambiguous-answers");
  await createAgentRepo({
    root: ambiguousAnswers,
    name: "agent-ambiguous-answers",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const source = join(f.templateRoot, "copier", "tpl-agent-repo");
  writeFileSync(
    join(ambiguousAnswers, ".copier-answers.yml"),
    `_src_path: ${source}\n_src_path: ${source}\n_commit: ${f.templateCommit}\n`,
  );
  commitAll(ambiguousAnswers, "ambiguous answers");

  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
  });
  assert.ok(
    codes(report, "agents/agent-invalid-ownership")?.includes("template.ownership_invalid"),
  );
  assert.ok(codes(report, "agents/agent-bom-ownership")?.includes("template.ownership_invalid"));
  assert.ok(codes(report, "agents/agent-invalid-answers")?.includes("template.answers_invalid"));
  assert.ok(codes(report, "agents/agent-ambiguous-answers")?.includes("template.answers_invalid"));
  assert.doesNotMatch(JSON.stringify(report), new RegExp(f.root, "u"));
});

test("path-shaped manifest labels and additive keys are not serialized", async (t) => {
  const f = await fixture(t);
  const agentRoot = join(f.fleetRoot, "agent-path-injection");
  await createAgentRepo({
    root: agentRoot,
    name: "agent-path-injection",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const manifest = JSON.parse(readFileSync(join(agentRoot, "agent.json"), "utf8"));
  manifest.role = "Reviewer workspace (/tmp)";
  manifest.system_prompt_file = "persona (/tmp)";
  manifest[f.root] = true;
  manifest.scope[f.root] = true;
  writeFileSync(join(agentRoot, "agent.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  commitAll(agentRoot, "path-shaped manifest content");

  const uncRoot = join(f.fleetRoot, "agent-unc-role");
  await createAgentRepo({
    root: uncRoot,
    name: "agent-unc-role",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const uncManifest = JSON.parse(readFileSync(join(uncRoot, "agent.json"), "utf8"));
  uncManifest.role = String.raw`Reviewer workspace (\\server\share)`;
  writeFileSync(join(uncRoot, "agent.json"), `${JSON.stringify(uncManifest, null, 2)}\n`);
  commitAll(uncRoot, "UNC-shaped role");

  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: f.ec,
    observedAt: OBSERVED_AT,
  });
  const entry = report.repositories.find((item) => item.repo === "agents/agent-path-injection");
  const uncEntry = report.repositories.find((item) => item.repo === "agents/agent-unc-role");
  assert.equal(entry?.manifest.role, undefined);
  assert.equal(uncEntry?.manifest.role, undefined);
  assert.ok(entry?.diagnostics.some((item) => item.code === "manifest.role_not_reportable"));
  assert.ok(uncEntry?.diagnostics.some((item) => item.code === "manifest.role_not_reportable"));
  assert.equal(
    entry?.diagnostics.filter((item) => item.code === "manifest.additive_field_ignored").length,
    2,
  );
  assert.doesNotMatch(JSON.stringify(report), new RegExp(f.root, "u"));
  assert.doesNotMatch(JSON.stringify(report), /\/tmp|server/u);
});

test("logical profile paths never become absolute at a filesystem-root boundary", async (t) => {
  const f = await fixture(t);
  await createAgentRepo({
    root: join(f.fleetRoot, "agent-root-profile"),
    name: "agent-root-profile",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const report = await lintAgentFleet({
    roots: [join(f.fleetRoot, "agent-*")],
    ec: { ...f.ec, path: "/skills/profiles.json", skillsRoot: "/skills" },
    observedAt: OBSERVED_AT,
  });
  assert.equal(report.profileSource.path, "root/skills/profiles.json");
  assert.ok(!report.profileSource.path.startsWith("/"));
  assert.ok(report.diagnostics.every((entry) => !entry.path?.startsWith("/")));
});

test("profile endpoint finalization failures become aggregate diagnostics", async (t) => {
  const f = await fixture(t);
  await createAgentRepo({
    root: join(f.fleetRoot, "agent-profile-finalize"),
    name: "agent-profile-finalize",
    templateRoot: f.templateRoot,
    templateCommit: f.templateCommit,
  });
  const realGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const bin = join(f.root, "finalize-bin");
  const counter = join(f.root, "profile-status-count");
  mkdirSync(bin);
  const wrapper = join(bin, "git");
  writeFileSync(
    wrapper,
    `#!/bin/sh\ncase "$*" in\n  *${f.ecRoot}*status*)\n    count=$(cat ${JSON.stringify(counter)} 2>/dev/null || printf 0)\n    count=$((count + 1))\n    printf '%s' "$count" > ${JSON.stringify(counter)}\n    if [ "$count" -ge 2 ]; then exit 42; fi\n    ;;\nesac\nexec ${JSON.stringify(realGit)} "$@"\n`,
  );
  chmodSync(wrapper, 0o700);
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}:${previousPath ?? ""}`;
  try {
    const report = await lintAgentFleet({
      roots: [join(f.fleetRoot, "agent-*")],
      ec: f.ec,
      observedAt: OBSERVED_AT,
    });
    assert.equal(report.profileSource.status, "invalid");
    assert.ok(report.diagnostics.some((entry) => entry.code === "profile.source_finalize_failed"));
    assert.equal(report.repositories.length, 1);
    assert.doesNotMatch(JSON.stringify(report), new RegExp(f.root, "u"));
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
});
