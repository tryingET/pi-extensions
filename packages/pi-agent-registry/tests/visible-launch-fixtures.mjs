// summary: isolated committed Phase-3 inputs, fake read-only AK CLI and injected transport; never launches Pi.
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEcProfiles } from "../src/ec-profiles.ts";
import { createAgentRegistry } from "../src/registry.ts";
import { spawnStandingAgentVisible } from "../src/visible-launch.ts";
import { commitAll, createAgentRepo, createProfileRepo, initRepo } from "./fleet-lint-fixtures.mjs";
export const PARENT_SESSION = "session-01a07977-431a-7e73-aea4-4258286315a9";
export function transportResult(request, overrides = {}) {
  return {
    ok: true,
    effectDisposition: "settled",
    launchMode: "tab",
    sessionMode: "clean",
    cwd: request.cwd,
    titleBase: "Standing: fixture",
    promptSummary: "fixture",
    ...overrides,
  };
}
export async function setupWorld(t, options = {}) {
  const scratch = mkdtempSync(join(tmpdir(), "phase3-visible-launch-"));
  const cleanups = [];
  t.after(async () => {
    await Promise.all(cleanups.map((f) => f()));
    await rm(scratch, { recursive: true, force: true });
  });
  const profileRoot = join(scratch, "profiles"),
    templateRoot = join(scratch, "template");
  const fleetRoot = join(scratch, "fleet"),
    parentRoot = join(scratch, "parent-repo");
  createProfileRepo(profileRoot);
  initRepo(templateRoot);
  writeFileSync(join(templateRoot, "README.md"), "template\n");
  const templateCommit = commitAll(templateRoot, "template");
  const agentName = "agent-test-steward",
    agentRoot = join(fleetRoot, agentName);
  await createAgentRepo({
    root: agentRoot,
    name: agentName,
    role: "Test Steward",
    creationTask: "AK-4242",
    profile: "ec-current",
    tools: options.tools ?? ["read", "bash"],
    templateRoot,
    templateCommit,
  });
  initRepo(parentRoot);
  writeFileSync(join(parentRoot, "README.md"), "parent repo\n");
  commitAll(parentRoot, "parent fixture");
  const ec = await loadEcProfiles(join(profileRoot, "skills", "profiles.json"));
  const registry = await createAgentRegistry({ roots: [join(fleetRoot, "agent-*")], ec });
  const cwd = join(parentRoot, "docs");
  await mkdir(cwd, { recursive: true });
  const calls = [],
    launches = [];
  const resolve = registry.resolve.bind(registry);
  registry.resolve = async (name) => {
    const launch = await resolve(name);
    cleanups.push(launch.cleanup);
    launches.push(launch);
    return launch;
  };
  const akBinary = join(scratch, "ak"),
    taskFile = join(scratch, "task.json"),
    akCalls = join(scratch, "ak-calls.jsonl");
  const task = {
    id: 5133,
    repo: parentRoot,
    title: "Bounded read-only inspection",
    status: "claimed",
    claimed_by: "fixture-owner",
    lease_expires_at: "2999-01-01T00:00:00Z",
  };
  writeFileSync(taskFile, JSON.stringify(task));
  writeFileSync(
    akBinary,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(akCalls)}, JSON.stringify(args) + "\\n");
if (JSON.stringify(args) !== JSON.stringify(["task", "show", "5133", "-F", "json"])) process.exit(9);
process.stdout.write(fs.readFileSync(${JSON.stringify(taskFile)}));
`,
  );
  chmodSync(akBinary, 0o755);
  const bootstrap = {
    extensions: [join(scratch, "trusted-ack.ts"), join(scratch, "trusted-presence.ts")],
    bindings: ["ack", "presence"].map((packageName) => ({
      package: packageName,
      entry: packageName,
      manifestSha256: "a".repeat(64),
      entrySha256: "b".repeat(64),
    })),
    verify: async () => true,
  };
  const world = {
    scratch,
    agentName,
    agentRoot,
    parentRoot,
    cwd,
    registry,
    task,
    taskFile,
    akCalls,
    calls,
    launches,
    bootstrap,
    receiptsDir: join(scratch, "receipts"),
    akBinary,
  };
  world.run = (request = {}, deps = {}, context = {}, signal) =>
    spawnStandingAgentVisible(
      {
        agent: agentName,
        task: 5133,
        objective: "Read-only: inspect README.md and report the fixture title, then stop.",
        parentPeerTarget: PARENT_SESSION,
        ...request,
      },
      {
        registry,
        pi: {},
        akBinary,
        receiptsDir: world.receiptsDir,
        resolveTrustedBootstrap: async () => bootstrap,
        transport: {
          launchPiQuestSession: async (r) => {
            calls.push(r);
            return transportResult(r);
          },
        },
        ...deps,
      },
      { cwd, model: { provider: "anthropic", id: "fixture-model" }, ...context },
      signal,
    );
  world.patchTask = (patch) => writeFileSync(taskFile, JSON.stringify({ ...task, ...patch }));
  world.patchManifest = (patch) => {
    const path = join(agentRoot, "agent.json");
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), ...patch }));
    commitAll(agentRoot, "change fixture manifest");
  };
  return world;
}
