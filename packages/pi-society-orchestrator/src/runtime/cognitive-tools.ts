import {
  type BoundaryFailure,
  type BoundaryResult,
  escapeSqlLiteral,
  isBoundaryFailure,
  queryDoltJson,
} from "./boundaries.ts";

export interface CognitiveTool {
  name: string;
  type: "cognitive" | "task";
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

export function getCognitiveToolByName(
  vaultDir: string,
  name: string,
): BoundaryResult<CognitiveTool | null> {
  const safeName = escapeSqlLiteral(name);
  const result = queryDoltJson(
    vaultDir,
    `SELECT name, artifact_kind, description, content FROM prompt_templates WHERE name = '${safeName}' AND status = 'active'`,
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
      type: String(row.artifact_kind || "procedure") === "cognitive" ? "cognitive" : "task",
      description: String(row.description || ""),
      content: String(row.content || ""),
    },
  };
}

export function listCognitiveTools(vaultDir: string): BoundaryResult<CognitiveTool[]> {
  const result = queryDoltJson(
    vaultDir,
    "SELECT name, artifact_kind, description FROM prompt_templates WHERE artifact_kind = 'cognitive' AND status = 'active' ORDER BY name",
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
