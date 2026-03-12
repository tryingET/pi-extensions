import {
  type BoundaryFailure,
  type BoundaryResult,
  escapeSqlLiteral,
  isBoundaryFailure,
  queryDoltJsonAsync,
} from "./boundaries.ts";

export interface CognitiveTool {
  name: string;
  type: "cognitive";
  description: string;
  content: string;
}

function propagateFailure<T>(result: BoundaryFailure): BoundaryResult<T> {
  return {
    ok: false,
    error: result.error,
    exitCode: result.exitCode,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

export async function getCognitiveToolByName(
  vaultDir: string,
  name: string,
  signal?: AbortSignal,
): Promise<BoundaryResult<CognitiveTool | null>> {
  const safeName = escapeSqlLiteral(name);
  const result = await queryDoltJsonAsync(
    vaultDir,
    `SELECT name, artifact_kind, description, content FROM prompt_templates WHERE name = '${safeName}' AND artifact_kind = 'cognitive' AND status = 'active'`,
    signal,
  );
  if (isBoundaryFailure(result)) {
    return propagateFailure(result);
  }

  if (result.value.rows.length === 0) {
    return { ok: true, value: null };
  }

  const row = result.value.rows[0];
  return {
    ok: true,
    value: {
      name: String(row.name || ""),
      type: "cognitive",
      description: String(row.description || ""),
      content: String(row.content || ""),
    },
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
