import path from "node:path";
import { ensureStringArray, parseFrontmatterDocument } from "../adapters/frontmatter.ts";
import type { FilesPort } from "../ports/files-port.ts";
import type { RocsPort } from "../ports/rocs-port.ts";
import type { WorkspacePort } from "../ports/workspace-port.ts";
import type {
  OntologyInspectRequest,
  OntologyInspectResult,
  OntologySearchHit,
} from "./contracts.ts";

interface InspectDeps {
  files: FilesPort;
  rocs: RocsPort;
  workspace: WorkspacePort;
}

interface LayerArtifact {
  name?: string;
  src_root?: string;
}

interface ResolveArtifact {
  layers?: LayerArtifact[];
}

interface IdIndexItem {
  id?: string;
  kind?: string;
  labels?: string[];
  layer?: string;
  path_in_layer?: string;
}

interface IdIndexArtifact {
  items?: IdIndexItem[];
}

interface SearchDoc {
  ontId: string;
  kind: string;
  layer: string;
  labels: string[];
  path: string;
  title: string;
  definition: string;
}

export async function inspectOntology(
  request: OntologyInspectRequest,
  runtime: { cwd: string },
  deps: InspectDeps,
): Promise<OntologyInspectResult> {
  const target = await deps.workspace.resolveTarget({
    cwd: runtime.cwd,
    scope: request.scope,
    targetRepo: request.targetRepo,
    targetId: request.ontId,
  });

  const rocsContext = {
    workspaceRoot: target.workspaceRoot,
    workspaceRefMode: target.workspaceRefMode,
    resolveRefs: true,
  } as const;

  if (request.kind === "status") {
    const summary = await deps.rocs.summary(target.repoPath, rocsContext);
    const includeValidation = request.includeValidation !== false;
    const validation = includeValidation
      ? await deps.rocs.validate(target.repoPath, rocsContext)
      : undefined;
    return {
      target,
      status: {
        layers: summary.layers.map((layer) => ({
          name: layer.name,
          origin: layer.origin,
          kind: layer.kind,
          source: layer.source,
        })),
        counts: summary.counts,
        validation: validation
          ? {
              ok: validation.ok,
              findings: validation.findings,
            }
          : undefined,
      },
      warnings: validation && !validation.ok ? ["ontology validation failed"] : [],
    };
  }

  if (request.kind === "pack") {
    const ontId = request.ontId?.trim();
    if (!ontId) throw new Error("kind=pack requires ontId");
    const pack = await deps.rocs.pack(target.repoPath, ontId, rocsContext, {
      depth: request.depth,
      maxDocs: request.maxDocs,
    });
    return {
      target,
      pack: {
        ontId,
        text: pack.text,
      },
      warnings: [],
    };
  }

  const query = request.query?.trim() ?? "";
  const build = await deps.rocs.build(target.repoPath, rocsContext);
  const resolvePath = build.dist.files.resolve;
  const idIndexPath = build.dist.files.id_index;
  if (!resolvePath || !idIndexPath) {
    throw new Error("rocs build did not return resolve/id_index artifacts");
  }

  const docs = await loadSearchCatalog(resolvePath, idIndexPath, deps.files);
  const hits = query ? rankSearchDocs(docs, query) : defaultSearchDocs(docs);
  return {
    target,
    search: {
      query,
      hits,
    },
    warnings: hits.length === 0 ? ["no ontology search hits"] : [],
  };
}

async function loadSearchCatalog(
  resolvePath: string,
  idIndexPath: string,
  files: FilesPort,
): Promise<SearchDoc[]> {
  const resolveArtifact = await files.readJson<ResolveArtifact>(resolvePath);
  const idIndex = await files.readJson<IdIndexArtifact>(idIndexPath);
  const layerRoots = new Map<string, string>();
  for (const layer of resolveArtifact.layers ?? []) {
    if (layer.name && layer.src_root) {
      layerRoots.set(layer.name, layer.src_root);
    }
  }

  const docs: SearchDoc[] = [];
  for (const item of idIndex.items ?? []) {
    if (!item.id || !item.kind || !item.layer || !item.path_in_layer) continue;
    const layerRoot = layerRoots.get(item.layer);
    if (!layerRoot) continue;
    const filePath = path.resolve(layerRoot, item.path_in_layer);
    const raw = await files.readText(filePath);
    const parsed = parseFrontmatterDocument(raw);
    const body = parsed.body;
    docs.push({
      ontId: item.id,
      kind: item.kind,
      layer: item.layer,
      labels: ensureStringArray(item.labels),
      path: filePath,
      title: extractTitle(body),
      definition: extractDefinition(body),
    });
  }

  return docs;
}

function rankSearchDocs(docs: SearchDoc[], query: string): OntologySearchHit[] {
  const lowered = query.toLowerCase();
  return docs
    .map((doc) => ({
      ...doc,
      score: scoreDoc(doc, lowered),
    }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.ontId.localeCompare(b.ontId))
    .slice(0, 12)
    .map((doc) => ({
      ontId: doc.ontId,
      kind: doc.kind,
      layer: doc.layer,
      labels: doc.labels,
      title: doc.title,
      definition: doc.definition,
      path: doc.path,
      score: doc.score,
    }));
}

function defaultSearchDocs(docs: SearchDoc[]): OntologySearchHit[] {
  return docs
    .slice()
    .sort((a, b) => a.ontId.localeCompare(b.ontId))
    .slice(0, 12)
    .map((doc) => ({
      ontId: doc.ontId,
      kind: doc.kind,
      layer: doc.layer,
      labels: doc.labels,
      title: doc.title,
      definition: doc.definition,
      path: doc.path,
      score: 1,
    }));
}

function scoreDoc(doc: SearchDoc, lowered: string): number {
  let score = 0;
  if (doc.ontId.toLowerCase() === lowered) score = Math.max(score, 100);
  if (doc.labels.some((label) => label.toLowerCase() === lowered)) score = Math.max(score, 95);
  if (doc.title.toLowerCase() === lowered) score = Math.max(score, 90);
  if (doc.ontId.toLowerCase().includes(lowered)) score = Math.max(score, 80);
  if (doc.labels.some((label) => label.toLowerCase().includes(lowered)))
    score = Math.max(score, 70);
  if (doc.title.toLowerCase().includes(lowered)) score = Math.max(score, 65);
  if (doc.definition.toLowerCase().includes(lowered)) score = Math.max(score, 55);
  return score;
}

function extractTitle(body: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function extractDefinition(body: string): string {
  const match = body.match(/^##\s+Definition\s*\n([\s\S]*?)(?=^##\s+|$)/m);
  if (match) return match[1].trim();
  const paragraph = body.trim().split(/\n\s*\n/)[0] ?? "";
  return paragraph.trim();
}
