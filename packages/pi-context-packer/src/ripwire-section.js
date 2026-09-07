/**
summary: "Connect explicitly selected ripwire discovery to the bounded packet assembler."
read_when:
  - "Changing code-provider execution policy or required-provider outcomes."
*/
import { dedupeCodeItems } from "./code-working-set.js";
import { outputLimits } from "./packet-budget.js";
import { collectRipwire } from "./ripwire-provider.js";

export async function buildRipwireSection(plan, env = {}) {
  const limits = outputLimits(plan.budget, env);
  const blockedRoot = plan.risks.some(
    (risk) => risk.kind === "path" && risk.severity === "blocked",
  );
  const blocked = blockedRoot
    ? "invalid_workspace"
    : limits.maxBytes < 256
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
        { root: plan.repoRoot ?? plan.cwd, objective: plan.objective, limit: 12, code: plan.code },
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
    omissions: result.omissions,
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
