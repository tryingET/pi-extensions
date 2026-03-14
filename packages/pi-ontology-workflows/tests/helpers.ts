import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function createTempOntologyRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), "pi-ontology-workflows-"));
  await mkdir(path.join(repo, ".git"), { recursive: true });
  await mkdir(path.join(repo, "ontology", "src", "reference", "concepts"), { recursive: true });
  await mkdir(path.join(repo, "ontology", "src", "reference", "relations"), { recursive: true });
  await mkdir(path.join(repo, "ontology", "src", "bridge"), { recursive: true });

  await writeFile(
    path.join(repo, "ontology", "manifest.yaml"),
    [
      "rocs:",
      "  layer: repo",
      '  id: "demo.repo"',
      '  version: "0.1.0"',
      '  created: "2026-03-14"',
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    path.join(repo, "ontology", "src", "system4d.yaml"),
    [
      "ontology:",
      "  system4d:",
      '    name: "Demo Repo"',
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
    path.join(repo, "ontology", "src", "bridge", "mapping.yaml"),
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
