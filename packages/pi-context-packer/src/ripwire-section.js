/**
summary: "Connect explicitly selected ripwire discovery to the bounded packet assembler."
read_when:
  - "Changing code-provider execution policy or required-provider outcomes."
*/
import { CODE_QUERY_MAX_CHARS } from "./code-request.js";
import { dedupeCodeItems } from "./code-working-set.js";
import { outputLimits } from "./packet-budget-limits.js";
import { collectRipwire } from "./ripwire-provider.js";

function discoveryQuery(plan) {
  let objective = plan.objective;
  let omitted = 0;
  const hints = new Set(
    (plan.unavailableCodeSeeds ?? []).map((seed) => `${seed.kind}: ${seed.value}`),
  );
  for (const hint of hints) {
    const addition = `\n${hint}`;
    if (objective.length + addition.length <= CODE_QUERY_MAX_CHARS) objective += addition;
    else omitted++;
  }
  return { objective, omitted };
}

export async function buildRipwireSection(plan, env = {}, remainingBudget = {}) {
  const limits = outputLimits(plan.budget, env);
  const query = discoveryQuery(plan);
  const blockedRoot = plan.risks.some(
    (risk) => risk.kind === "path" && risk.severity === "blocked",
  );
  const blocked = blockedRoot
    ? "invalid_workspace"
    : Math.min(limits.maxBytes, remainingBudget.bytes ?? limits.maxBytes) < 256 ||
        Math.min(limits.tokens, remainingBudget.tokens ?? limits.tokens) === 0 ||
        plan.budget.perProviderMaxTokens.ripwire === 0
      ? "insufficient_headroom"
      : null;
  const result = blocked
    ? {
        ok: false,
        items: [],
        omissions: [
          {
            provider: "ripwire",
            reason: blocked,
            detail:
              "Code discovery was not invoked; correct workspace input or provide output headroom.",
          },
        ],
      }
    : await collectRipwire(
        { root: plan.repoRoot ?? plan.cwd, objective: query.objective, limit: 12, code: plan.code },
        { ...env.ripwire, signal: env.signal },
      );
  const deduped = dedupeCodeItems(result.items, env.workingSet, plan.code?.refresh);
  return {
    ok: result.ok,
    state: {
      ...(result.state ?? {}),
      status: result.ok ? "collected" : "unavailable",
      duplicates: deduped.duplicates,
      workingSetStatus: deduped.workingSetStatus,
      observedItems: result.items.length,
      required: plan.providerPlans.some(
        (entry) => entry.provider === "ripwire" && entry.reason === "provider required by caller",
      ),
    },
    omissions: [
      ...result.omissions,
      ...(query.omitted && plan.code?.mode !== "expand"
        ? [
            {
              provider: "ripwire",
              reason: "seed_hint_limit",
              detail: `${query.omitted} code hint(s) did not fit the retrieval query; shorten the objective or use fewer seeds.`,
            },
          ]
        : []),
    ],
    section: {
      id: "ripwire",
      provider: "ripwire",
      title: "Ranked code discovery",
      authority:
        "Heuristic, scoped code context from an approved copied corpus; verify in source. Not edit authorization.",
      items: deduped.items,
      bytes: deduped.items.reduce((sum, item) => sum + item.bytes, 0),
      estimatedTokens: deduped.items.reduce((sum, item) => sum + item.estimatedTokens, 0),
    },
  };
}
