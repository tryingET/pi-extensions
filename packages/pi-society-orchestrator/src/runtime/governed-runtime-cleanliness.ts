// summary: governed runtime materialization module (split from governed-runtime-materialization.ts).
// read_when:
//   - changing governed runtime cleanliness verification.

import { lstatSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve, sep } from "node:path";
import {
  GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX,
  GOVERNED_RUNTIME_PACKAGES,
} from "./governed-runtime-constants.ts";
import { git, gitRaw, sameJson } from "./governed-runtime-fs-integrity.ts";
import type {
  GovernedRuntimeCleanliness,
  GovernedRuntimeNodeModulesLayoutProof,
} from "./governed-runtime-proofs.ts";
import { GovernedRuntimeMaterializationError } from "./governed-runtime-proofs.ts";

export function edge(
  consumer: string,
  specifier: string,
  expectedOwnerName: string,
  expectedOwnerPath: string,
) {
  return { consumer, specifier, expectedOwnerName, expectedOwnerPath } as const;
}

function parseTaggedGitPaths(output: string): Array<{ marker: string; path: string }> {
  return output
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      if (record.length < 3 || record[1] !== " ") {
        throw new GovernedRuntimeMaterializationError(
          "materialization_git_inspection_failed",
          "Git returned a malformed tagged-path inventory.",
        );
      }
      return { marker: record[0], path: record.slice(2) };
    });
}

function inspectGovernedRuntimeIndexFlags(sourceRoot: string): string[] {
  const assumeUnchanged = parseTaggedGitPaths(gitRaw(sourceRoot, ["ls-files", "-v", "-z"]))
    .filter(({ marker }) => /^[a-z]$/u.test(marker))
    .map(({ path }) => `index-flag:assume-unchanged:${path}`);
  const skipWorktree = parseTaggedGitPaths(gitRaw(sourceRoot, ["ls-files", "-t", "-z"]))
    .filter(({ marker }) => marker === "S")
    .map(({ path }) => `index-flag:skip-worktree:${path}`);
  return [...assumeUnchanged, ...skipWorktree];
}

function inspectGovernedRuntimeTrackedBytes(sourceRoot: string): string[] {
  const scratch = mkdtempSync(resolve(tmpdir(), "governed-runtime-cleanliness-"));
  const indexPath = resolve(scratch, "head.index");
  const env = { GIT_INDEX_FILE: indexPath };
  try {
    gitRaw(sourceRoot, ["read-tree", "HEAD"], env);
    const records = gitRaw(
      sourceRoot,
      ["diff", "--no-ext-diff", "--name-status", "-z", "HEAD", "--"],
      env,
    )
      .split("\0")
      .filter(Boolean);
    if (records.length % 2 !== 0) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_git_inspection_failed",
        "Git returned a malformed tracked-byte comparison.",
      );
    }
    const changes: string[] = [];
    for (let index = 0; index < records.length; index += 2) {
      changes.push(`tracked-byte-drift:${records[index]}:${records[index + 1]}`);
    }
    return changes;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function inspectGovernedRuntimeCleanliness(sourceRoot: string): GovernedRuntimeCleanliness {
  const root = realpathSync(sourceRoot);
  const trackedOutput = git(root, ["status", "--porcelain=v1", "--untracked-files=no"]);
  const untrackedOutput = git(root, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    ".",
    ":(exclude)node_modules",
    ":(exclude)node_modules/**",
    ":(exclude)**/node_modules",
    ":(exclude)**/node_modules/**",
  ]);
  const trackedChanges = [
    ...(trackedOutput ? trackedOutput.split("\n").filter(Boolean) : []),
    ...inspectGovernedRuntimeIndexFlags(root),
    ...inspectGovernedRuntimeTrackedBytes(root),
  ];
  const uniqueTrackedChanges = [...new Set(trackedChanges)];
  const untrackedSourcePaths = untrackedOutput
    ? untrackedOutput
        .split("\0")
        .filter(Boolean)
        .filter((path) => !path.split(/[\\/]/u).includes("node_modules"))
    : [];
  return {
    trackedChanges: uniqueTrackedChanges,
    untrackedSourcePaths,
    clean: uniqueTrackedChanges.length === 0 && untrackedSourcePaths.length === 0,
  };
}

export function inspectGovernedRuntimeLexicalNodeModules(sourceRoot: string): readonly string[] {
  const root = realpathSync(sourceRoot);
  const paths: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const absolutePath = resolve(directory, entry.name);
      const relativePath = relative(root, absolutePath).split(sep).join("/");
      if (entry.name === "node_modules") {
        paths.push(relativePath);
        continue;
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(absolutePath);
    }
  };
  visit(root);
  return paths.sort();
}

export function verifyGovernedRuntimeNodeModulesLayout(
  sourceRoot: string,
): GovernedRuntimeNodeModulesLayoutProof {
  const paths = inspectGovernedRuntimeLexicalNodeModules(sourceRoot);
  const expectedPaths = [
    "node_modules",
    ...GOVERNED_RUNTIME_PACKAGES.map((packagePath) => `${packagePath}/node_modules`),
  ].sort();
  const rawNodeModulesRoot = resolve(realpathSync(sourceRoot), "node_modules");
  const rootStat = lstatSync(rawNodeModulesRoot);
  const nodeModulesRoot = realpathSync(rawNodeModulesRoot);
  const rootEntries = readdirSync(nodeModulesRoot, { withFileTypes: true });
  const generationEntry = rootEntries[0];
  const generationId = generationEntry?.name.slice(
    GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX.length,
  );
  const generationRoot = generationEntry ? resolve(nodeModulesRoot, generationEntry.name) : "";
  const generationStat = generationRoot ? lstatSync(generationRoot) : undefined;
  if (
    !sameJson(paths, expectedPaths) ||
    nodeModulesRoot !== rawNodeModulesRoot ||
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    rootEntries.length !== 1 ||
    !generationEntry?.isDirectory() ||
    generationEntry.isSymbolicLink() ||
    !generationEntry.name.startsWith(GOVERNED_RUNTIME_PACKAGE_GENERATION_PREFIX) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      generationId ?? "",
    ) ||
    !generationStat?.isDirectory() ||
    generationStat.isSymbolicLink()
  ) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_node_modules_layout_invalid",
      `Governed runtime must contain exactly one physical root generation and the 14 public node_modules links; observed lexical roots: ${paths.join(", ")}; root entries: ${rootEntries.map(({ name }) => name).join(", ")}.`,
    );
  }
  return {
    paths,
    root: nodeModulesRoot,
    rootMode: rootStat.mode & 0o7777,
    generation: {
      name: generationEntry.name,
      root: generationRoot,
      mode: generationStat.mode & 0o7777,
    },
  };
}
