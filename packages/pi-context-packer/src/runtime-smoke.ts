/**
summary: "Exercise installed tool closures and check their artifact identity in a fresh Pi process."
read_when:
  - "Changing installed runtime smoke behavior."
*/
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

type ContextPackerToolResult = AgentToolResult<Record<string, unknown>>;
export type SmokeTool = {
  name: string;
  execute: (
    id: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    update?: unknown,
    ctx?: ExtensionContext,
  ) => Promise<ContextPackerToolResult>;
};
type SmokeDetails = {
  runtimeContract?: { registeredToolContract?: unknown };
  redaction?: { rawSeedsOmitted?: unknown };
  ok?: unknown;
  dogfoodObservationEvaluation?: { status?: unknown };
  dogfoodAggregateEvaluation?: { validReceiptCount?: unknown };
};

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const resultText = (result: ContextPackerToolResult | undefined) => {
  const firstContent = result?.content?.[0];
  return firstContent?.type === "text" ? firstContent.text : "";
};

const smokeDetails = (result: ContextPackerToolResult | undefined) =>
  result?.details as SmokeDetails | undefined;

const pathIsInsideOrEqual = (candidatePath: string, rootPath: string) => {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath));
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith(sep));
};

const runtimeSmokeContext = (workspace: string, ctx: ExtensionContext | undefined) =>
  ({
    cwd: workspace,
    getSystemPrompt: () => ctx?.getSystemPrompt?.() ?? "",
    getContextUsage: () => ctx?.getContextUsage?.() ?? { usedTokens: 0, maxTokens: 100000 },
    model: ctx?.model,
  }) as ExtensionContext;

export async function runRegisteredToolSmoke(
  pi: Pick<ExtensionAPI, "getAllTools" | "getCommands">,
  ctx: ExtensionContext | undefined,
  definitions: ReadonlyArray<SmokeTool>,
) {
  const CONTEXT_PACKER_TOOL_NAMES = definitions.map((tool) => tool.name);
  const contextPackerToolDefinition = (name: string) => {
    const definition = definitions.find((tool) => tool.name === name);
    assertSmoke(definition, `${name} tool definition missing`);
    return definition;
  };
  const registeredTools = new Map(pi.getAllTools().map((tool) => [tool.name, tool]));
  const commands = pi.getCommands();
  const expectedSourceRoot = process.env.INSTALLED_PACKAGE_ROOT;

  for (const name of CONTEXT_PACKER_TOOL_NAMES) {
    const registeredTool = registeredTools.get(name);
    assertSmoke(registeredTool, `${name} tool not registered`);
    assertSmoke(
      registeredTool.sourceInfo?.source !== "builtin" &&
        registeredTool.sourceInfo?.source !== "sdk",
      `${name} registered from unexpected source: ${registeredTool.sourceInfo?.source}`,
    );
    assertSmoke(registeredTool.description, `${name} missing description`);
    assertSmoke(registeredTool.parameters, `${name} missing parameters`);
    if (expectedSourceRoot) {
      assertSmoke(
        pathIsInsideOrEqual(String(registeredTool.sourceInfo?.path ?? ""), expectedSourceRoot),
        `${name} registered from ${registeredTool.sourceInfo?.path ?? "unknown"}, expected ${expectedSourceRoot}`,
      );
    }
  }

  for (const commandName of ["context-pack", "context-packer-release-smoke"]) {
    const command = commands.find((candidate) => candidate.name === commandName);
    assertSmoke(command, `${commandName} command not registered`);
    assertSmoke(
      command.source === "extension" || command.sourceInfo?.source === "extension",
      `${commandName} command registered from unexpected source: ${command.source}`,
    );
    if (expectedSourceRoot) {
      assertSmoke(
        pathIsInsideOrEqual(String(command.sourceInfo?.path ?? ""), expectedSourceRoot),
        `${commandName} command registered from ${command.sourceInfo?.path ?? "unknown"}, expected ${expectedSourceRoot}`,
      );
    }
  }

  const workspace = await mkdtemp(join(tmpdir(), "pi-context-packer-runtime-tool-smoke-"));
  try {
    await mkdir(join(workspace, "docs", "project"), { recursive: true });
    await writeFile(join(workspace, "AGENTS.md"), "# Runtime AGENTS\n\nRead-only smoke.\n", "utf8");
    await writeFile(
      join(workspace, "docs", "project", "smoke.md"),
      "# Runtime Smoke\n\nInstalled context_pack can read seeded Markdown.\n",
      "utf8",
    );

    const runtimeContext = runtimeSmokeContext(workspace, ctx);
    const baseParams = {
      objective: "Installed runtime smoke for context-packer tools",
      cwd: workspace,
      repoRoot: workspace,
      providers: { agents: "required", docs: "required", git: "off", session: "off" },
    };

    const registeredPlanResult = await contextPackerToolDefinition("context_plan").execute(
      "release-smoke-context-plan",
      {
        ...baseParams,
        objective: "Installed registered context_plan wrapper smoke",
        seeds: [
          { kind: "path", value: join(workspace, "docs", "project", "smoke.md") },
          { kind: "path", value: "/etc/passwd" },
          { kind: "path", value: "/etc/hosts" },
        ],
      },
      undefined,
      undefined,
      runtimeContext,
    );
    const registeredPlanText = resultText(registeredPlanResult);
    const registeredPlanDetails = smokeDetails(registeredPlanResult);
    assertSmoke(
      registeredPlanText.includes("absolute/home-relative path seed omitted (2 seeds)"),
      "registered context_plan wrapper did not group unsafe absolute seed risks",
    );
    assertSmoke(
      !registeredPlanText.includes(
        "absolute/home-relative path seed omitted\n- blocked: absolute/home-relative",
      ),
      "registered context_plan wrapper repeated unsafe absolute seed risk rows",
    );
    assertSmoke(
      registeredPlanDetails?.runtimeContract?.registeredToolContract ===
        "context-packer-registered-tools-v1",
      `registered context_plan wrapper missing runtime contract: ${JSON.stringify(registeredPlanDetails)}`,
    );
    assertSmoke(
      registeredPlanDetails?.redaction?.rawSeedsOmitted,
      "registered context_plan wrapper did not return compact redacted details",
    );

    const registeredPackResult = await contextPackerToolDefinition("context_pack").execute(
      "release-smoke-context-pack",
      {
        ...baseParams,
        seeds: [{ kind: "path", value: "docs/project/smoke.md" }],
      },
      undefined,
      undefined,
      runtimeContext,
    );
    const registeredPackDetails = smokeDetails(registeredPackResult);
    assertSmoke(
      registeredPackDetails?.ok,
      `registered context_pack wrapper execution failed: ${JSON.stringify(registeredPackDetails)}`,
    );
    assertSmoke(
      registeredPackDetails?.runtimeContract?.registeredToolContract ===
        "context-packer-registered-tools-v1",
      `registered context_pack wrapper missing runtime contract: ${JSON.stringify(registeredPackDetails)}`,
    );
    assertSmoke(
      resultText(registeredPackResult).includes("Runtime Smoke"),
      "registered context_pack wrapper did not include seeded Markdown packet content",
    );

    const budgetRefusal = await contextPackerToolDefinition("context_pack").execute(
      "release-smoke-budget-refusal",
      { ...baseParams, budget: { maxBytes: 1, maxTokens: 10, reserveTokens: 9 } },
      undefined,
      undefined,
      runtimeContext,
    );
    assertSmoke(
      Buffer.byteLength(resultText(budgetRefusal)) <= 1,
      "rendered packet escaped byte cap",
    );
    assertSmoke(budgetRefusal.details?.ok === false, "tiny-budget refusal was not reported");

    const evaluationResult = await contextPackerToolDefinition("context_dogfood_evaluate").execute(
      "release-smoke-context-dogfood-evaluate",
      {
        observation: {
          kind: "context_pack_dogfood_observation_v1",
          prediction: {
            expectedLowLevelCallsAvoided: 1,
            packetUtilityRecommendationStatus: "use_packet",
          },
          observation: {
            runtimeContext: "installed_registered_tool_closure",
            actualLowLevelReadSearchStatusCalls: 0,
            actualLowLevelCallsAvoided: 1,
            validationCommandsRun: 0,
            duplicateReadsObserved: false,
            omissionFollowupsUsed: [],
            recommendationMatchedOutcome: true,
            notes: "installed runtime release smoke",
          },
        },
      },
      undefined,
      undefined,
      runtimeContext,
    );
    const evaluationDetails = smokeDetails(evaluationResult);
    const dogfoodObservationEvaluation = evaluationDetails?.dogfoodObservationEvaluation;
    assertSmoke(
      dogfoodObservationEvaluation?.status === "matched",
      `registered context_dogfood_evaluate execution failed: ${JSON.stringify(evaluationDetails)}`,
    );
    assertSmoke(
      evaluationDetails?.runtimeContract?.registeredToolContract ===
        "context-packer-registered-tools-v1",
      "registered context_dogfood_evaluate wrapper missing runtime contract",
    );

    const aggregateResult = await contextPackerToolDefinition("context_dogfood_summarize").execute(
      "release-smoke-context-dogfood-summarize",
      { evaluations: [dogfoodObservationEvaluation] },
      undefined,
      undefined,
      runtimeContext,
    );
    const aggregateDetails = smokeDetails(aggregateResult);
    assertSmoke(
      aggregateDetails?.dogfoodAggregateEvaluation?.validReceiptCount === 1,
      `registered context_dogfood_summarize execution failed: ${JSON.stringify(aggregateDetails)}`,
    );
    assertSmoke(
      aggregateDetails?.runtimeContract?.registeredToolContract ===
        "context-packer-registered-tools-v1",
      "registered context_dogfood_summarize wrapper missing runtime contract",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
