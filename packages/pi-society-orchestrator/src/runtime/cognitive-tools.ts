import {
  type BoundaryFailure,
  type BoundaryResult,
  isBoundaryFailure,
  queryDoltJsonAsync,
} from "./boundaries.ts";

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

interface VaultPromptPlaneRuntime {
  prepareSelection(
    request: { query: string; context?: string },
    ctx?: CognitiveToolLookupContext,
  ): Promise<PreparedPromptPlaneCandidate>;
}

let promptPlaneRuntimePromise: Promise<VaultPromptPlaneRuntime> | null = null;

function propagateFailure<T>(result: BoundaryFailure): BoundaryResult<T> {
  return {
    ok: false,
    error: result.error,
    exitCode: result.exitCode,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

async function getPromptPlaneRuntime(): Promise<BoundaryResult<VaultPromptPlaneRuntime>> {
  try {
    promptPlaneRuntimePromise ??= import("pi-vault-client/prompt-plane").then((module) =>
      module.createVaultPromptPlaneRuntime(),
    );
    return {
      ok: true,
      value: await promptPlaneRuntimePromise,
    };
  } catch (error) {
    promptPlaneRuntimePromise = null;
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
  vaultDir: string,
  signal?: AbortSignal,
): Promise<BoundaryResult<CognitiveTool[]>> {
  const result = await queryDoltJsonAsync(
    vaultDir,
    "SELECT name, artifact_kind, description FROM prompt_templates WHERE artifact_kind = 'cognitive' AND status = 'active' ORDER BY name",
    signal,
  );
  if (isBoundaryFailure(result)) {
    return propagateFailure(result);
  }

  return {
    ok: true,
    value: result.value.rows.map((row) => ({
      name: String(row.name || ""),
      type: "cognitive" as const,
      description: String(row.description || ""),
      content: "",
    })),
  };
}
