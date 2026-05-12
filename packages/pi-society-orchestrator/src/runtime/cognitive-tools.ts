import { type BoundaryResult, isBoundaryFailure } from "./boundaries.ts";

export interface CognitiveTool {
  name: string;
  type: "cognitive";
  description: string;
  content: string;
}

export interface CognitiveToolLookupContext {
  cwd?: string;
  currentCompany?: string;
}

interface PreparedPromptPlaneCandidate {
  ok: boolean;
  status: "ready" | "ambiguous" | "blocked";
  template?: {
    name: string;
    artifact_kind: string;
  };
  prepared_text?: string;
  blocking_reason?: string;
}

interface VisiblePromptPlaneTemplate {
  name: string;
  description: string;
  artifact_kind: string;
}

interface ListedPromptPlaneTemplatesResult {
  ok: boolean;
  status: "ready" | "blocked";
  templates?: VisiblePromptPlaneTemplate[];
  blocking_reason?: string;
}

interface VaultPromptPlaneRuntime {
  prepareSelection(
    request: { query: string; context?: string },
    ctx?: CognitiveToolLookupContext,
  ): Promise<PreparedPromptPlaneCandidate>;
  listVisibleTemplates(
    request?: { filters?: { artifact_kind?: string[] }; limit?: number },
    ctx?: CognitiveToolLookupContext,
  ): Promise<ListedPromptPlaneTemplatesResult>;
}

async function getPromptPlaneRuntime(): Promise<BoundaryResult<VaultPromptPlaneRuntime>> {
  try {
    const module = await import("@tryinget/pi-vault-client/prompt-plane");
    return {
      ok: true,
      value: module.createVaultPromptPlaneRuntime(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isMissingVisibleTemplate(candidate: PreparedPromptPlaneCandidate): boolean {
  return (
    candidate.status === "blocked" &&
    typeof candidate.blocking_reason === "string" &&
    /^No visible template matched "/.test(candidate.blocking_reason)
  );
}

function isCognitiveTemplate(candidate: PreparedPromptPlaneCandidate): boolean {
  return candidate.template?.artifact_kind === "cognitive";
}

export async function getCognitiveToolByName(
  name: string,
  context: CognitiveToolLookupContext = {},
  signal?: AbortSignal,
): Promise<BoundaryResult<CognitiveTool | null>> {
  signal?.throwIfAborted();

  const runtime = await getPromptPlaneRuntime();
  if (isBoundaryFailure(runtime)) {
    return runtime;
  }

  let prepared: PreparedPromptPlaneCandidate;
  try {
    prepared = await runtime.value.prepareSelection({ query: name }, context);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (prepared.ok && isCognitiveTemplate(prepared)) {
    return {
      ok: true,
      value: {
        name: prepared.template?.name || name,
        type: "cognitive",
        description: "",
        content: prepared.prepared_text || "",
      },
    };
  }

  if (prepared.ok) {
    return { ok: true, value: null };
  }

  if (prepared.status === "ambiguous") {
    return {
      ok: false,
      error: prepared.blocking_reason || `Multiple visible templates matched "${name}".`,
    };
  }

  if (isMissingVisibleTemplate(prepared)) {
    return { ok: true, value: null };
  }

  return {
    ok: false,
    error: prepared.blocking_reason || `Failed to prepare cognitive tool "${name}".`,
  };
}

export async function listCognitiveTools(
  context: CognitiveToolLookupContext = {},
  signal?: AbortSignal,
): Promise<BoundaryResult<CognitiveTool[]>> {
  signal?.throwIfAborted();

  const runtime = await getPromptPlaneRuntime();
  if (isBoundaryFailure(runtime)) {
    return runtime;
  }

  let listed: ListedPromptPlaneTemplatesResult;
  try {
    listed = await runtime.value.listVisibleTemplates(
      { filters: { artifact_kind: ["cognitive"] }, limit: 50 },
      context,
    );
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (!listed.ok) {
    return {
      ok: false,
      error: listed.blocking_reason || "Failed to list visible cognitive tools.",
    };
  }

  return {
    ok: true,
    value: (listed.templates || []).map((template) => ({
      name: template.name,
      type: "cognitive" as const,
      description: template.description,
      content: "",
    })),
  };
}
