/**
summary: "Maps task signals to ASC, peer, orchestrator, AK, FCOS, Vault, and ROCS owner-surface follow-ups."
read_when:
  - "Adding an owner surface or changing routing signals, next actions, or non-authorization wording."
*/
import { boundedSignalMatches } from "./context-intake-safety.js";

const OWNER_SURFACE_GUIDANCE = [
  {
    id: "asc_self",
    surface: "ASC/self operational mirror",
    signals: ["self", "handoff", "closeout", "operational introspection", "session summary"],
    nextAction:
      "Use the ASC `self` surface directly for mirror-only progress, loop, or handoff summaries.",
    nonAuthorization: "context-packer did not inspect or persist ASC/self operational memory",
  },
  {
    id: "dispatch_subagent",
    surface: "ASC/dispatch_subagent execution",
    signals: ["dispatch_subagent", "subagent", "sub-agent", "scout", "reviewer", "tester"],
    nextAction:
      "Use `dispatch_subagent` directly when execution by a subagent is required; context-packer may only prepare context.",
    nonAuthorization: "context-packer did not spawn, supervise, or fan in subagent work",
  },
  {
    id: "intercom",
    surface: "pi-peer-messaging/intercom",
    signals: ["intercom", "peer messaging", "message peer", "ask peer", "reply to peer"],
    nextAction:
      "Use `intercom` directly for same-machine peer messages; context-packer does not send or supervise messages.",
    nonAuthorization: "context-packer did not send, reply to, or watch peer messages",
  },
  {
    id: "peer_tooling",
    surface: "pi-little-helpers visible peer tooling",
    signals: [
      "visible peer",
      "candidate peer",
      "scout peer",
      "fork peer",
      "peer launch",
      "candidate worktree",
      "peer cleanup",
    ],
    nextAction:
      "Use visible peer/candidate worktree tooling directly for peer launch or cleanup; context-packer only advises context.",
    nonAuthorization: "context-packer did not launch peers, create worktrees, or clean peer state",
  },
  {
    id: "orchestrator",
    surface: "pi-society-orchestrator workflow gate",
    signals: ["orchestrator", "workflow supervision", "workflow gate", "fan-in", "fanin"],
    nextAction:
      "Use the orchestrator owner surface directly for workflow supervision, gates, fan-in, or evidence projection explanation.",
    nonAuthorization:
      "context-packer did not supervise workflows, pass gates, fan in, or project evidence",
  },
  {
    id: "ak",
    surface: "AK / accepted society authority surfaces",
    provider: "ak",
    signals: ["ak", "task", "evidence", "decision", "direction", "lineage", "claim", "close task"],
    nextAction:
      "Use AK directly for task, decision, evidence, direction, lineage, or authority movement; context-packer only plans read-only context.",
    nonAuthorization: "context-packer did not create, claim, close, or update AK authority",
  },
  {
    id: "fcos",
    surface: "FCOS control-board owner surface",
    provider: "fcos",
    signals: ["fcos", "control-board", "control board", "layer-5", "cross-repo coordination"],
    nextAction:
      "Use the FCOS owner surface for Layer-5 coordination meaning or control-board movement; context-packer only plans read-only context.",
    nonAuthorization: "context-packer did not move, close, or authorize FCOS control-board state",
  },
  {
    id: "prompt_vault",
    surface: "Prompt Vault governed read surfaces",
    provider: "prompt_vault",
    signals: [
      "prompt vault",
      "vault_query",
      "vault_retrieve",
      "reusable prompt",
      "prompt procedure",
      "prompt template",
    ],
    nextAction:
      "Use governed Prompt Vault read tools directly for reusable prompt/procedure retrieval; context-packer does not execute vault governance.",
    nonAuthorization:
      "context-packer did not retrieve, apply, insert, or update Prompt Vault templates",
  },
  {
    id: "rocs",
    surface: "ROCS / ontology owner repos",
    signals: ["rocs", "ontology", "controlled vocabulary", "semantic authority"],
    nextAction:
      "Use ROCS or ontology owner repos for controlled semantics; context-packer only records that semantic authority is external.",
    nonAuthorization: "context-packer did not validate, mutate, or promote ontology semantics",
  },
];

const seedText = (seeds) =>
  seeds
    .map((seed) => `${seed.kind} ${seed.value} ${seed.note ?? ""}`)
    .join(" ")
    .toLowerCase();

const providerIsSelected = (providerPlans, provider) =>
  providerPlans.some((plan) => plan.provider === provider && plan.posture === "selected");

const guidanceMatches = (guidance, normalizedObjective, seeds, providerPlans) => {
  if (guidance.provider && providerIsSelected(providerPlans, guidance.provider)) return true;
  const haystack = `${normalizedObjective} ${seedText(seeds)}`;
  return guidance.signals.some((signal) => boundedSignalMatches(haystack, signal));
};

export const buildOwnerSurfaceRecommendations = ({ objective, seeds, providerPlans }) =>
  OWNER_SURFACE_GUIDANCE.filter((guidance) =>
    guidanceMatches(guidance, objective, seeds, providerPlans),
  ).map((guidance) => ({
    id: guidance.id,
    surface: guidance.surface,
    reason: guidance.provider
      ? `objective/seeds or selected ${guidance.provider} provider imply this owner surface`
      : "objective/seeds imply this owner surface",
    nextAction: guidance.nextAction,
    nonAuthorization: guidance.nonAuthorization,
  }));
