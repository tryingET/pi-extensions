import path from "node:path";
import { parse, stringify } from "yaml";
import {
  ensureStringArray,
  isRecord,
  parseFrontmatterDocument,
  renderFrontmatterDocument,
} from "../adapters/frontmatter.ts";
import type { FilesPort } from "../ports/files-port.ts";
import type { RocsPort } from "../ports/rocs-port.ts";
import type { WorkspacePort } from "../ports/workspace-port.ts";
import type {
  OntologyChangeRequest,
  OntologyChangeResult,
  PlannedWrite,
  RelationEdge,
} from "./contracts.ts";

interface ChangeDeps {
  files: FilesPort;
  rocs: RocsPort;
  workspace: WorkspacePort;
}

const DEFAULT_DOC_SYSTEM4D = {
  fog: {
    risks: [],
    assumptions: [],
    exceptions: [],
    debt: [],
  },
};

export async function planOntologyChange(
  request: OntologyChangeRequest,
  runtime: { cwd: string },
  deps: ChangeDeps,
): Promise<OntologyChangeResult> {
  const target = await deps.workspace.resolveTarget({
    cwd: runtime.cwd,
    scope: request.scope,
    targetRepo: request.targetRepo,
    targetId: request.targetId,
    artifactKind: request.artifactKind,
  });

  const writes = await buildWrites(request, target.repoPath, deps.files);
  return {
    target,
    writes,
    warnings: target.externalToCurrentRepo
      ? ["change targets an ontology repo outside the current repo"]
      : [],
    applied: false,
  };
}

export async function runOntologyChange(
  request: OntologyChangeRequest,
  runtime: { cwd: string },
  deps: ChangeDeps,
): Promise<OntologyChangeResult> {
  const planned = await planOntologyChange(request, runtime, deps);
  for (const write of planned.writes) {
    await deps.files.writeText(write.path, write.content);
  }

  const rocsContext = {
    workspaceRoot: planned.target.workspaceRoot,
    workspaceRefMode: planned.target.workspaceRefMode,
    resolveRefs: true,
  } as const;

  const validationRequested = request.validateAfter !== false;
  const validation = validationRequested
    ? await deps.rocs.validate(planned.target.repoPath, rocsContext)
    : undefined;

  let build: OntologyChangeResult["build"];
  if (request.buildAfter !== false && (!validation || validation.ok)) {
    const buildResult = await deps.rocs.build(planned.target.repoPath, rocsContext);
    build = {
      ok: buildResult.ok,
      summaryPath: buildResult.dist.files.summary,
      idIndexPath: buildResult.dist.files.id_index,
    };
  }

  return {
    ...planned,
    validation,
    build,
    applied: true,
    warnings: [
      ...planned.warnings,
      ...(validation && !validation.ok ? ["post-apply validation failed"] : []),
    ],
  };
}

async function buildWrites(
  request: OntologyChangeRequest,
  repoPath: string,
  files: FilesPort,
): Promise<PlannedWrite[]> {
  switch (request.artifactKind) {
    case "concept":
      return [await buildConceptWrite(request, repoPath, files)];
    case "relation":
      return [await buildRelationWrite(request, repoPath, files)];
    case "bridge":
      return [await buildBridgeWrite(request, repoPath, files)];
    case "system4d":
      return [await buildSystem4dWrite(request, repoPath, files)];
    default:
      throw new Error(`unsupported artifact kind: ${String(request.artifactKind)}`);
  }
}

async function buildConceptWrite(
  request: OntologyChangeRequest,
  repoPath: string,
  files: FilesPort,
): Promise<PlannedWrite> {
  const targetId = requireNonEmpty(request.targetId, "concept changes require targetId");
  const filePath = path.join(
    repoPath,
    "ontology",
    "src",
    "reference",
    "concepts",
    `${targetId}.md`,
  );
  const existed = await files.exists(filePath);
  assertOperationAllowed(request.operation, existed, filePath);

  const existing = existed
    ? parseFrontmatterDocument(await files.readText(filePath))
    : { frontmatter: {}, body: "" };
  const existingOnt = isRecord(existing.frontmatter.ont) ? existing.frontmatter.ont : {};
  const title = firstNonEmpty(
    request.title,
    extractTitle(existing.body),
    ensureStringArray(request.labels)[0],
    ensureStringArray(existingOnt.labels)[0],
    deriveTitleFromId(targetId),
  );
  const description = firstNonEmpty(request.description, stringValue(existingOnt.description));
  if (!description) {
    throw new Error(`concept ${targetId} requires description for ${request.operation}`);
  }

  const ont = {
    ...existingOnt,
    id: targetId,
    type: "concept",
    labels: nonEmptyStringArray(
      ensureStringArray(
        request.labels,
        ensureStringArray(existingOnt.labels, title ? [title] : []),
      ),
    ),
    synonyms: ensureStringArray(request.synonyms, ensureStringArray(existingOnt.synonyms)),
    description,
    status: firstNonEmpty(request.status, stringValue(existingOnt.status)) || undefined,
    deprecated:
      request.deprecated ?? (isRecord(existingOnt.deprecated) ? existingOnt.deprecated : undefined),
    lint_ignore: ensureStringArray(existingOnt.lint_ignore),
    relations: normalizeRelationEdges(request.relations ?? existingOnt.relations ?? []),
    examples: nonEmptyStringArray(request.examples ?? ensureStringArray(existingOnt.examples)),
    anti_examples: nonEmptyStringArray(
      request.antiExamples ?? ensureStringArray(existingOnt.anti_examples),
    ),
  };

  const frontmatter = {
    ...existing.frontmatter,
    ont,
    system4d: isRecord(existing.frontmatter.system4d)
      ? existing.frontmatter.system4d
      : DEFAULT_DOC_SYSTEM4D,
  };

  const body = renderConceptBody({
    title,
    targetId,
    description,
    examples: ensureStringArray(ont.examples),
    antiExamples: ensureStringArray(ont.anti_examples),
    notes: buildNotes(request),
  });

  return {
    path: filePath,
    existed,
    summary: `${request.operation} concept ${targetId}`,
    content: renderFrontmatterDocument(frontmatter, body),
  };
}

async function buildRelationWrite(
  request: OntologyChangeRequest,
  repoPath: string,
  files: FilesPort,
): Promise<PlannedWrite> {
  const targetId = requireNonEmpty(request.targetId, "relation changes require targetId");
  const relationFilePath = await resolveRelationFilePath(targetId, repoPath, files);
  const existed = await files.exists(relationFilePath);
  assertOperationAllowed(request.operation, existed, relationFilePath);

  const existing = existed
    ? parseFrontmatterDocument(await files.readText(relationFilePath))
    : { frontmatter: {}, body: "" };
  const existingOnt = isRecord(existing.frontmatter.ont) ? existing.frontmatter.ont : {};
  const labelFallback = deriveRelationLabel(targetId);
  const title = firstNonEmpty(request.title, extractTitle(existing.body), labelFallback);
  const description = firstNonEmpty(request.description, stringValue(existingOnt.description));
  if (!description) {
    throw new Error(`relation ${targetId} requires description for ${request.operation}`);
  }

  const labels = nonEmptyStringArray(
    ensureStringArray(request.labels, ensureStringArray(existingOnt.labels, [labelFallback])),
  );
  const characteristics = isRecord(request.relationCharacteristics)
    ? request.relationCharacteristics
    : isRecord(existingOnt.characteristics)
      ? existingOnt.characteristics
      : undefined;

  const ont = {
    ...existingOnt,
    id: targetId,
    type: "relation",
    labels,
    description,
    status: firstNonEmpty(request.status, stringValue(existingOnt.status)) || undefined,
    deprecated:
      request.deprecated ?? (isRecord(existingOnt.deprecated) ? existingOnt.deprecated : undefined),
    group: firstNonEmpty(request.relationGroup, stringValue(existingOnt.group)) || undefined,
    characteristics,
    inverse: firstNonEmpty(request.inverse, stringValue(existingOnt.inverse)) || undefined,
    lint_ignore: ensureStringArray(existingOnt.lint_ignore),
  };

  const body = renderRelationBody({
    title,
    description,
    examples: nonEmptyStringArray(request.examples ?? []),
    domain: request.domain,
    range: request.range,
    notes: buildNotes(request),
  });

  return {
    path: relationFilePath,
    existed,
    summary: `${request.operation} relation ${targetId}`,
    content: renderFrontmatterDocument({ ...existing.frontmatter, ont }, body),
  };
}

async function buildBridgeWrite(
  request: OntologyChangeRequest,
  repoPath: string,
  files: FilesPort,
): Promise<PlannedWrite> {
  const filePath = path.join(repoPath, "ontology", "src", "bridge", "mapping.yaml");
  const existed = await files.exists(filePath);
  if (request.operation === "update" && !existed) {
    throw new Error(`bridge mapping file does not exist: ${filePath}`);
  }

  const incomingMappings = request.bridgeMappings ?? [];
  if (incomingMappings.length === 0) {
    throw new Error("bridge changes require bridgeMappings");
  }

  const current = existed ? parse(await files.readText(filePath)) : { mappings: [] };
  const root = isRecord(current) ? current : { mappings: [] };
  const existingMappings = Array.isArray(root.mappings) ? root.mappings.filter(isRecord) : [];
  const nextMappings = [...existingMappings];

  for (const mapping of incomingMappings) {
    const conceptId = requireNonEmpty(mapping.concept_id, "bridge mapping requires concept_id");
    const target = requireNonEmpty(mapping.target, "bridge mapping requires target");
    const index = nextMappings.findIndex(
      (entry) =>
        stringValue(entry.concept_id) === conceptId && stringValue(entry.target) === target,
    );

    if (request.operation === "create" && index >= 0) {
      throw new Error(`bridge mapping already exists for ${conceptId} -> ${target}`);
    }
    if (request.operation === "update" && index < 0) {
      throw new Error(`bridge mapping does not exist for ${conceptId} -> ${target}`);
    }

    const normalized = {
      concept_id: conceptId,
      target,
      kind: firstNonEmpty(mapping.kind),
      note: firstNonEmpty(mapping.note),
    };

    if (index >= 0) {
      nextMappings[index] = {
        ...nextMappings[index],
        ...omitUndefined(normalized),
      };
    } else {
      nextMappings.push(omitUndefined(normalized));
    }
  }

  const content = `# Map concept IDs to repo artifacts (keep stable IDs; change mappings freely)\n\n${stringify({ mappings: nextMappings }).trimEnd()}\n`;
  return {
    path: filePath,
    existed,
    summary: `${request.operation} bridge mappings (${incomingMappings.length})`,
    content,
  };
}

async function buildSystem4dWrite(
  request: OntologyChangeRequest,
  repoPath: string,
  files: FilesPort,
): Promise<PlannedWrite> {
  const filePath = path.join(repoPath, "ontology", "src", "system4d.yaml");
  const existed = await files.exists(filePath);
  if (request.operation === "update" && !existed) {
    throw new Error(`system4d file does not exist: ${filePath}`);
  }

  const system4dPath = requireNonEmpty(
    request.system4dPath,
    "system4d changes require system4dPath",
  );
  const action = request.system4dAction ?? "append";
  if (request.system4dValue === undefined) {
    throw new Error("system4d changes require system4dValue");
  }

  const parsed = existed ? parse(await files.readText(filePath)) : { ontology: { system4d: {} } };
  const root = isRecord(parsed) ? parsed : { ontology: { system4d: {} } };
  const system4dRoot = ensureSystem4dRoot(root);
  const fullPath = system4dPath.split(".").filter(Boolean);
  if (fullPath.length === 0) {
    throw new Error("system4dPath must not be empty");
  }

  const pathExists = hasPath(system4dRoot, fullPath);
  if (request.operation === "create" && pathExists) {
    throw new Error(`system4d path already exists: ${system4dPath}`);
  }
  if (request.operation === "update" && !pathExists) {
    throw new Error(`system4d path does not exist: ${system4dPath}`);
  }

  applySystem4dMutation(system4dRoot, fullPath, action, request.system4dValue);

  return {
    path: filePath,
    existed,
    summary: `${request.operation} system4d ${system4dPath} (${action})`,
    content: `${stringify(root).trimEnd()}\n`,
  };
}

function renderConceptBody(input: {
  title: string;
  targetId: string;
  description: string;
  examples: string[];
  antiExamples: string[];
  notes: string[];
}): string {
  const lines = [
    `# ${input.title} (${input.targetId})`,
    "",
    "## Definition",
    input.description.trim(),
  ];

  if (input.examples.length > 0) {
    lines.push("", "## Examples", ...input.examples.map((entry) => `- ${entry}`));
  }

  if (input.antiExamples.length > 0) {
    lines.push("", "## Anti-examples", ...input.antiExamples.map((entry) => `- ${entry}`));
  }

  if (input.notes.length > 0) {
    lines.push("", "## Notes", ...input.notes.map((entry) => `- ${entry}`));
  }

  return `${lines.join("\n")}\n`;
}

function renderRelationBody(input: {
  title: string;
  description: string;
  examples: string[];
  domain?: string;
  range?: string;
  notes: string[];
}): string {
  const lines: string[] = [];

  if (input.examples.length > 0) {
    lines.push("examples:", ...input.examples.map((entry) => `  - ${JSON.stringify(entry)}`), "");
  }

  lines.push(`# ${input.title}`, "", "## Definition", input.description.trim());

  if (input.domain || input.range) {
    lines.push("", "## Domain / Range");
    if (input.domain) lines.push(`- Domain: ${input.domain}`);
    if (input.range) lines.push(`- Range: ${input.range}`);
  }

  if (input.notes.length > 0) {
    lines.push("", "## Notes", ...input.notes.map((entry) => `- ${entry}`));
  }

  return `${lines.join("\n")}\n`;
}

function buildNotes(request: OntologyChangeRequest): string[] {
  const notes = [...(request.notes ?? [])].map((entry) => String(entry).trim()).filter(Boolean);
  if (request.rationale?.trim()) {
    notes.unshift(`Rationale: ${request.rationale.trim()}`);
  }
  return notes;
}

function normalizeRelationEdges(value: unknown): RelationEdge[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((entry) => ({
    type: requireNonEmpty(entry.type, "relation edge requires type"),
    target: requireNonEmpty(entry.target, "relation edge requires target"),
  }));
}

function requireNonEmpty(value: unknown, message: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(message);
  return text;
}

function stringValue(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : undefined;
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (value?.trim()) return value.trim();
  }
  return "";
}

function deriveTitleFromId(targetId: string): string {
  const leaf = targetId.split(".").filter(Boolean).at(-1) ?? targetId;
  return leaf.replace(/[_-]+/g, " ");
}

async function resolveRelationFilePath(
  targetId: string,
  repoPath: string,
  files: FilesPort,
): Promise<string> {
  const leaf = deriveRelationLabel(targetId);
  const leafPath = path.join(repoPath, "ontology", "src", "reference", "relations", `${leaf}.md`);
  if (await files.exists(leafPath)) return leafPath;
  return path.join(repoPath, "ontology", "src", "reference", "relations", `${leaf}.md`);
}

function deriveRelationLabel(targetId: string): string {
  return targetId.split(".").filter(Boolean).at(-1) ?? targetId;
}

function extractTitle(body: string): string | undefined {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].replace(/\s*\([^)]*\)\s*$/, "").trim() : undefined;
}

function nonEmptyStringArray(values: string[]): string[] {
  return values.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function assertOperationAllowed(
  operation: OntologyChangeRequest["operation"],
  existed: boolean,
  filePath: string,
): void {
  if (operation === "create" && existed) {
    throw new Error(`target already exists: ${filePath}`);
  }
  if (operation === "update" && !existed) {
    throw new Error(`target does not exist: ${filePath}`);
  }
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function ensureSystem4dRoot(root: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(root.ontology) && isRecord(root.ontology.system4d)) {
    return root.ontology.system4d;
  }
  if (isRecord(root.system4d)) {
    return root.system4d;
  }

  if (!isRecord(root.ontology)) {
    root.ontology = {};
  }
  const ontologyRoot = root.ontology as Record<string, unknown>;
  ontologyRoot.system4d = {};
  return ontologyRoot.system4d as Record<string, unknown>;
}

function hasPath(root: Record<string, unknown>, segments: string[]): boolean {
  let current: unknown = root;
  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) return false;
    current = current[segment];
  }
  return true;
}

function applySystem4dMutation(
  root: Record<string, unknown>,
  segments: string[],
  action: OntologyChangeRequest["system4dAction"],
  value: unknown,
): void {
  const parent = getOrCreateParent(root, segments.slice(0, -1));
  const leaf = segments.at(-1);
  if (!leaf) throw new Error("system4d mutation path is empty");

  if (action === "set") {
    parent[leaf] = structuredClone(value);
    return;
  }

  if (action === "merge") {
    if (!isRecord(value)) throw new Error("system4d merge requires system4dValue to be an object");
    const current = parent[leaf];
    if (current === undefined) {
      parent[leaf] = structuredClone(value);
      return;
    }
    if (!isRecord(current)) throw new Error(`system4d path ${segments.join(".")} is not an object`);
    parent[leaf] = { ...current, ...structuredClone(value) };
    return;
  }

  const nextValues = Array.isArray(value)
    ? value.map((entry) => structuredClone(entry))
    : [structuredClone(value)];
  const current = parent[leaf];
  if (current === undefined) {
    parent[leaf] = nextValues;
    return;
  }
  if (!Array.isArray(current)) {
    throw new Error(`system4d path ${segments.join(".")} is not an array`);
  }
  current.push(...nextValues);
}

function getOrCreateParent(
  root: Record<string, unknown>,
  segments: string[],
): Record<string, unknown> {
  let current = root;
  for (const segment of segments) {
    const next = current[segment];
    if (!isRecord(next)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  return current;
}
