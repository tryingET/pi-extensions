// summary: "Provides temporary ontology repository layouts and a fake workspace port for workflow tests."
// read_when:
//   - "Adding ontology workflow fixtures or changing test workspace detection behavior."

import { existsSync } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import {
  ensureStringArray,
  isRecord,
  parseFrontmatterDocument,
} from "../src/adapters/frontmatter.ts";
import type { ValidationFinding } from "../src/core/contracts.ts";
import type { RocsPort } from "../src/ports/rocs-port.ts";
import {
  type PreparedRuntimeManifest,
  preparedManifestDigest,
  sha256Raw,
} from "../src/semantic/prepared-runtime.ts";
import {
  createDevelopmentRocsRunnerDescriptor,
  type RocsRunnerDescriptor,
} from "../src/semantic/runner.ts";

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

export interface TempOntologyWorkspace {
  root: string;
  repo: string;
  company: string;
  core: string;
}

export async function createTempOntologyWorkspace(): Promise<TempOntologyWorkspace> {
  const root = await mkdtemp(path.join(tmpdir(), "pi-ontology-workspace-"));
  const repo = path.join(root, "softwareco", "owned", "fixture-repo");
  const company = path.join(root, "softwareco", "ontology");
  const core = path.join(root, "core", "ontology-kernel");
  await materializeOntologyRepo(repo, "nested");
  await materializeOntologyRepo(company, "root");
  await materializeOntologyRepo(core, "nested");
  return { root, repo, company, core };
}

async function createTempRepoWithLayout(
  layout: "nested" | "root",
  baseDir?: string,
): Promise<string> {
  const repo = await mkdtemp(path.join(baseDir ?? tmpdir(), "pi-ontology-workflows-"));
  await materializeOntologyRepo(repo, layout);
  return repo;
}

async function materializeOntologyRepo(repo: string, layout: "nested" | "root"): Promise<void> {
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
}

interface FixtureOntologyDocument {
  id: string;
  kind: string;
  labels: string[];
  path: string;
  pathInLayer: string;
  text: string;
}

export function createFixtureRocsPort(): RocsPort {
  return {
    async summary(repoPath, context) {
      assertFixtureContext(context);
      const fixture = await inspectFixtureOntology(repoPath);
      return {
        layers: [
          {
            name: "fixture-local",
            origin: repoPath,
            src_root: fixture.srcRoot,
            kind: fixture.layout === "nested" ? "repo" : "company",
            source: fixture.manifestPath,
          },
        ],
        counts: {
          concepts: fixture.documents.filter((document) => document.kind === "concept").length,
          relations: fixture.documents.filter((document) => document.kind === "relation").length,
        },
      };
    },
    async validate(repoPath, context) {
      assertFixtureContext(context);
      const findings = await validateFixtureOntology(repoPath);
      return { ok: findings.length === 0, findings };
    },
    async build(repoPath, context) {
      assertFixtureContext(context);
      const findings = await validateFixtureOntology(repoPath);
      if (findings.length > 0) {
        throw new Error(
          `fixture ontology validation failed: ${findings.map((finding) => finding.message).join("; ")}`,
        );
      }
      const fixture = await inspectFixtureOntology(repoPath);
      const distDir = path.join(fixture.ontologyRoot, "dist");
      await mkdir(distDir, { recursive: true });
      const resolvePath = path.join(distDir, "resolve.json");
      const summaryPath = path.join(distDir, "summary.json");
      const idIndexPath = path.join(distDir, "id-index.json");
      await writeFile(
        resolvePath,
        JSON.stringify({ layers: [{ name: "fixture-local", src_root: fixture.srcRoot }] }),
        "utf8",
      );
      await writeFile(
        summaryPath,
        JSON.stringify({
          counts: {
            concepts: fixture.documents.filter((document) => document.kind === "concept").length,
            relations: fixture.documents.filter((document) => document.kind === "relation").length,
          },
        }),
        "utf8",
      );
      await writeFile(
        idIndexPath,
        JSON.stringify({
          items: fixture.documents.map((document) => ({
            id: document.id,
            kind: document.kind,
            labels: document.labels,
            layer: "fixture-local",
            path_in_layer: document.pathInLayer,
          })),
        }),
        "utf8",
      );
      return {
        ok: true,
        dist: {
          dir: distDir,
          files: { resolve: resolvePath, summary: summaryPath, id_index: idIndexPath },
        },
      };
    },
    async pack(repoPath, ontId, context) {
      assertFixtureContext(context);
      const findings = await validateFixtureOntology(repoPath);
      if (findings.length > 0) {
        throw new Error(
          `fixture ontology validation failed: ${findings.map((finding) => finding.message).join("; ")}`,
        );
      }
      const fixture = await inspectFixtureOntology(repoPath);
      const document = fixture.documents.find((candidate) => candidate.id === ontId);
      if (!document) throw new Error(`fixture ontology id not found: ${ontId}`);
      return { text: document.text };
    },
  };
}

function assertFixtureContext(context: {
  workspaceRoot: string;
  workspaceRefMode: "strict" | "loose";
  resolveRefs: boolean;
}): void {
  if (!path.isAbsolute(context.workspaceRoot)) {
    throw new Error("fixture ROCS requires an absolute workspace root");
  }
  if (context.workspaceRefMode !== "strict" && context.workspaceRefMode !== "loose") {
    throw new Error("fixture ROCS requires a supported workspace reference mode");
  }
  if (context.resolveRefs !== true) {
    throw new Error("fixture ROCS only supports explicit reference resolution");
  }
}

async function validateFixtureOntology(repoPath: string): Promise<ValidationFinding[]> {
  const findings: ValidationFinding[] = [];
  const nestedRoot = path.join(repoPath, "ontology");
  const ontologyRoot = existsSync(nestedRoot) ? nestedRoot : repoPath;
  const manifestPath = path.join(ontologyRoot, "manifest.yaml");
  const system4dPath = path.join(ontologyRoot, "src", "system4d.yaml");

  if (!existsSync(manifestPath)) {
    findings.push(fixtureFinding("manifest.missing", `missing ontology manifest: ${manifestPath}`));
  } else {
    try {
      validateFixtureManifest(parse(await readFile(manifestPath, "utf8")));
    } catch (error) {
      findings.push(
        fixtureFinding(
          "manifest.invalid",
          `invalid ontology manifest: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  if (!existsSync(system4dPath)) {
    findings.push(fixtureFinding("system4d.missing", `missing ontology system4d: ${system4dPath}`));
  } else {
    try {
      const system4d = parse(await readFile(system4dPath, "utf8"));
      if (
        !isRecord(system4d) ||
        !isRecord(system4d.ontology) ||
        !isRecord(system4d.ontology.system4d)
      ) {
        throw new Error("expected ontology.system4d object");
      }
    } catch (error) {
      findings.push(
        fixtureFinding(
          "system4d.invalid",
          `invalid ontology system4d: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  try {
    const fixture = await inspectFixtureOntology(repoPath);
    const seen = new Set<string>();
    for (const document of fixture.documents) {
      if (seen.has(document.id)) {
        throw new Error(`duplicate ontology id: ${document.id}`);
      }
      seen.add(document.id);
    }
  } catch (error) {
    findings.push(
      fixtureFinding(
        "document.invalid",
        `invalid ontology document: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  return findings;
}

function validateFixtureManifest(value: unknown): void {
  if (!isRecord(value) || !isRecord(value.rocs)) throw new Error("expected rocs object");
  const layers = value.rocs.layers;
  if (layers === undefined) return;
  if (!Array.isArray(layers)) throw new Error("rocs.layers must be an array");
  const names = new Set<string>();
  for (const layer of layers) {
    if (!isRecord(layer)) throw new Error("manifest layer must be an object");
    const name = String(layer.name ?? "").trim();
    const ref = String(layer.ref ?? "").trim();
    const layerPath = String(layer.path ?? "").trim();
    if (!name) throw new Error("manifest layer requires name");
    if (names.has(name)) throw new Error(`duplicate manifest layer: ${name}`);
    names.add(name);
    if (Boolean(ref) === Boolean(layerPath)) {
      throw new Error(`manifest layer ${name} requires exactly one of ref or path`);
    }
    if (layerPath && (path.isAbsolute(layerPath) || layerPath.split(path.sep).includes(".."))) {
      throw new Error(`manifest layer ${name} path must stay relative to the ontology repo`);
    }
    if (ref && !/^<repo:[A-Za-z0-9._/-]+@[A-Za-z0-9._/-]+>$/.test(ref)) {
      throw new Error(`manifest layer ${name} has unsupported ref syntax`);
    }
  }
}

function fixtureFinding(rule: string, message: string): ValidationFinding {
  return { rule_id: `fixture.${rule}`, severity: "error", message };
}

async function inspectFixtureOntology(repoPath: string): Promise<{
  layout: "nested" | "root";
  ontologyRoot: string;
  manifestPath: string;
  srcRoot: string;
  documents: FixtureOntologyDocument[];
}> {
  const nestedManifest = path.join(repoPath, "ontology", "manifest.yaml");
  const layout = existsSync(nestedManifest) ? "nested" : "root";
  const ontologyRoot = layout === "nested" ? path.join(repoPath, "ontology") : repoPath;
  const manifestPath = path.join(ontologyRoot, "manifest.yaml");
  const srcRoot = path.join(ontologyRoot, "src");
  const documents: FixtureOntologyDocument[] = [];

  for (const [directory, fallbackKind] of [
    [path.join(srcRoot, "reference", "concepts"), "concept"],
    [path.join(srcRoot, "reference", "relations"), "relation"],
  ] as const) {
    if (!existsSync(directory)) continue;
    const entries = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const documentPath = path.join(directory, entry.name);
      const text = await readFile(documentPath, "utf8");
      const parsed = parseFrontmatterDocument(text);
      if (!isRecord(parsed.frontmatter.ont)) {
        throw new Error(`document is missing ont frontmatter: ${documentPath}`);
      }
      const ont = parsed.frontmatter.ont;
      const id = String(ont.id ?? "").trim();
      if (!id) throw new Error(`document is missing ont.id: ${documentPath}`);
      const kind = String(ont.type ?? "").trim();
      if (kind !== fallbackKind) {
        throw new Error(`document ${id} must declare ont.type=${fallbackKind}`);
      }
      documents.push({
        id,
        kind,
        labels: ensureStringArray(ont.labels),
        path: documentPath,
        pathInLayer: path.relative(srcRoot, documentPath),
        text,
      });
    }
  }

  return { layout, ontologyRoot, manifestPath, srcRoot, documents };
}

export async function createTestDevelopmentDescriptor(): Promise<RocsRunnerDescriptor> {
  const cache = path.join(process.env.HOME ?? tmpdir(), ".cache");
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(path.join(cache, "pi-rocs-test-runtime-"));
  await mkdir(path.join(root, "rocs_cli"));
  const source = Buffer.from("# test\n");
  await writeFile(path.join(root, "rocs_cli", "__init__.py"), source);
  await chmod(path.join(root, "rocs_cli", "__init__.py"), 0o644);
  const lock = Buffer.from("version = 1\n");
  const entrypoint = Buffer.from("python -B -m rocs_cli\n");
  const lockPath = path.join(root, "uv.lock");
  const entrypointPath = path.join(root, "entrypoint.txt");
  await writeFile(lockPath, lock);
  await writeFile(entrypointPath, entrypoint);
  const sourceInterpreter = await realpath(process.execPath);
  const interpreterPath = path.join(root, "python3.12");
  await copyFile(sourceInterpreter, interpreterPath);
  await chmod(interpreterPath, 0o755);
  const interpreter = await readFile(interpreterPath);
  const manifest: PreparedRuntimeManifest = {
    schema: "pi-rocs-prepared-runtime-manifest.v0",
    rocs_commit: "a".repeat(40),
    files: [
      { path: "rocs_cli/__init__.py", mode: 0o644, size: source.length, digest: sha256Raw(source) },
    ],
    dependency_lock_digest: sha256Raw(lock),
    interpreter: { path: interpreterPath, version: "3.12.10", digest: sha256Raw(interpreter) },
    entrypoint_digest: sha256Raw(entrypoint),
    manifest_digest: `sha256:${"0".repeat(64)}`,
  };
  manifest.manifest_digest = preparedManifestDigest(manifest);
  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest));
  return createDevelopmentRocsRunnerDescriptor({
    root,
    manifestPath,
    dependencyLockPath: lockPath,
    entrypointPath,
  });
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
