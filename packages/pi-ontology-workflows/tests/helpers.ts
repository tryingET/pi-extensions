import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function createTempOntologyRepo(): Promise<string> {
  return createTempRepoWithLayout("nested");
}

export async function createTempRootLayoutOntologyRepo(): Promise<string> {
  return createTempRepoWithLayout("root");
}

export async function createTempRepoWithoutOntology(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), "pi-ontology-workflows-empty-"));
  await mkdir(path.join(repo, ".git"), { recursive: true });
  return repo;
}

export async function createTempDirectoryWithoutGit(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pi-ontology-workflows-dir-"));
}

export async function createWorkspaceTempRepoWithoutOntology(): Promise<string> {
  const base = path.join(
    process.env.HOME ?? "/home/tryinget",
    "ai-society",
    ".tmp-ontology-workflows",
  );
  await mkdir(base, { recursive: true });
  const repo = await mkdtemp(path.join(base, "empty-"));
  await mkdir(path.join(repo, ".git"), { recursive: true });
  return repo;
}

export async function createWorkspaceTempOntologyRepo(): Promise<string> {
  const base = path.join(
    process.env.HOME ?? "/home/tryinget",
    "ai-society",
    ".tmp-ontology-workflows",
  );
  await mkdir(base, { recursive: true });
  return createTempRepoWithLayout("nested", base);
}

async function createTempRepoWithLayout(
  layout: "nested" | "root",
  baseDir?: string,
): Promise<string> {
  const repo = await mkdtemp(path.join(baseDir ?? tmpdir(), "pi-ontology-workflows-"));
  const ontologyRoot = layout === "nested" ? path.join(repo, "ontology") : repo;

  await mkdir(path.join(repo, ".git"), { recursive: true });
  await mkdir(path.join(ontologyRoot, "src", "reference", "concepts"), { recursive: true });
  await mkdir(path.join(ontologyRoot, "src", "reference", "relations"), { recursive: true });
  await mkdir(path.join(ontologyRoot, "src", "bridge"), { recursive: true });

  await writeFile(
    path.join(ontologyRoot, "manifest.yaml"),
    [
      "rocs:",
      layout === "root" ? "  layer: company" : "  layer: repo",
      layout === "root" ? '  id: "demo.company"' : '  id: "demo.repo"',
      '  version: "0.1.0"',
      '  created: "2026-03-14"',
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    path.join(ontologyRoot, "src", "system4d.yaml"),
    [
      "ontology:",
      "  system4d:",
      layout === "root" ? '    name: "Demo Company Ontology"' : '    name: "Demo Repo"',
      '    version: "0.1"',
      "    container:",
      "      boundary:",
      "        in_scope:",
      '          - "demo ontology"',
      "        out_of_scope:",
      '          - "everything else"',
      "      constraints:",
      '        - "keep tests deterministic"',
      "    compass:",
      "      drivers:",
      '        - "exercise package workflows"',
      "      outcomes:",
      '        - "green validate/build"',
      "    engine:",
      "      invariants: []",
      "      lifecycle: []",
      "    fog:",
      "      assumptions: []",
      "      risks: []",
      "      exceptions: []",
      "      debt: []",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    path.join(ontologyRoot, "src", "bridge", "mapping.yaml"),
    "# Map concept IDs to repo artifacts (keep stable IDs; change mappings freely)\n\nmappings: []\n",
    "utf8",
  );

  return repo;
}

export function createFakeWorkspacePort(repoPath: string) {
  return {
    async detect(cwd: string) {
      return {
        cwd,
        workspaceRoot: path.dirname(path.dirname(repoPath)),
        workspaceRefMode: "loose" as const,
        currentRepoPath: repoPath,
        currentRepoDetectedFromGit: true,
        currentRepoHasOntology: true,
        currentRepoKind: "repo" as const,
        currentCompany: "softwareco",
      };
    },
    async resolveTarget() {
      return {
        scope: "repo" as const,
        repoPath,
        repoKind: "repo" as const,
        workspaceRoot: path.dirname(path.dirname(repoPath)),
        workspaceRefMode: "loose" as const,
        currentCompany: "softwareco",
        reasons: ["test target"],
        externalToCurrentRepo: false,
      };
    },
  };
}
