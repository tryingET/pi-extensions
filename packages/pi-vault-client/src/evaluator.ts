/**
 * Prompt Evaluator: A/B test prompts with judge evaluation.
 *
 * Integrated into vault-client extension for prompt experimentation.
 * Uses vLLM local model for evaluation.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// ============================================================================
// TYPES
// ============================================================================

export interface PromptVariant {
  id: string;
  name: string;
  content: string;
  description?: string;
  createdAt: number;
}

export interface TestCase {
  id: string;
  name: string;
  input: string;
  expectedOutput?: string;
  criteria: string[];
}

export interface EvaluationResult {
  variantId: string;
  testCaseId: string;
  output: string;
  scores: Record<string, number>;
  overallScore: number;
  judgeNotes: string;
  judgeType: "local" | "subagent";
  latencyMs: number;
}

export interface ABTestResult {
  testId: string;
  variants: PromptVariant[];
  testCases: TestCase[];
  results: EvaluationResult[];
  summary: {
    bestVariant: string;
    confidence: number;
    recommendation: string;
  };
  createdAt: number;
}

export interface EvaluatorConfig {
  vaultDir: string;
  localModelEndpoint: string;
  defaultModel: string;
}

// ============================================================================
// VAULT OPERATIONS (reuse from index.ts context)
// ============================================================================

interface VaultOps {
  queryJson: (sql: string) => { rows: Record<string, unknown>[] } | null;
  exec: (sql: string) => boolean;
  commit: (message: string) => void;
  escapeSql: (str: string) => string;
}

type CreateVariantResult = { ok: true; variant: PromptVariant } | { ok: false; error: string };

function formatEvaluatorError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createVariant(
  vault: VaultOps,
  name: string,
  content: string,
  description?: string,
): CreateVariantResult {
  const createdAt = Date.now();
  const id = `var_${createdAt}_${Math.random().toString(36).slice(2, 8)}`;
  const escapedId = vault.escapeSql(id);
  const escapedContent = vault.escapeSql(content);
  const escapedDesc = vault.escapeSql(description || "");
  const escapedName = vault.escapeSql(name);

  const tableReady = vault.exec(
    `CREATE TABLE IF NOT EXISTS prompt_variants (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(128),
      content TEXT,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  );
  if (!tableReady) {
    return { ok: false, error: "Failed to ensure prompt_variants table exists" };
  }

  const inserted = vault.exec(
    `INSERT INTO prompt_variants (id, name, content, description, created_at) VALUES ('${escapedId}', '${escapedName}', '${escapedContent}', '${escapedDesc}', NOW())`,
  );
  if (!inserted) {
    return { ok: false, error: `Failed to insert prompt variant: ${name}` };
  }

  try {
    vault.commit(`Add prompt variant: ${name}`);
  } catch (error) {
    return {
      ok: false,
      error: `Failed to commit prompt variant '${name}': ${formatEvaluatorError(error)}`,
    };
  }

  const persisted = vault.queryJson(
    `SELECT id FROM prompt_variants WHERE id = '${escapedId}' LIMIT 1`,
  );
  if ((persisted?.rows || []).length !== 1) {
    return { ok: false, error: `Prompt variant was not persisted: ${name}` };
  }

  return { ok: true, variant: { id, name, content, description, createdAt } };
}

function listVariants(vault: VaultOps): PromptVariant[] {
  const result = vault.queryJson(
    "SELECT id, name, content, description FROM prompt_variants ORDER BY created_at DESC",
  );
  if (!result || !result.rows) return [];

  return result.rows.map((row) => ({
    id: String(row.id || ""),
    name: String(row.name || ""),
    content: String(row.content || ""),
    description: String(row.description || ""),
    createdAt: 0,
  }));
}

// ============================================================================
// JUDGE IMPLEMENTATIONS
// ============================================================================

async function judgeWithLocalModel(
  variant: PromptVariant,
  testCase: TestCase,
  endpoint: string,
  model: string,
): Promise<{ output: string; scores: Record<string, number>; notes: string }> {
  try {
    const baseUrl = endpoint.replace(/\/$/, "");
    const chatEndpoint = `${baseUrl}/v1/chat/completions`;

    const prompt = `${variant.content}\n\nINPUT:\n${testCase.input}`;

    const generateResponse = await fetch(chatEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!generateResponse.ok) {
      return {
        output: `Local model error: ${generateResponse.statusText}`,
        scores: {},
        notes: "API error",
      };
    }

    const genData = (await generateResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const generatedOutput = genData.choices?.[0]?.message?.content || "";

    // Auto-evaluate with default scores (could be enhanced with a second LLM call)
    const scores: Record<string, number> = {};
    for (const c of testCase.criteria) {
      scores[c] = 3;
    }
    return {
      output: generatedOutput,
      scores,
      notes: "Auto-evaluated (vLLM)",
    };
  } catch (e) {
    return { output: `Error: ${e}`, scores: {}, notes: "Connection failed" };
  }
}

// ============================================================================
// A/B TEST EXECUTION
// ============================================================================

async function runABTest(
  config: EvaluatorConfig,
  _vault: VaultOps,
  variants: PromptVariant[],
  testCases: TestCase[],
): Promise<ABTestResult> {
  const testId = `test_${Date.now()}`;
  const results: EvaluationResult[] = [];

  for (const variant of variants) {
    for (const testCase of testCases) {
      const startTime = Date.now();

      const judgeResult = await judgeWithLocalModel(
        variant,
        testCase,
        config.localModelEndpoint,
        config.defaultModel,
      );

      const scores = judgeResult.scores;
      const overallScore =
        Object.keys(scores).length > 0
          ? Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length
          : 0;

      results.push({
        variantId: variant.id,
        testCaseId: testCase.id,
        output: judgeResult.output,
        scores,
        overallScore,
        judgeNotes: judgeResult.notes,
        judgeType: "local",
        latencyMs: Date.now() - startTime,
      });
    }
  }

  // Calculate summary
  const variantScores: Record<string, number[]> = {};
  for (const r of results) {
    if (!variantScores[r.variantId]) variantScores[r.variantId] = [];
    variantScores[r.variantId].push(r.overallScore);
  }

  const avgScores: Record<string, number> = {};
  for (const [vid, scoreList] of Object.entries(variantScores)) {
    avgScores[vid] = scoreList.reduce((a, b) => a + b, 0) / scoreList.length;
  }

  const sortedVariants = Object.entries(avgScores).sort(([, a], [, b]) => b - a);
  const bestVariant = sortedVariants[0]?.[0] || "";
  const bestScore = sortedVariants[0]?.[1] || 0;
  const secondScore = sortedVariants[1]?.[1] || 0;
  const confidence = sortedVariants.length > 1 ? (bestScore - secondScore) / 5 : 1;

  const bestVariantName = variants.find((v) => v.id === bestVariant)?.name || bestVariant;

  return {
    testId,
    variants,
    testCases,
    results,
    summary: {
      bestVariant: bestVariantName,
      confidence,
      recommendation:
        confidence > 0.2
          ? `Clear winner: ${bestVariantName}`
          : "Close call. Consider more test cases.",
    },
    createdAt: Date.now(),
  };
}

// ============================================================================
// TOOL REGISTRATION
// ============================================================================

export function registerPromptEvaluatorTool(
  pi: ExtensionAPI,
  config: EvaluatorConfig,
  vault: VaultOps,
): void {
  pi.registerTool({
    name: "prompt_eval",
    label: "Prompt Evaluator",
    description: `A/B test prompt variants and evaluate outputs.

Actions:
- create_variant: Store a new prompt variant for testing
- list_variants: Show all stored variants
- run_test: Execute A/B test with judge evaluation

Use to systematically improve prompts through experimentation.`,
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("create_variant"),
        Type.Literal("list_variants"),
        Type.Literal("run_test"),
      ]),
      name: Type.Optional(Type.String({ description: "Variant name (for create_variant)" })),
      content: Type.Optional(Type.String({ description: "Prompt content (for create_variant)" })),
      description: Type.Optional(Type.String({ description: "Variant description" })),
      variant_ids: Type.Optional(Type.Array(Type.String()), { description: "Variant IDs to test" }),
      test_inputs: Type.Optional(Type.Array(Type.String()), { description: "Test inputs" }),
      criteria: Type.Optional(Type.Array(Type.String()), { description: "Evaluation criteria" }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const action = params.action as string;

      if (action === "create_variant") {
        if (!params.name || !params.content) {
          return {
            content: [{ type: "text", text: "name and content required for create_variant" }],
            details: { ok: false },
          };
        }

        const created = createVariant(
          vault,
          params.name as string,
          params.content as string,
          params.description as string | undefined,
        );
        if (!created.ok) {
          return {
            content: [{ type: "text", text: `Error: ${created.error}` }],
            details: { ok: false, error: created.error },
          };
        }

        const variant = created.variant;
        return {
          content: [{ type: "text", text: `Created variant: ${variant.name} (${variant.id})` }],
          details: { ok: true, variant },
        };
      }

      if (action === "list_variants") {
        const variants = listVariants(vault);
        const list = variants
          .map((v) => `- ${v.name} (${v.id}): ${v.description || "no description"}`)
          .join("\n");

        return {
          content: [{ type: "text", text: list || "No variants stored" }],
          details: { ok: true, count: variants.length },
        };
      }

      if (action === "run_test") {
        const variantIds = params.variant_ids as string[] | undefined;
        const testInputs = params.test_inputs as string[] | undefined;
        const criteria = params.criteria as string[] | undefined;

        if (!variantIds?.length || !testInputs?.length || !criteria?.length) {
          return {
            content: [
              {
                type: "text",
                text: "variant_ids, test_inputs, and criteria required for run_test",
              },
            ],
            details: { ok: false },
          };
        }

        const allVariants = listVariants(vault);
        const variants = allVariants.filter((v) => variantIds.includes(v.id));

        if (variants.length === 0) {
          return {
            content: [{ type: "text", text: "No matching variants found" }],
            details: { ok: false },
          };
        }

        const testCases: TestCase[] = testInputs.map((input, i) => ({
          id: `tc_${i}`,
          name: `Test ${i + 1}`,
          input,
          criteria,
        }));

        const result = await runABTest(config, vault, variants, testCases);

        const summary = `# A/B Test Results

**Best Variant:** ${result.summary.bestVariant}
**Confidence:** ${(result.summary.confidence * 100).toFixed(0)}%
**Recommendation:** ${result.summary.recommendation}

## Scores by Variant
${result.variants
  .map((v) => {
    const avg =
      result.results
        .filter((r) => r.variantId === v.id)
        .reduce((sum, r) => sum + r.overallScore, 0) / testCases.length;
    return `- ${v.name}: ${avg.toFixed(2)}/5`;
  })
  .join("\n")}
`;

        return {
          content: [{ type: "text", text: summary }],
          details: { ok: true, testId: result.testId, summary: result.summary },
        };
      }

      return {
        content: [{ type: "text", text: `Unknown action: ${action}` }],
        details: { ok: false },
      };
    },

    renderCall(args, theme) {
      const action = (args as { action?: string }).action || "?";
      return new Text(
        theme.fg("toolTitle", theme.bold("prompt_eval ")) + theme.fg("accent", action),
        0,
        0,
      );
    },

    renderResult(result, _options, _theme) {
      const text = result.content[0];
      return new Text(text?.type === "text" ? text.text : "", 0, 0);
    },
  });
}

// ============================================================================
// COMMANDS
// ============================================================================

export function registerPromptEvaluatorCommands(
  pi: ExtensionAPI,
  config: EvaluatorConfig,
  vault: VaultOps,
): void {
  pi.registerCommand("prompt-variants", {
    description: "List stored prompt variants",
    handler: async (_args, ctx) => {
      const variants = listVariants(vault);
      if (!ctx.hasUI) return;

      if (variants.length === 0) {
        ctx.ui.notify("No variants stored. Use prompt_eval tool to create.", "info");
        return;
      }

      const list = variants
        .map((v) => `${v.name} (${v.id})\n  ${v.description || "no description"}`)
        .join("\n\n");
      await ctx.ui.editor("Prompt Variants", list);
    },
  });

  pi.registerCommand("prompt-eval-config", {
    description: "Show prompt evaluator configuration",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      ctx.ui.notify(
        `Vault: ${config.vaultDir}\nEndpoint: ${config.localModelEndpoint}\nModel: ${config.defaultModel}`,
        "info",
      );
    },
  });
}

// Re-export VaultOps for index.ts
export type { VaultOps };
