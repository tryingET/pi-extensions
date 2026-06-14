import type { SelfQuery, SelfResponse } from "../types.ts";

interface AutonomyLevel {
  level: number;
  name: string;
  agentMayDo: string[];
  requiresGate: string[];
  ownerSurface: string;
}

const AUTONOMY_LEVELS: AutonomyLevel[] = [
  {
    level: 0,
    name: "mirror only",
    agentMayDo: ["inspect self state", "summarize", "suggest next steps"],
    requiresGate: ["edits", "tool activation", "peer launch", "durable writes"],
    ownerSurface: "pi-autonomous-session-control/self",
  },
  {
    level: 1,
    name: "bounded local implementation",
    agentMayDo: ["edit in-scope files", "run package checks", "commit exact paths when requested"],
    requiresGate: ["cross-owner mutation", "external side effects", "release/publish"],
    ownerSurface: "target package/repo",
  },
  {
    level: 2,
    name: "same-session continuation",
    agentMayDo: ["send low-risk follow-up user messages", "continue a verified local nextMove"],
    requiresGate: ["slash commands", "peer launches", "compaction", "durable records"],
    ownerSurface: "pi-autonomous-session-control/self",
  },
  {
    level: 3,
    name: "supervised multi-session autonomy",
    agentMayDo: [
      "spawn read-only scouts/reviewers",
      "spawn isolated candidate worktrees",
      "supervise PEER_ACK/PEER_FINAL",
    ],
    requiresGate: [
      "merge candidate worktrees",
      "treat peer messages as evidence",
      "mutate owner surfaces",
    ],
    ownerSurface: "pi-peer-messaging plus peer-spawn tools",
  },
  {
    level: 4,
    name: "visible-loop campaign",
    agentMayDo: [
      "run checkpointed visible-loop iterations",
      "work against product-posture/vision targets",
    ],
    requiresGate: ["claim semantic completion", "promote learnings/evidence", "hide loop progress"],
    ownerSurface: "pi-little-helpers / visible-loop",
  },
  {
    level: 5,
    name: "measured autonomous campaign",
    agentMayDo: [
      "run bounded measured campaigns",
      "compare candidates",
      "collect empirical signals",
    ],
    requiresGate: ["publish findings as authority", "auto-merge", "auto-release"],
    ownerSurface: "pi-autoresearch and pi-society-orchestrator",
  },
  {
    level: 6,
    name: "durable owner mutation",
    agentMayDo: [
      "write AK/evidence/KES/ontology/Prompt Vault/release surfaces only through owner commands",
    ],
    requiresGate: ["explicit owner-surface authorization", "validation evidence", "rollback path"],
    ownerSurface: "owning authority surface",
  },
];

export function isAutonomyStatusQuery(lower: string): boolean {
  return (
    lower.includes("autonomy level") ||
    lower.includes("autonomy status") ||
    lower.includes("level of autonomy") ||
    lower.includes("self-evolving") ||
    lower.includes("drive yourself") ||
    lower.includes("drive myself")
  );
}

export function resolveAutonomyStatusQuery(query: SelfQuery | undefined): SelfResponse {
  const requested = String(query?.query ?? "").toLowerCase();
  const needsSelfEvolutionAnswer =
    requested.includes("self-evolving") ||
    requested.includes("level of autonomy") ||
    requested.includes("drive yourself") ||
    requested.includes("drive myself");

  return {
    understood: true,
    intent: "meta",
    answer: [
      "Autonomy status (mirror-only): to self-evolve without repeated operator nudges, I need Level 3 for supervised multi-session discovery/review, Level 4 for visible checkpointed loops, and Level 5 for measured campaigns. Level 6 durable owner-surface mutation still requires explicit owner gates.",
      needsSelfEvolutionAnswer
        ? "Why I stop today: ASC/self can suggest and send low-risk continuations, but it is not the hidden loop runner. After reload or compaction, mirror state can be sparse, so autonomous continuation must be driven by a visible loop, measured campaign, or explicitly supervised peer/candidate envelope rather than by pretending session memory is authority."
        : "Current self can explain the autonomy ladder and route safe continuations, but campaign execution belongs to visible-loop/autoresearch/orchestrator owners.",
      "Safe next move: use Level 3 read-only scouts/reviewers or isolated candidate peers for parallelism; use Level 4 `/visible-loop` when the objective is product-posture work; use Level 5 autoresearch/orchestrator only when empirical campaign policy is in scope.",
    ].join("\n"),
    data: {
      kind: "self.autonomy_status.v1",
      authority: "mirror_only",
      currentSafeDefaultLevel: 3,
      neededForSelfEvolution: [3, 4, 5],
      durableMutationLevel: 6,
      levels: AUTONOMY_LEVELS,
      nonAuthorizations: [
        "Does not authorize hidden infinite loops, unbounded peer launch, candidate merge, commits, AK/KES/evidence writes, ontology promotion, Prompt Vault changes, agent_vent records, releases, or publication.",
      ],
    },
    suggestions: [
      "Use scout_peer_spawn for read-only parallel discovery",
      "Use candidate_peer_spawn for isolated mutation candidates",
      "Use /visible-loop for checkpointed product-posture iterations",
      "Use pi-autoresearch/orchestrator for measured campaigns",
    ],
  };
}
