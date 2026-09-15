#!/usr/bin/env node
/** Verify declared package source coverage and retrieve/expand real monorepo implementations. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, realpath, rm } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { contextPacketToolResult } from "../src/context-pack.js";
import { copyApprovedCorpus } from "../src/ripwire-corpus.js";
import { createRipwireScratch } from "../src/ripwire-scratch.js";
import { visibleSelections } from "./dogfood-compatibility.mjs";

assert.equal(process.argv.length, 4, "Expected --repo ABSOLUTE_MONOREPO_ROOT");
assert.equal(process.argv[2], "--repo");
const root = await realpath(process.argv[3]);
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).trim();
assert.equal(await realpath(git("rev-parse", "--show-toplevel")), root);
const before = git("status", "--porcelain");
const head = git("rev-parse", "HEAD");
const scratch = await createRipwireScratch(root);
const inventory = [];
let analyzedFiles;
try {
  const destination = join(scratch, "corpus");
  await mkdir(destination);
  const corpus = await copyApprovedCorpus(root, destination);
  analyzedFiles = corpus.files.size;
  const manifests = git("ls-files", "--", "packages/**/package.json").split("\n").filter(Boolean);
  for (const path of manifests) {
    const manifest = JSON.parse(await readFile(join(root, path), "utf8"));
    const prefix = `${dirname(path)}/`;
    const sourcePaths = [...corpus.files.keys()].filter((file) => file.startsWith(prefix));
    const declarations = manifest.pi?.extensions ?? [];
    const generatedEntries = [];
    for (const entry of declarations) {
      assert.equal(typeof entry, "string", `Unsupported extension declaration in ${path}`);
      const declared = posix.normalize(`${prefix}${entry}`);
      if (declared.split("/").some((part) => ["dist", "build", "target"].includes(part))) {
        assert.ok(
          sourcePaths.length > 0,
          `Generated entry has no analyzed package source: ${declared}`,
        );
        generatedEntries.push(declared);
        continue;
      }
      const globPrefix = declared.split(/[*?[\]]/u, 1)[0];
      assert.ok(
        sourcePaths.some(
          (file) =>
            file === declared ||
            file.startsWith(`${declared}/`) ||
            (globPrefix !== declared && file.startsWith(globPrefix)),
        ),
        `Declared extension absent from approved code corpus: ${declared}`,
      );
    }
    inventory.push({
      path,
      name: manifest.name,
      declaredExtensions: declarations.length,
      generatedEntriesNotIngested: generatedEntries,
      analyzedFiles: sourcePaths.length,
    });
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}

const providers = { agents: "off", docs: "off", git: "off", session: "off", ripwire: "required" };
const cases = [
  {
    objective: "Find runSnippet in the TypeScript tool and inspect its timeout",
    path: "packages/pi-typescript-tool/src/runner.ts",
    name: "runSnippet",
  },
  {
    objective: "Find contextPackProviderCapability to understand provider execution eligibility",
    path: "packages/pi-context-packer/src/provider-capabilities.js",
    name: "contextPackProviderCapability",
  },
  {
    objective: "Find collectCurrentWorktreeState in session compaction",
    path: "packages/pi-session-compaction/extensions/session-compaction/context-provider.js",
    name: "collectCurrentWorktreeState",
  },
];
let executions = 0;
const env = {
  cwd: join(root, "packages/pi-context-packer"),
  ripwire: { onExecution: () => executions++ },
};
const results = [];
for (const item of cases) {
  const started = Date.now();
  const discovery = await contextPacketToolResult({ objective: item.objective, providers }, env);
  assert.equal(discovery.details.ok, true, JSON.stringify(discovery.details.omissions));
  const selection = visibleSelections(discovery).find(
    (s) => s.path === item.path && s.name === item.name,
  );
  assert.ok(selection, `Expected symbol absent from visible packet: ${item.name}`);
  const expansion = await contextPacketToolResult(
    { objective: item.objective, providers, code: { mode: "expand", selection } },
    env,
  );
  assert.equal(expansion.details.ok, true, JSON.stringify(expansion.details.omissions));
  results.push({
    objective: item.objective,
    selection,
    durationMs: Date.now() - started,
    discoveryBytes: discovery.details.outputBudget.bytes,
    expansionBytes: expansion.details.outputBudget.bytes,
  });
}
assert.equal(git("status", "--porcelain"), before, "Acquisition changed the target worktree");
console.log(
  JSON.stringify(
    {
      schema: "pi.context-packer.monorepo-dogfood.v1",
      head,
      analyzedFiles,
      packages: inventory,
      cases: results,
      executions,
      unchanged: true,
      scope:
        "declared extension source coverage and symbol-directed retrieval; not package behavior or a model-task benchmark",
      modelTaskBenchmark: false,
    },
    null,
    2,
  ),
);
