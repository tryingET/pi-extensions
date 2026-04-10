/**
 * Prompt Evaluator: A/B test prompts with judge evaluation.
 *
 * Integrated into vault-client extension for prompt experimentation.
 * Uses vLLM local model for generation + judging.
 * Stores prompt variants locally per company under package-owned state
 * instead of mutating shared Prompt Vault tables.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { resolveCompanyContext } from "./companyContext.js";
const PROMPT_EVAL_CONTEXT_ERROR = "Explicit company context is required for prompt_eval variants. Set PI_COMPANY or invoke the tool from a company-scoped cwd.";
function formatEvaluatorError(error) {
    return error instanceof Error ? error.message : String(error);
}
function getPromptVariantStorePath() {
    const explicitFile = process.env.PI_VAULT_PROMPT_EVAL_VARIANTS_FILE?.trim();
    if (explicitFile)
        return path.resolve(explicitFile);
    const explicitDir = process.env.PI_VAULT_PROMPT_EVAL_DIR?.trim();
    const rootDir = explicitDir
        ? path.resolve(explicitDir)
        : path.join(homedir(), ".pi", "agent", "state", "pi-vault-client");
    return path.join(rootDir, "prompt-eval-variants.jsonl");
}
function ensurePromptVariantStoreDir(filePath) {
    mkdirSync(path.dirname(filePath), { recursive: true });
}
function normalizeStoredPromptVariant(value) {
    if (!value || typeof value !== "object")
        return null;
    const candidate = value;
    if (candidate.schema_version !== 1)
        return null;
    if (candidate.record_kind !== "prompt_eval_variant")
        return null;
    if (typeof candidate.id !== "string" || !candidate.id.trim())
        return null;
    if (typeof candidate.name !== "string" || !candidate.name.trim())
        return null;
    if (typeof candidate.content !== "string")
        return null;
    if (typeof candidate.description !== "string")
        return null;
    if (typeof candidate.company !== "string" || !candidate.company.trim())
        return null;
    if (typeof candidate.created_at !== "string")
        return null;
    return {
        schema_version: 1,
        record_kind: "prompt_eval_variant",
        id: candidate.id.trim(),
        name: candidate.name.trim(),
        content: candidate.content,
        description: candidate.description,
        company: candidate.company.trim(),
        created_at: candidate.created_at,
    };
}
function sortStoredVariantsNewestFirst(left, right) {
    return Date.parse(right.created_at) - Date.parse(left.created_at);
}
function readStoredPromptVariants(filePath = getPromptVariantStorePath()) {
    if (!existsSync(filePath))
        return [];
    try {
        const raw = readFileSync(filePath, "utf8");
        return raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
            try {
                return normalizeStoredPromptVariant(JSON.parse(line));
            }
            catch {
                return null;
            }
        })
            .filter((record) => Boolean(record))
            .sort(sortStoredVariantsNewestFirst);
    }
    catch {
        return [];
    }
}
function toPromptVariant(record) {
    return {
        id: record.id,
        name: record.name,
        content: record.content,
        description: record.description || "",
        createdAt: Date.parse(record.created_at) || 0,
    };
}
function listVariantsForCompany(company, filePath = getPromptVariantStorePath()) {
    const deduped = new Map();
    for (const record of readStoredPromptVariants(filePath)) {
        if (record.company !== company)
            continue;
        if (!deduped.has(record.id))
            deduped.set(record.id, record);
    }
    return [...deduped.values()].map(toPromptVariant);
}
function createVariant(name, content, company, description, filePath = getPromptVariantStorePath()) {
    const normalizedName = String(name || "").trim();
    const normalizedContent = String(content || "");
    if (!normalizedName) {
        return { ok: false, error: "Variant name must be non-empty." };
    }
    if (!normalizedContent.trim()) {
        return { ok: false, error: "Variant content must be non-empty." };
    }
    const createdAt = Date.now();
    const variant = {
        id: `var_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
        name: normalizedName,
        content: normalizedContent,
        description: String(description || ""),
        createdAt,
    };
    const record = {
        schema_version: 1,
        record_kind: "prompt_eval_variant",
        id: variant.id,
        name: variant.name,
        content: variant.content,
        description: variant.description || "",
        company,
        created_at: new Date(createdAt).toISOString(),
    };
    try {
        ensurePromptVariantStoreDir(filePath);
        appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
    }
    catch (error) {
        return {
            ok: false,
            error: `Failed to persist local prompt variant '${variant.name}': ${formatEvaluatorError(error)}`,
        };
    }
    const persisted = listVariantsForCompany(company, filePath).find((candidate) => candidate.id === variant.id);
    if (!persisted) {
        return { ok: false, error: `Prompt variant was not persisted locally: ${variant.name}` };
    }
    return { ok: true, variant: persisted };
}
function normalizeEvaluatorCwd(ctx) {
    const cwd = ctx?.cwd;
    return typeof cwd === "string" && cwd.trim() ? cwd.trim() : undefined;
}
function resolvePromptEvaluatorCompanyContext(ctx, options) {
    const env = options?.env || process.env;
    if (env.PI_COMPANY?.trim()) {
        return { ok: true, company: env.PI_COMPANY.trim(), source: "env:PI_COMPANY" };
    }
    if (env.VAULT_CURRENT_COMPANY?.trim()) {
        return {
            ok: true,
            company: env.VAULT_CURRENT_COMPANY.trim(),
            source: "env:VAULT_CURRENT_COMPANY",
        };
    }
    const cwd = normalizeEvaluatorCwd(ctx) || options?.processCwd?.trim();
    if (!cwd) {
        return { ok: false, error: PROMPT_EVAL_CONTEXT_ERROR };
    }
    const resolved = resolveCompanyContext({
        cwd,
        env,
        processCwd: cwd,
        defaultCompany: "core",
    });
    if (resolved.source === "contract-default") {
        return { ok: false, error: PROMPT_EVAL_CONTEXT_ERROR };
    }
    return {
        ok: true,
        company: resolved.company,
        source: resolved.source,
        ...(normalizeEvaluatorCwd(ctx) ? { cwd: normalizeEvaluatorCwd(ctx) } : {}),
    };
}
function formatVariantList(variants) {
    return variants
        .map((variant) => `- ${variant.name} (${variant.id}): ${variant.description || "no description"}`)
        .join("\n");
}
// ============================================================================
// JUDGE IMPLEMENTATIONS
// ============================================================================
function extractChatCompletionText(value) {
    const data = value;
    return String(data?.choices?.[0]?.message?.content || "");
}
function normalizeCriterionKey(value) {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}
function clampScore(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric))
        return null;
    return Math.max(1, Math.min(5, Math.round(numeric)));
}
function extractJsonObject(text) {
    const source = String(text || "").trim();
    if (!source)
        return null;
    const fencedMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() || source;
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < candidate.length; index++) {
        const char = candidate[index];
        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === "\\") {
                escaped = true;
                continue;
            }
            if (char === '"')
                inString = false;
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === "{") {
            if (start === -1)
                start = index;
            depth += 1;
            continue;
        }
        if (char === "}") {
            if (start === -1)
                continue;
            depth -= 1;
            if (depth === 0)
                return candidate.slice(start, index + 1);
        }
    }
    return null;
}
function parseJudgeScores(raw, criteria) {
    const jsonText = extractJsonObject(raw);
    if (!jsonText)
        return null;
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object")
        return null;
    const record = parsed;
    const scoreRecord = record.scores && typeof record.scores === "object" && !Array.isArray(record.scores)
        ? record.scores
        : null;
    if (!scoreRecord)
        return null;
    const normalizedScoreEntries = new Map();
    for (const [key, value] of Object.entries(scoreRecord)) {
        const clamped = clampScore(value);
        if (clamped == null)
            continue;
        normalizedScoreEntries.set(normalizeCriterionKey(key), clamped);
    }
    const scores = {};
    for (const criterion of criteria) {
        const normalized = normalizeCriterionKey(criterion);
        const score = normalizedScoreEntries.get(normalized);
        if (score != null)
            scores[criterion] = score;
    }
    return {
        scores,
        notes: typeof record.notes === "string" ? record.notes.trim() : "",
    };
}
function truncateForJudgeNotes(value, max = 160) {
    const text = String(value || "")
        .replace(/\s+/g, " ")
        .trim();
    if (!text)
        return "";
    return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
function buildJudgePrompt(testCase, generatedOutput) {
    return [
        "You are a strict prompt-evaluation judge.",
        "Score the candidate output against each criterion from 1 to 5.",
        "Return ONLY valid JSON in this exact shape:",
        '{"scores":{"criterion":1},"notes":"brief rationale"}',
        "",
        `Test case: ${testCase.name}`,
        `Input: ${testCase.input}`,
        testCase.expectedOutput ? `Expected output: ${testCase.expectedOutput}` : "",
        `Criteria: ${testCase.criteria.join(", ")}`,
        "",
        "Candidate output:",
        generatedOutput,
    ]
        .filter(Boolean)
        .join("\n");
}
async function judgeWithLocalModel(variant, testCase, endpoint, model, fetchImpl) {
    try {
        const baseUrl = endpoint.replace(/\/$/, "");
        const chatEndpoint = `${baseUrl}/v1/chat/completions`;
        const prompt = `${variant.content}\n\nINPUT:\n${testCase.input}`;
        const generateResponse = await fetchImpl(chatEndpoint, {
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
                notes: "Generation API error",
            };
        }
        const generatedOutput = extractChatCompletionText(await generateResponse.json());
        const judgeResponse = await fetchImpl(chatEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: buildJudgePrompt(testCase, generatedOutput) }],
                max_tokens: 800,
                temperature: 0,
            }),
        });
        if (!judgeResponse.ok) {
            return {
                output: generatedOutput,
                scores: {},
                notes: `Judge API error: ${judgeResponse.statusText}`,
            };
        }
        const judgeText = extractChatCompletionText(await judgeResponse.json());
        const parsed = parseJudgeScores(judgeText, testCase.criteria);
        if (!parsed) {
            return {
                output: generatedOutput,
                scores: {},
                notes: `Judge response was not parseable JSON: ${truncateForJudgeNotes(judgeText) || "(empty)"}`,
            };
        }
        return {
            output: generatedOutput,
            scores: parsed.scores,
            notes: parsed.notes || "Judged by local model",
        };
    }
    catch (error) {
        return {
            output: `Error: ${formatEvaluatorError(error)}`,
            scores: {},
            notes: "Connection failed",
        };
    }
}
// ============================================================================
// A/B TEST EXECUTION
// ============================================================================
async function runABTest(config, variants, testCases) {
    const testId = `test_${Date.now()}`;
    const results = [];
    for (const variant of variants) {
        for (const testCase of testCases) {
            const startTime = Date.now();
            const judgeResult = await judgeWithLocalModel(variant, testCase, config.localModelEndpoint, config.defaultModel, config.fetchImpl || fetch);
            const scores = judgeResult.scores;
            const overallScore = Object.keys(scores).length > 0
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
    const variantScores = {};
    for (const result of results) {
        if (!variantScores[result.variantId])
            variantScores[result.variantId] = [];
        variantScores[result.variantId].push(result.overallScore);
    }
    const avgScores = {};
    for (const [variantId, scoreList] of Object.entries(variantScores)) {
        avgScores[variantId] = scoreList.reduce((sum, score) => sum + score, 0) / scoreList.length;
    }
    const sortedVariants = Object.entries(avgScores).sort(([, left], [, right]) => right - left);
    const bestVariant = sortedVariants[0]?.[0] || "";
    const bestScore = sortedVariants[0]?.[1] || 0;
    const secondScore = sortedVariants[1]?.[1] || 0;
    const confidence = sortedVariants.length > 1 ? Math.max(0, (bestScore - secondScore) / 5) : 1;
    const bestVariantName = variants.find((variant) => variant.id === bestVariant)?.name || bestVariant;
    return {
        testId,
        variants,
        testCases,
        results,
        summary: {
            bestVariant: bestVariantName,
            confidence,
            recommendation: confidence > 0.2
                ? `Clear winner: ${bestVariantName}`
                : "Close call. Consider more test cases.",
        },
        createdAt: Date.now(),
    };
}
// ============================================================================
// TOOL REGISTRATION
// ============================================================================
export function registerPromptEvaluatorTool(pi, config, _vault) {
    pi.registerTool({
        name: "prompt_eval",
        label: "Prompt Evaluator",
        description: `A/B test prompt variants and evaluate outputs.

Actions:
- create_variant: Store a new prompt variant for testing
- list_variants: Show all stored variants
- run_test: Execute A/B test with judge evaluation

Variants are stored locally per company under package-owned state rather than mutating shared Prompt Vault tables.
Use to systematically improve prompts through experimentation.`,
        promptSnippet: "A/B test prompt variants and compare them with judge-based evaluation.",
        promptGuidelines: [
            "Use prompt_eval when improving prompt wording or structure is the task itself.",
            "List variants before running tests if you are not sure which variant IDs exist.",
        ],
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
        async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            const action = params.action;
            const companyContext = resolvePromptEvaluatorCompanyContext(ctx);
            if (!companyContext.ok) {
                return {
                    content: [{ type: "text", text: companyContext.error }],
                    details: { ok: false, error: companyContext.error },
                };
            }
            const storePath = getPromptVariantStorePath();
            const currentCompany = companyContext.company;
            if (action === "create_variant") {
                const name = String(params.name || "").trim();
                const content = String(params.content || "");
                if (!name || !content.trim()) {
                    return {
                        content: [{ type: "text", text: "name and content required for create_variant" }],
                        details: { ok: false },
                    };
                }
                const created = createVariant(name, content, currentCompany, params.description, storePath);
                if (!created.ok) {
                    return {
                        content: [{ type: "text", text: `Error: ${created.error}` }],
                        details: { ok: false, error: created.error, currentCompany, storePath },
                    };
                }
                const variant = created.variant;
                return {
                    content: [{ type: "text", text: `Created variant: ${variant.name} (${variant.id})` }],
                    details: { ok: true, variant, currentCompany, storePath },
                };
            }
            if (action === "list_variants") {
                const variants = listVariantsForCompany(currentCompany, storePath);
                return {
                    content: [{ type: "text", text: formatVariantList(variants) || "No variants stored" }],
                    details: { ok: true, count: variants.length, currentCompany, storePath },
                };
            }
            if (action === "run_test") {
                const variantIds = params.variant_ids;
                const testInputs = params.test_inputs;
                const criteria = params.criteria;
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
                const allVariants = listVariantsForCompany(currentCompany, storePath);
                const variants = variantIds
                    .map((variantId) => allVariants.find((variant) => variant.id === variantId) || null)
                    .filter((variant) => Boolean(variant));
                if (variants.length === 0) {
                    return {
                        content: [{ type: "text", text: "No matching variants found" }],
                        details: { ok: false, currentCompany, storePath },
                    };
                }
                const testCases = testInputs.map((input, index) => ({
                    id: `tc_${index}`,
                    name: `Test ${index + 1}`,
                    input,
                    criteria,
                }));
                const result = await runABTest(config, variants, testCases);
                const summary = `# A/B Test Results

**Best Variant:** ${result.summary.bestVariant}
**Confidence:** ${(result.summary.confidence * 100).toFixed(0)}%
**Recommendation:** ${result.summary.recommendation}

## Scores by Variant
${result.variants
                    .map((variant) => {
                    const avg = result.results
                        .filter((entry) => entry.variantId === variant.id)
                        .reduce((sum, entry) => sum + entry.overallScore, 0) / testCases.length;
                    return `- ${variant.name}: ${avg.toFixed(2)}/5`;
                })
                    .join("\n")}
`;
                return {
                    content: [{ type: "text", text: summary }],
                    details: {
                        ok: true,
                        testId: result.testId,
                        summary: result.summary,
                        currentCompany,
                        storePath,
                    },
                };
            }
            return {
                content: [{ type: "text", text: `Unknown action: ${action}` }],
                details: { ok: false },
            };
        },
        renderCall(args, theme) {
            const action = args.action || "?";
            return new Text(theme.fg("toolTitle", theme.bold("prompt_eval ")) + theme.fg("accent", action), 0, 0);
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
export function registerPromptEvaluatorCommands(pi, config, _vault) {
    pi.registerCommand("prompt-variants", {
        description: "List stored prompt variants",
        handler: async (_args, ctx) => {
            if (!ctx.hasUI)
                return;
            const companyContext = resolvePromptEvaluatorCompanyContext(ctx);
            if (!companyContext.ok) {
                ctx.ui.notify(companyContext.error, "warning");
                return;
            }
            const variants = listVariantsForCompany(companyContext.company);
            if (variants.length === 0) {
                ctx.ui.notify("No variants stored. Use prompt_eval tool to create.", "info");
                return;
            }
            const list = variants
                .map((variant) => `${variant.name} (${variant.id})\n  ${variant.description || "no description"}`)
                .join("\n\n");
            await ctx.ui.editor(`Prompt Variants (${companyContext.company})`, list);
        },
    });
    pi.registerCommand("prompt-eval-config", {
        description: "Show prompt evaluator configuration",
        handler: async (_args, ctx) => {
            if (!ctx.hasUI)
                return;
            ctx.ui.notify(`Vault: ${config.vaultDir}\nEndpoint: ${config.localModelEndpoint}\nModel: ${config.defaultModel}\nVariant store: ${getPromptVariantStorePath()}`, "info");
        },
    });
}
