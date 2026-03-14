import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type BoundaryResult, execFileTextAsync, isBoundaryFailure } from "./boundaries.ts";

const DEFAULT_ROCS_PROJECT = path.join(os.homedir(), "ai-society", "core", "rocs-cli");
const DEFAULT_ONTOLOGY_REPO = path.join(os.homedir(), "ai-society", "softwareco", "ontology");
const DEFAULT_WORKSPACE_ROOT = path.join(os.homedir(), "ai-society");
const DEFAULT_WORKSPACE_REF_MODE = "loose";

export interface OntologyLookupParams {
  concept?: string;
  search?: string;
  limit?: number;
}

export interface OntologyRuntimeConfig {
  rocsBin?: string;
  rocsProject?: string;
  ontologyRepo?: string;
  workspaceRoot?: string;
  workspaceRefMode?: "strict" | "loose" | string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface OntologyConceptRecord {
  concept: string;
  title: string;
  definition: string;
  body: string;
  labels: string[];
  layer: string;
  path: string;
}

interface RocsBuildOutput {
  dist?: {
    files?: {
      resolve?: string;
      id_index?: string;
    };
  };
}

interface RocsResolveArtifact {
  layers?: Array<{
    name?: string;
    src_root?: string;
  }>;
}

interface RocsIdIndex {
  items?: Array<{
    id?: string;
    kind?: string;
    labels?: string[];
    layer?: string;
    path_in_layer?: string;
  }>;
}

interface RocsInvocation {
  command: string;
  args: string[];
}

export async function lookupOntologyConcepts(
  params: OntologyLookupParams,
  config: OntologyRuntimeConfig = {},
): Promise<BoundaryResult<OntologyConceptRecord[]>> {
  const catalogResult = await loadOntologyCatalog(config);
  if (isBoundaryFailure(catalogResult)) {
    return catalogResult;
  }

  const catalog = catalogResult.value;
  const limit = Math.max(1, params.limit ?? (params.search ? 10 : 20));
  const requestedConcept = params.concept?.trim();
  const requestedSearch = params.search?.trim();

  if (requestedConcept) {
    const match = findExactConcept(catalog, requestedConcept);
    return { ok: true, value: match ? [match] : [] };
  }

  if (!requestedSearch) {
    return {
      ok: true,
      value: [...catalog].sort((a, b) => a.concept.localeCompare(b.concept)).slice(0, limit),
    };
  }

  const loweredSearch = requestedSearch.toLowerCase();
  const matches = catalog
    .map((record) => ({
      record,
      score: getOntologySearchScore(record, loweredSearch),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.record.concept.localeCompare(b.record.concept))
    .slice(0, limit)
    .map((entry) => entry.record);

  return { ok: true, value: matches };
}

export function formatOntologyConcepts(records: OntologyConceptRecord[]): string {
  return records
    .map((record) => {
      const title = record.title && record.title !== record.concept ? ` — ${record.title}` : "";
      const labels = record.labels.length > 0 ? `\nLabels: ${record.labels.join(", ")}` : "";
      const definition = record.definition || record.body || "No definition available.";
      return `## ${record.concept} (${record.layer})${title}${labels}\n${definition}`;
    })
    .join("\n\n");
}

async function loadOntologyCatalog(
  config: OntologyRuntimeConfig,
): Promise<BoundaryResult<OntologyConceptRecord[]>> {
  const buildResult = await runRocsJson<RocsBuildOutput>(
    [
      "build",
      "--repo",
      resolveOntologyRepo(config),
      "--resolve-refs",
      "--workspace-root",
      resolveWorkspaceRoot(config),
      "--workspace-ref-mode",
      resolveWorkspaceRefMode(config),
      "--json",
    ],
    config,
  );
  if (isBoundaryFailure(buildResult)) {
    return buildResult;
  }

  const resolvePath = buildResult.value.dist?.files?.resolve;
  const idIndexPath = buildResult.value.dist?.files?.id_index;
  if (!resolvePath || !idIndexPath) {
    return {
      ok: false,
      error: "rocs build did not return resolve/id_index artifact paths.",
    };
  }

  const resolveArtifactResult = readJsonFile<RocsResolveArtifact>(resolvePath);
  if (isBoundaryFailure(resolveArtifactResult)) {
    return resolveArtifactResult;
  }

  const idIndexResult = readJsonFile<RocsIdIndex>(idIndexPath);
  if (isBoundaryFailure(idIndexResult)) {
    return idIndexResult;
  }

  const layerRoots = new Map<string, string>();
  for (const layer of resolveArtifactResult.value.layers || []) {
    if (typeof layer.name === "string" && typeof layer.src_root === "string") {
      layerRoots.set(layer.name, layer.src_root);
    }
  }

  const concepts: OntologyConceptRecord[] = [];
  for (const item of idIndexResult.value.items || []) {
    if (item.kind !== "concept") {
      continue;
    }

    const conceptId = typeof item.id === "string" ? item.id.trim() : "";
    const layer = typeof item.layer === "string" ? item.layer.trim() : "";
    const pathInLayer = typeof item.path_in_layer === "string" ? item.path_in_layer.trim() : "";
    const layerRoot = layer ? layerRoots.get(layer) : undefined;

    if (!conceptId || !layer || !pathInLayer || !layerRoot) {
      continue;
    }

    const docPath = path.resolve(layerRoot, pathInLayer);
    if (!fs.existsSync(docPath)) {
      continue;
    }

    const parsed = parseOntologyMarkdown(docPath);
    concepts.push({
      concept: conceptId,
      title: parsed.title,
      definition: parsed.definition,
      body: parsed.body,
      labels: Array.isArray(item.labels)
        ? item.labels.filter(
            (label): label is string => typeof label === "string" && label.length > 0,
          )
        : [],
      layer,
      path: docPath,
    });
  }

  return { ok: true, value: concepts };
}

async function runRocsJson<T>(
  args: string[],
  config: OntologyRuntimeConfig,
): Promise<BoundaryResult<T>> {
  const invocation = buildRocsInvocation(args, config);
  const result = await execFileTextAsync(invocation.command, invocation.args, {
    signal: config.signal,
    timeoutMs: config.timeoutMs,
  });
  if (isBoundaryFailure(result)) {
    return {
      ok: false,
      error: extractRocsFailureMessage(result),
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  try {
    return { ok: true, value: JSON.parse(result.value) as T };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to parse rocs JSON output: ${error instanceof Error ? error.message : String(error)}`,
      stdout: result.value.slice(0, 1000),
    };
  }
}

function buildRocsInvocation(args: string[], config: OntologyRuntimeConfig): RocsInvocation {
  const rocsBin = config.rocsBin || process.env.PI_ORCH_ROCS_BIN;
  if (rocsBin) {
    return { command: rocsBin, args };
  }

  return {
    command: "uv",
    args: ["--project", resolveRocsProject(config), "run", "rocs", ...args],
  };
}

function readJsonFile<T>(filePath: string): BoundaryResult<T> {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(filePath, "utf8")) as T };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to read JSON file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function parseOntologyMarkdown(filePath: string): {
  title: string;
  definition: string;
  body: string;
} {
  const raw = fs.readFileSync(filePath, "utf8");
  const body = stripFrontmatter(raw).trim();
  return {
    title: extractTitle(body),
    definition: extractDefinition(body),
    body,
  };
}

function stripFrontmatter(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function extractTitle(body: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function extractDefinition(body: string): string {
  const definitionMatch = body.match(/^##\s+Definition\s*\n([\s\S]*?)(?=^##\s+|$)/m);
  if (definitionMatch) {
    return definitionMatch[1].trim();
  }

  const withoutTitle = body.replace(/^#\s+.+$/m, "").trim();
  const paragraphMatch = withoutTitle.match(/^(.+?)(?:\n\n|$)/s);
  return paragraphMatch ? paragraphMatch[1].trim() : body;
}

function findExactConcept(
  records: OntologyConceptRecord[],
  requestedConcept: string,
): OntologyConceptRecord | undefined {
  const normalized = requestedConcept.toLowerCase();
  return (
    records.find((record) => record.concept.toLowerCase() === normalized) ||
    records.find((record) => record.labels.some((label) => label.toLowerCase() === normalized))
  );
}

function getOntologySearchScore(record: OntologyConceptRecord, loweredSearch: string): number {
  let score = 0;

  if (record.concept.toLowerCase() === loweredSearch) {
    score = Math.max(score, 100);
  }
  if (record.labels.some((label) => label.toLowerCase() === loweredSearch)) {
    score = Math.max(score, 95);
  }
  if (record.concept.toLowerCase().includes(loweredSearch)) {
    score = Math.max(score, 80);
  }
  if (record.labels.some((label) => label.toLowerCase().includes(loweredSearch))) {
    score = Math.max(score, 70);
  }
  if (record.definition.toLowerCase().includes(loweredSearch)) {
    score = Math.max(score, 60);
  }
  if (record.title.toLowerCase().includes(loweredSearch)) {
    score = Math.max(score, 50);
  }
  if (record.body.toLowerCase().includes(loweredSearch)) {
    score = Math.max(score, 40);
  }

  return score;
}

function extractRocsFailureMessage(result: {
  error: string;
  stdout?: string;
  stderr?: string;
}): string {
  const parsedStdout = parseRocsErrorPayload(result.stdout);
  if (parsedStdout) {
    return parsedStdout;
  }

  const parsedStderr = parseRocsErrorPayload(result.stderr);
  if (parsedStderr) {
    return parsedStderr;
  }

  return result.stderr || result.error;
}

function parseRocsErrorPayload(text: string | undefined): string | undefined {
  if (!text || !text.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as {
      ok?: boolean;
      error?: { kind?: string; message?: string };
    };
    if (parsed.ok === false && parsed.error?.message) {
      return parsed.error.kind
        ? `rocs ${parsed.error.kind}: ${parsed.error.message}`
        : parsed.error.message;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function resolveRocsProject(config: OntologyRuntimeConfig): string {
  return config.rocsProject || process.env.PI_ORCH_ROCS_PROJECT || DEFAULT_ROCS_PROJECT;
}

function resolveOntologyRepo(config: OntologyRuntimeConfig): string {
  return config.ontologyRepo || process.env.PI_ORCH_ONTOLOGY_REPO || DEFAULT_ONTOLOGY_REPO;
}

function resolveWorkspaceRoot(config: OntologyRuntimeConfig): string {
  return config.workspaceRoot || process.env.PI_ORCH_ROCS_WORKSPACE_ROOT || DEFAULT_WORKSPACE_ROOT;
}

function resolveWorkspaceRefMode(config: OntologyRuntimeConfig): string {
  return (
    config.workspaceRefMode ||
    process.env.PI_ORCH_ROCS_WORKSPACE_REF_MODE ||
    DEFAULT_WORKSPACE_REF_MODE
  );
}
