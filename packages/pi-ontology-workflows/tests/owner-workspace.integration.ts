// summary: "Runs explicit owner-workspace integration against the pinned real ROCS checkout."
// read_when:
//   - "Validating the package against owner ROCS and workspace repositories before release."

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createFilesystemPort } from "../src/adapters/filesystem.ts";
import { createRocsCliPort } from "../src/adapters/rocs-cli.ts";
import { createWorkspacePort } from "../src/adapters/workspace.ts";
import { runOntologyChange } from "../src/core/change.ts";
import { inspectOntology } from "../src/core/inspect.ts";
import {
  createFakeWorkspacePort,
  createTempOntologyRepo,
  createTempRepoWithoutOntology,
  createTempRootLayoutOntologyRepo,
} from "./helpers.ts";

const workspaceRoot = path.join(homedir(), "ai-society");
const rocsProject = path.join(workspaceRoot, "core", "rocs-cli");
const companyOntology = path.join(workspaceRoot, "softwareco", "ontology");
const coreOntology = path.join(workspaceRoot, "core", "ontology-kernel");

function requireOwnerWorkspace(): void {
  for (const [label, requiredPath] of [
    ["ROCS project", path.join(rocsProject, "pyproject.toml")],
    ["ROCS lock", path.join(rocsProject, "uv.lock")],
    ["pre-synchronized ROCS environment", path.join(rocsProject, ".venv")],
    ["company ontology", companyOntology],
    ["core ontology", coreOntology],
  ] as const) {
    assert.equal(
      existsSync(requiredPath),
      true,
      `owner-workspace integration requires ${label} at ${requiredPath}`,
    );
  }
  assert.doesNotThrow(
    () => execFileSync("uv", ["--version"], { stdio: "pipe" }),
    "owner-workspace integration requires uv on PATH",
  );
}

async function createPinnedOwnerRocsWrapper(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pi-ontology-owner-rocs-"));
  const wrapper = path.join(root, "rocs-owner-pinned");
  await writeFile(
    wrapper,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'exec uv run --frozen --no-sync --project "$ROCS_OWNER_PROJECT" rocs "$@"',
      "",
    ].join("\n"),
    "utf8",
  );
  await chmod(wrapper, 0o700);
  return wrapper;
}

test("pinned owner ROCS covers nested, bootstrap, manifest, root, search, and pack flows", async () => {
  requireOwnerWorkspace();
  const wrapper = await createPinnedOwnerRocsWrapper();
  const previous = {
    workspaceRoot: process.env.PI_ONTOLOGY_WORKSPACE_ROOT,
    rocsWorkspaceRoot: process.env.ROCS_WORKSPACE_ROOT,
    company: process.env.PI_COMPANY,
    piRocsBin: process.env.PI_ONTOLOGY_ROCS_BIN,
    rocsBin: process.env.ROCS_BIN,
    rocsProject: process.env.ROCS_OWNER_PROJECT,
    noBytecode: process.env.PYTHONDONTWRITEBYTECODE,
  };
  process.env.PI_ONTOLOGY_WORKSPACE_ROOT = workspaceRoot;
  process.env.ROCS_WORKSPACE_ROOT = workspaceRoot;
  process.env.PI_COMPANY = "softwareco";
  process.env.PI_ONTOLOGY_ROCS_BIN = wrapper;
  delete process.env.ROCS_BIN;
  process.env.ROCS_OWNER_PROJECT = rocsProject;
  process.env.PYTHONDONTWRITEBYTECODE = "1";

  try {
    const files = createFilesystemPort();
    const rocs = createRocsCliPort();

    const nestedRepo = await createTempOntologyRepo();
    const nestedDeps = {
      files,
      rocs,
      workspace: createFakeWorkspacePort(nestedRepo),
    };
    const nestedChange = await runOntologyChange(
      {
        mode: "apply",
        artifactKind: "concept",
        operation: "create",
        targetId: "demo.OwnerWorkspaceProbe",
        title: "Owner workspace probe",
        description: "A temporary fixture proving the real ROCS owner integration lane.",
        examples: ["release validation"],
        antiExamples: ["ambient production mutation"],
        validateAfter: true,
        buildAfter: true,
      },
      { cwd: nestedRepo },
      nestedDeps,
    );
    assert.equal(nestedChange.validation?.ok, true);
    assert.equal(Boolean(nestedChange.build?.idIndexPath), true);

    const search = await inspectOntology(
      { kind: "search", query: "demo.OwnerWorkspaceProbe" },
      { cwd: nestedRepo },
      nestedDeps,
    );
    assert.equal(search.search?.hits[0]?.ontId, "demo.OwnerWorkspaceProbe");
    const pack = await inspectOntology(
      { kind: "pack", ontId: "demo.OwnerWorkspaceProbe" },
      { cwd: nestedRepo },
      nestedDeps,
    );
    assert.match(pack.pack?.text ?? "", /demo.OwnerWorkspaceProbe/);

    const bootstrapRepo = await createTempRepoWithoutOntology();
    const bootstrap = await runOntologyChange(
      {
        mode: "apply",
        artifactKind: "bootstrap",
        operation: "create",
        manifestLayers: [{ name: "repo", path: "ontology/src" }],
        manifestDefaultProfile: "repo-only",
        manifestProfiles: { "repo-only": { include_layers: ["repo"], budget: 1500 } },
        validateAfter: true,
        buildAfter: true,
      },
      { cwd: bootstrapRepo },
      { files, rocs, workspace: createFakeWorkspacePort(bootstrapRepo) },
    );
    assert.equal(bootstrap.validation?.ok, true);
    assert.equal(Boolean(bootstrap.build?.idIndexPath), true);

    const manifestRepo = await createTempOntologyRepo();
    const manifest = await runOntologyChange(
      {
        mode: "apply",
        artifactKind: "manifest",
        operation: "update",
        manifestLayers: [{ name: "repo", path: "ontology/src" }],
        manifestDefaultProfile: "review",
        manifestProfiles: {
          review: { include_layers: ["repo"], budget: 1500 },
        },
        validateAfter: true,
        buildAfter: true,
      },
      { cwd: manifestRepo },
      { files, rocs, workspace: createFakeWorkspacePort(manifestRepo) },
    );
    assert.equal(manifest.validation?.ok, true);
    assert.equal(Boolean(manifest.build?.idIndexPath), true);

    const rootRepo = await createTempRootLayoutOntologyRepo();
    const rootChange = await runOntologyChange(
      {
        mode: "apply",
        artifactKind: "concept",
        operation: "create",
        targetId: "co.demo.OwnerWorkspaceProbe",
        title: "Owner workspace probe",
        description: "A temporary root-layout fixture for the real ROCS owner lane.",
        examples: ["release validation"],
        antiExamples: ["owner repository mutation"],
        validateAfter: true,
        buildAfter: true,
      },
      { cwd: rootRepo },
      { files, rocs, workspace: createFakeWorkspacePort(rootRepo) },
    );
    assert.equal(rootChange.validation?.ok, true);
    assert.equal(Boolean(rootChange.build?.idIndexPath), true);

    const ownerWorkspace = createWorkspacePort();
    const company = await ownerWorkspace.resolveTarget({ cwd: nestedRepo, scope: "company" });
    const core = await ownerWorkspace.resolveTarget({ cwd: nestedRepo, scope: "core" });
    assert.equal(company.repoPath, companyOntology);
    assert.equal(core.repoPath, coreOntology);
  } catch (error) {
    throw new Error(
      `owner-workspace ROCS integration failed; ensure the pinned uv environment and owner ontology repositories are available: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    restoreEnv("PI_ONTOLOGY_WORKSPACE_ROOT", previous.workspaceRoot);
    restoreEnv("ROCS_WORKSPACE_ROOT", previous.rocsWorkspaceRoot);
    restoreEnv("PI_COMPANY", previous.company);
    restoreEnv("PI_ONTOLOGY_ROCS_BIN", previous.piRocsBin);
    restoreEnv("ROCS_BIN", previous.rocsBin);
    restoreEnv("ROCS_OWNER_PROJECT", previous.rocsProject);
    restoreEnv("PYTHONDONTWRITEBYTECODE", previous.noBytecode);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
