import { resolveMutationActorContext } from "./vaultMutations.js";
import { receiptTrustedForAuthorization } from "./vaultReceipts.js";
import type {
  DoltJsonResult,
  VaultExecutionLogOptions,
  VaultMutationContext,
  VaultResult,
} from "./vaultTypes.js";

export interface FeedbackMutationDependencies {
  queryVaultJson: (sql: string) => DoltJsonResult | null;
  queryVaultJsonDetailed: (sql: string) => VaultResult<DoltJsonResult>;
  execVaultWithRowCount: (sql: string) => number | null;
  commitVault: (message: string, tables?: string[]) => void;
  escapeSql: (str: string) => string;
  buildVisibilityPredicate: (company?: string, alias?: string) => string;
}

function validateRateTemplateInput(executionId: number, rating: number): string | null {
  if (!Number.isFinite(executionId) || executionId < 1) {
    return "execution_id must be a positive integer.";
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return "rating must be between 1 and 5.";
  }
  return null;
}

export function rateTemplate(
  executionId: number,
  rating: number,
  success: boolean,
  notes: string,
  context: VaultMutationContext | undefined,
  options: VaultExecutionLogOptions | undefined,
  dependencies: FeedbackMutationDependencies,
): { ok: boolean; message: string } {
  const actorContext = resolveMutationActorContext(context);
  if (actorContext.status === "error") {
    return { ok: false, message: actorContext.message };
  }

  const inputError = validateRateTemplateInput(executionId, rating);
  if (inputError) return { ok: false, message: inputError };

  const normalizedExecutionId = Math.floor(executionId);
  const executionRow = dependencies.queryVaultJson(`
    SELECT id, entity_id, entity_version
    FROM executions
    WHERE id = ${normalizedExecutionId}
      AND entity_type = 'template'
    LIMIT 1
  `)?.rows?.[0];
  if (!executionRow) {
    return {
      ok: false,
      message: `Template execution not found: ${normalizedExecutionId}`,
    };
  }

  const receipt = options?.executionReceipt ?? null;
  const trustedReceipt = receiptTrustedForAuthorization(receipt);
  let templateName = "template";
  if (receipt) {
    if (Number(receipt.execution_id) !== normalizedExecutionId) {
      return {
        ok: false,
        message: `Execution receipt mismatch for execution ${normalizedExecutionId}`,
      };
    }
    if (
      Number.isFinite(Number(receipt.template.id)) &&
      Number(receipt.template.id) !== Number(executionRow.entity_id)
    ) {
      return {
        ok: false,
        message: `Execution receipt template mismatch for execution ${normalizedExecutionId}`,
      };
    }
    if (
      Number.isFinite(Number(receipt.template.version)) &&
      Number.isFinite(Number(executionRow.entity_version)) &&
      Number(receipt.template.version) !== Number(executionRow.entity_version)
    ) {
      return {
        ok: false,
        message: `Execution receipt version mismatch for execution ${normalizedExecutionId}`,
      };
    }
  }

  if (receipt && trustedReceipt) {
    if (!receipt.template.visibility_companies.includes(actorContext.actorCompany)) {
      return {
        ok: false,
        message: `Template execution not visible to ${actorContext.actorCompany}: ${normalizedExecutionId}`,
      };
    }
    templateName = receipt.template.name || "template";
  } else {
    const execution = dependencies.queryVaultJson(`
      SELECT e.id, pt.name
      FROM executions e
      INNER JOIN prompt_templates pt ON pt.id = e.entity_id
      WHERE e.id = ${normalizedExecutionId}
        AND e.entity_type = 'template'
        AND pt.status = 'active'
        AND ${dependencies.buildVisibilityPredicate(actorContext.actorCompany)}
      LIMIT 1
    `)?.rows?.[0];
    if (!execution) {
      return {
        ok: false,
        message: `Template execution not found or not visible: ${normalizedExecutionId}`,
      };
    }
    templateName = String(execution.name || "template");
  }

  const existingFeedback = dependencies.queryVaultJsonDetailed(`
    SELECT id FROM feedback WHERE execution_id = ${normalizedExecutionId} LIMIT 1
  `);
  if (!existingFeedback.ok) {
    return {
      ok: false,
      message: `Failed to inspect existing feedback: ${existingFeedback.error}`,
    };
  }
  if ((existingFeedback.value.rows || []).length > 0) {
    return {
      ok: false,
      message: `Feedback already exists for execution ${normalizedExecutionId}. Use a future feedback-update path instead of creating duplicates.`,
    };
  }

  const escapedNotes = dependencies.escapeSql(notes);
  const issuesJson = dependencies.escapeSql(
    JSON.stringify(success ? [] : ["needs-improvement", `execution:${normalizedExecutionId}`]),
  );
  const insertedRows = dependencies.execVaultWithRowCount(`
    INSERT INTO feedback (execution_id, rating, notes, issues)
    SELECT ${normalizedExecutionId}, ${rating}, '${escapedNotes}', '${issuesJson}'
    FROM DUAL
    WHERE NOT EXISTS (
      SELECT 1 FROM feedback WHERE execution_id = ${normalizedExecutionId}
    )
  `);
  if (insertedRows == null) return { ok: false, message: "Failed to record feedback" };
  if (insertedRows !== 1) {
    return {
      ok: false,
      message: `Feedback for execution ${normalizedExecutionId} was not recorded because a duplicate already exists or the execution changed concurrently.`,
    };
  }

  const executionVersion = Number.isFinite(Number(executionRow.entity_version))
    ? ` v${Number(executionRow.entity_version)}`
    : "";
  dependencies.commitVault(`Rate execution: ${normalizedExecutionId} (${rating}/5)`, ["feedback"]);
  return {
    ok: true,
    message: `Recorded rating ${rating}/5 for execution ${normalizedExecutionId} (${templateName}${executionVersion})`,
  };
}
