/**
summary: "Connect explicitly selected ripwire discovery to the bounded packet assembler."
read_when:
  - "Changing code-provider execution policy or required-provider outcomes."
*/
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
        { root: plan.repoRoot ?? plan.cwd, objective: plan.objective, limit: 12 },
        { ...env.ripwire, signal: env.signal },
      );
  return {
    ok: result.ok,
    state: {
      ...(result.state ?? {}),
      status: result.ok ? "collected" : "unavailable",
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
      items: result.items,
      bytes: result.items.reduce((sum, item) => sum + item.bytes, 0),
      estimatedTokens: result.items.reduce((sum, item) => sum + item.estimatedTokens, 0),
    },
  };
}
