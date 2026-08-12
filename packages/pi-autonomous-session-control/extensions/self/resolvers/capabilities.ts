/**
 * Capability discovery resolver for self/meta queries.
 *
 * Self explains ASC/self query domains here. Toolbox, repo capability maps, and
 * durable owner surfaces remain separate authorities.
 */

import type { SelfResponse } from "../types.ts";
import { SELF_EVOLUTION_CONTINUATION_PREFILL_ALIASES } from "./action.ts";

const selfEvolutionContinuationAliases = SELF_EVOLUTION_CONTINUATION_PREFILL_ALIASES.map(
  (alias) => `"${alias}"`,
).join(" / ");

export function resolveCapabilityQuery(): SelfResponse {
  return {
    understood: true,
    intent: "meta",
    answer: `I can help with capability discovery, but these surfaces are intentionally different:

**1. self-tool query domains** (ask this tool about the current session):

**Perception** (see yourself):
- "What files have I touched?" / "What commands have I run?"
- "Am I in a loop?" / "What progress have I made?"
- "What errors have I encountered?" / "Status"

**Direction** (move yourself):
- "Spawn branch to explore X" / "What branches?"
- "I'm confident about this" / "I need help with X"

**Crystallization** (improve yourself):
- "Remember: [pattern]" / "What did I learn?"
- "Recall patterns about [topic]"
- "Recall exact patterns" / "What did I learn verbatim?"
- "Remember semantic pressure: [missing term]"
- "What semantic-pressure annotations have I recorded?"
- "Mark semantic-pressure annotation as rejected"

**Protection** (protect yourself):
- "Mark as trap: [pattern]" / "Am I approaching a trap?"
- "List traps"

**Action** (act, persisted for restart-aware dogfood loops):
- "Create checkpoint before [reason]"
- "Queue followup: [task]" / "Remind me: [task]"
- "Prefill: [text]"
- "Notify operator: [message]" / "Send user message: [message]" for explicit low-risk follow-up notifications through pi.sendUserMessage
- First run "Self-evolution" with concrete friction/hypothesis/metric/falsifier/owner/test context; ASC emits and retains a bounded session-local candidate id, and insufficient-evidence candidates fail closed
- "Prefill visible-loop self-evolution" or ${selfEvolutionContinuationAliases} to route the latest execution-ready candidate into an operator-submitted /visible-loop --count 1 --delegate-commit --candidate <id> command; pi-little-helpers resolves the correlated self result and persists its execution/closeout membrane
- "Launch visible-loop self-evolution" to send that candidate-bound command through the pi-little-helpers-owned extension bridge; ASC does not implement the loop
- "Prefill autoresearch campaign" / "Launch autoresearch campaign" to carry the latest candidate id, hypothesis, metric, falsifier, and owner into an operator-reviewed /autoresearch objective; ASC does not implement the campaign
- "Prefill suggested next move" after a handoff summary exposes nextMove
- "Record continuation candidate: [text]" to explicitly store a mirror-only same-cwd next-step hint without sending or executing it
- "Continue safely" / "Next autonomous step" to advance the same guarded nextMove seam: low-risk local work becomes a follow-up user message; peer/harness/compaction/high-severity moves stay prefilled. After reload/compaction, a fresh explicit same-cwd continuation candidate may win over stale mirror-derived nextMove; mirror-derived candidates do not override current recovery cues.
- "Create self-contained handoff prompt" / "Fresh session handoff prompt"
- "Action summary" / "List checkpoints" / "List followups" to inspect checkpoints, follow-ups, and mirror-only continuation candidates

**Diagnostic review** (mirror friction without recording it):
- "Dogfood self" / "How can self improve?"
- "Self-evolution" / "Evolve self"
- "What friction just happened?"
- "Continue diagnostic review" to produce/review a canonical typed candidate without sending a hidden recursive follow-up; reflection-required candidates stay blocked on an external check
- "Prefill agent_vent record" for an operator-reviewed durable local diagnostic write
- Return a candidate diagnostic payload for explicit operator/toolbox/agent_vent follow-up, not a stored vent or authoritative issue.

**Memory lifecycle status** (self-memory mirror, not owner truth):
- "Self memory status" / "Memory lifecycle status"
- Reports persisted-memory load status plus scoped counts for patterns, semantic-pressure annotations, traps, checkpoints, follow-ups, and continuation candidates.
- Does not promote ontology, write evidence, record vents, launch loops, or create durable owner truth.

**Autonomy status** (self-driving envelope, not permission by itself):
- "Autonomy status" / "What level of autonomy is needed?" / "Why don't you drive yourself?"
- Explains the ladder from mirror-only to supervised peers, visible-loop campaigns, measured campaigns, and durable owner mutation gates.
- Does not authorize hidden infinite loops, unbounded peer launch, candidate merge, owner writes, releases, or publication.

**Cache-aware delegation** (routing advice, not a cache guarantee):
- "Cache-aware delegation: tree or fork?" / "Subagent cache strategy"
- Explains why /tree has the best same-session cache affinity, while /fork and /clone allocate new session identities; returns measurement and safe-tool boundaries without claiming provider cache hits.

**Self-evolution feedback** (session-local outcome mirror):
- "self feedback: helpful — candidate routed the next slice correctly"
- "self feedback: wrong-owner — suggestion belonged to another package"
- "self feedback summary"
- Records bounded local outcome labels only; does not write agent_vent, AK/evidence, KES, ontology, visible-loop, measured campaigns, issues, incidents, or telemetry.

**2. toolbox/bundle discovery** (outside self):
- Use the \`toolbox\` tool to search, explain, activate, deactivate, or inspect Pi extension bundles when you need extension-provided capabilities.
- Example: \`toolbox({ action: "search", query: "design tokens" })\` before assuming a design-system tool is active.
- For recurring agent frustration, repeated bugs, tool failures, or workflow friction, use the separate \`agent_vent\` bundle/tool; do not store vent diagnostics in self/ASC state.
- Keep toolbox/bundle discovery separate from this self-tool query list; self explains itself, toolbox discovers extension bundles.

**3. parallel work routing** (ASC execution runtime):
- Ask "Cache-aware delegation: tree or fork?" when choosing between sequential /tree, inherited-context /fork, and clean parallel dispatch.
- Use \`dispatch_subagent\` for bounded background investigation, review, or testing when parallel cognition reduces risk or latency; completed owned runs expose first-turn and aggregate cache measurements without inferring quality.
- Use visible candidate peers only when the operator/controller explicitly wants an isolated worktree mutation lane; candidates propose patches but do not merge, push, or promote themselves.

**4. repo/lane capability-map routing surfaces** (documentation/read-first routing):
- Use lane and repo capability maps such as \`repo-capability-map.md\` and \`pi-extensions/docs/project/root-capabilities.md\` to choose the owning repo/package and read-first docs.
- Capability maps are routing surfaces, not new runtime tools or durable authority.

**5. durable authority boundaries**:
- For AK/KES/evidence decisions, use the owning AK/KES/evidence systems and their documented commands; self memory is only a session mirror and candidate scratchpad, not canonical authority.`,
    data: {
      domains: [
        {
          name: "perception",
          description: "Query session state and operations",
          examples: ["What files have I touched?", "Am I in a loop?", "Progress"],
        },
        {
          name: "direction",
          description: "Spawn branches, signal confidence, request help",
          examples: ["Spawn branch to explore X", "I need help with Y"],
        },
        {
          name: "crystallization",
          description: "Remember and recall patterns plus semantic-pressure annotations",
          examples: [
            "Remember: [pattern]",
            "What did I learn?",
            "Recall exact patterns",
            "Remember semantic pressure: [missing term]",
            "What semantic-pressure annotations have I recorded?",
          ],
        },
        {
          name: "protection",
          description: "Mark and check for traps",
          examples: ["Mark as trap: [pattern]", "List traps"],
        },
        {
          name: "action",
          description: "Create restart-persistent checkpoints and followups, prefill editor",
          examples: [
            "Create checkpoint",
            "Queue followup: X",
            "Prefill: Y",
            "continue self-evolution",
            "Prefill suggested next move",
            "Record continuation candidate: npm --prefix packages/<package> run check",
            "Continue safely",
            "Next autonomous step",
            "Notify operator: I finished validation and need /reload",
            "Create self-contained handoff prompt",
            "Action summary",
          ],
        },
        {
          name: "diagnostic review",
          description:
            "Mirror local self/tooling friction and prepare candidate diagnostics without recording vents or authority state.",
          examples: [
            "Dogfood self",
            "How can self improve?",
            "What friction just happened?",
            "Continue diagnostic review",
            "Prefill agent_vent record",
          ],
        },
        {
          name: "memory lifecycle status",
          description:
            "Report self-memory load status and scoped in-memory counts without promoting or writing owner-surface truth.",
          examples: ["Self memory status", "Memory lifecycle status"],
        },
        {
          name: "autonomy status",
          description:
            "Explain the safe autonomy ladder and which owner surface must run each higher-autonomy mode.",
          examples: ["Autonomy status", "What level of autonomy is needed?"],
        },
        {
          name: "self-evolution feedback",
          description:
            "Record bounded session-local outcome labels for self suggestions without writing durable owner surfaces.",
          examples: [
            "self feedback: helpful — suggestion reduced operator correction",
            "self feedback: unsafe — suggestion would mutate durable state",
            "self feedback summary",
          ],
        },
      ],
      discoverySurfaces: [
        {
          name: "self-tool query domains",
          description:
            "Natural-language queries understood by this self tool for session perception, direction, crystallization, protection, and action.",
        },
        {
          name: "toolbox/bundle discovery",
          description:
            "Use the toolbox tool for Pi extension bundle search, explanation, deactivation, and inspection; route recurring agent frustration diagnostics to the separate agent_vent bundle/tool rather than self/ASC state.",
          example: 'toolbox({ action: "search", query: "design tokens" })',
        },
        {
          name: "parallel work routing",
          description:
            "Use dispatch_subagent for bounded background investigation, review, or testing; use visible candidate peers only for explicitly isolated mutation lanes.",
          example:
            'dispatch_subagent({ profile: "reviewer", objective: "Review the staged changes for risks and missing tests" })',
        },
        {
          name: "repo/lane capability-map routing",
          description:
            "Use repo-capability-map.md and pi-extensions/docs/project/root-capabilities.md as read-first routing surfaces for repo/package ownership.",
        },
        {
          name: "AK/KES/evidence authority",
          description:
            "Use owning AK/KES/evidence systems for durable decisions; self memory is a session mirror, not canonical authority.",
        },
      ],
    },
  };
}
