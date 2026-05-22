import type { ToolboxBundle } from "./toolbox-contract.ts";

export const CATALOG: ToolboxBundle[] = [
  {
    id: "vault",
    title: "Prompt Vault tools",
    description:
      "Prompt Vault query, retrieve, vocabulary, dispatch-check, mutation, execution, and feedback workflows.",
    ownerPackage: "packages/pi-vault-client",
    ownerSemantics:
      "pi-vault-client owns Prompt Vault behavior; toolbox discovers and activates already-registered owner tools without reimplementing Prompt Vault behavior; the owner extension must register tool schemas before toolbox can activate them.",
    keywords: ["prompt vault", "vault", "template", "prompt", "governed prompt"],
    profiles: [
      {
        id: "read",
        description: "Read-only Prompt Vault lookup and dispatch posture checks.",
        tools: ["vault_query", "vault_retrieve", "vault_vocabulary", "vault_dispatch_check"],
        risk: "read",
        defaultTtlTurns: 4,
        requiresExplicitUserIntent: false,
      },
      {
        id: "diagnostic",
        description: "Prompt Vault local diagnostics and execution receipt inspection.",
        tools: [
          "vault_schema_diagnostics",
          "vault_dolt_telemetry",
          "vault_executions",
          "vault_replay",
        ],
        risk: "diagnostic",
        defaultTtlTurns: 3,
        requiresExplicitUserIntent: false,
      },
      {
        id: "mutating",
        description:
          "Governed Prompt Vault insert, update, rating, and prompt evaluation workflows.",
        tools: ["vault_insert", "vault_update", "vault_rate", "prompt_eval"],
        risk: "mutating",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "context-packer",
    title: "Context-packer tools",
    description:
      "Read-only context packet planning and assembly across source-owned providers such as AGENTS, docs, git, session metadata, and SCI.",
    ownerPackage: "packages/pi-context-packer",
    ownerSemantics:
      "pi-context-packer owns context packet planning/assembly; toolbox discovers and activates already-registered owner tools without turning the packet into source-owner authority; the owner extension must register tool schemas before toolbox can activate them.",
    keywords: [
      "context pack",
      "context packet",
      "context window",
      "context_plan",
      "context_pack",
      "context_dogfood_evaluate",
      "dogfood receipt",
      "sci",
      "docs",
    ],
    profiles: [
      {
        id: "read",
        description:
          "Read-only context packet planning, bounded packet assembly, and packet-local dogfood receipt evaluation.",
        tools: ["context_plan", "context_pack", "context_dogfood_evaluate"],
        risk: "read",
        defaultTtlTurns: 4,
        requiresExplicitUserIntent: false,
      },
    ],
  },
  {
    id: "ontology",
    title: "Ontology workflow tools",
    description: "ROCS-backed ontology inspect, proposal, and governed change workflows.",
    ownerPackage: "packages/pi-ontology-workflows",
    ownerSemantics:
      "pi-ontology-workflows owns ontology workflow behavior; toolbox discovers and activates already-registered owner tools without reimplementing ontology behavior; the owner extension must register tool schemas before toolbox can activate them.",
    keywords: ["ontology", "rocs", "concept", "relation", "semantic"],
    profiles: [
      {
        id: "read",
        description: "Read-only ontology status, search, and pack inspection.",
        tools: ["ontology_inspect", "ontology_proposal"],
        risk: "read",
        defaultTtlTurns: 4,
        requiresExplicitUserIntent: false,
      },
      {
        id: "mutating",
        description: "Governed ontology change planning and apply workflow.",
        tools: ["ontology_change"],
        risk: "mutating",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "designmd",
    title: "DesignMD Foundry tools",
    description:
      "DESIGN.md lint, export, Oat snapshot, OpenPencil, Penpot, palette, and session handoff workflows.",
    ownerPackage: "packages/pi-designmd-foundry",
    ownerSemantics:
      "pi-designmd-foundry owns DesignMD tool behavior; toolbox discovers and activates already-registered owner tools without reimplementing design behavior; the owner extension must register tool schemas before toolbox can activate them.",
    keywords: ["design", "designmd", "css", "tokens", "penpot", "openpencil", "oat", "palette"],
    profiles: [
      {
        id: "read",
        description:
          "Read-only design lint, export, prompt, snapshot, inspect, and readiness flows.",
        tools: [
          "designmd_lint",
          "designmd_export",
          "designmd_agent_prompt",
          "designmd_oat_visual_snapshot",
          "designmd_openpencil_prompt",
          "designmd_openpencil_info",
          "designmd_openpencil_lint",
          "designmd_palette_from_text",
          "designmd_penpot_mcp_inspect",
          "designmd_readiness",
        ],
        risk: "read",
        defaultTtlTurns: 4,
        requiresExplicitUserIntent: false,
      },
      {
        id: "mutating",
        description:
          "Design artifact export or materialization flows that write requested local outputs or apply bounded session packets.",
        tools: [
          "designmd_openpencil_export",
          "designmd_penpot_mcp_bridge",
          "designmd_penpot_mcp_export",
          "designmd_session_plan",
          "designmd_session_variants",
          "designmd_session_closeout",
          "designmd_session_handoff",
          "designmd_session_promotion_candidate",
          "designmd_import_penpot",
        ],
        risk: "mutating",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "orchestrator",
    title: "Society orchestrator tools",
    description:
      "Society diagnostics, evidence, cognitive dispatch, workflow, and loop execution surfaces.",
    ownerPackage: "packages/pi-society-orchestrator",
    ownerSemantics:
      "pi-society-orchestrator owns orchestration behavior; toolbox discovers and activates already-registered owner tools without reimplementing orchestration behavior; the owner extension must register tool schemas before toolbox can activate them.",
    keywords: ["society", "orchestrator", "workflow", "loop", "evidence", "cognitive dispatch"],
    profiles: [
      {
        id: "read",
        description: "Read-only society/orchestrator diagnostics and context tools.",
        tools: ["society_query", "orchestrator_boundary_telemetry", "ontology_context"],
        risk: "read",
        defaultTtlTurns: 4,
        requiresExplicitUserIntent: false,
      },
      {
        id: "orchestrator-gated",
        description:
          "Orchestrator dispatch, workflow, loop, evidence, and release coordination surfaces.",
        tools: [
          "cognitive_dispatch",
          "evidence_record",
          "workflow_execute",
          "loop_execute",
          "vault_execute_template",
          "ts_quality_release_workflow",
          "autoresearch_live_supervision",
          "autoresearch_manifest_campaign_supervision",
          "autoresearch_self_hosting_supervision",
          "autoresearch_learning_kes_adapter",
        ],
        risk: "orchestrator-gated",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "autoresearch",
    title: "Autoresearch runtime tools",
    description:
      "Bounded pi-autoresearch setup, run, loop, supervision, candidate, and campaign-control surfaces.",
    ownerPackage: "packages/pi-autoresearch",
    ownerSemantics:
      "pi-autoresearch owns bounded experiment runtime behavior; toolbox discovers and activates already-registered owner tools without reimplementing experiment behavior; the owner extension must register tool schemas before toolbox can activate them.",
    keywords: ["autoresearch", "experiment", "benchmark", "campaign", "self-hosting", "llamacpp"],
    profiles: [
      {
        id: "read",
        description:
          "Read-only autoresearch status, control inspection, finalization planning, and peer-assist planning.",
        tools: [
          "autoresearch_runtime_status",
          "autoresearch_runtime_control",
          "autoresearch_runtime_finalize",
          "autoresearch_runtime_peer_assist",
          "autoresearch_llamacpp_campaign_control",
          "autoresearch_llamacpp_campaign",
        ],
        risk: "diagnostic",
        defaultTtlTurns: 3,
        requiresExplicitUserIntent: false,
      },
      {
        id: "mutating",
        description:
          "Bounded autoresearch setup, run, loop, foreground resume, finalization, and self-hosting actions that can write receipts or local artifacts.",
        tools: [
          "autoresearch_runtime_run",
          "autoresearch_runtime_autoplan",
          "autoresearch_runtime_setup",
          "autoresearch_campaign_start",
          "autoresearch_runtime_loop",
          "autoresearch_runtime_resume_apply",
          "autoresearch_self_hosting_run",
        ],
        risk: "mutating",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "agent_vent",
    title: "Agent vent diagnostics",
    description:
      "Local-only agent frustration capture and recurrence summaries for surfacing repeated bugs, tool failures, and workflow friction.",
    ownerPackage: "packages/pi-agent-vent",
    ownerSemantics:
      "pi-agent-vent owns the local JSONL vent store, redaction, recurrence grouping, and candidate-incident heuristics; toolbox activates the already-registered agent_vent tool without moving vent state into self/ASC or creating AK, GitHub, incident, evidence, or telemetry records.",
    keywords: [
      "agent vent",
      "vent",
      "frustration",
      "recurring bug",
      "tool failure",
      "workflow friction",
      "candidate incident",
      "diagnostic",
    ],
    profiles: [
      {
        id: "default",
        description:
          "Local diagnostic vent capture plus summary/list/path inspection; may append local JSONL but does not mutate external or canonical owner surfaces.",
        tools: ["agent_vent"],
        risk: "diagnostic",
        defaultTtlTurns: 4,
        requiresExplicitUserIntent: false,
      },
    ],
  },
  {
    id: "peer-spawn",
    title: "Visible peer-spawn tools",
    description:
      "pi-little-helpers sidequest tools for launching visible fork, scout, and candidate peer sessions. The intercom messaging primitive remains always-active through pi-peer-messaging.",
    ownerPackage: "packages/pi-little-helpers",
    ownerSemantics:
      "pi-little-helpers owns visible peer launch behavior; pi-peer-messaging owns the always-active intercom communication primitive; toolbox activates the already-registered sidequest peer-spawn tools.",
    keywords: ["peer", "sidequest", "parallelquest", "candidate", "scout", "spawn"],
    profiles: [
      {
        id: "default",
        description: "Visible sidequest/scout/candidate peer-spawn tools.",
        tools: ["fork_peer_spawn", "scout_peer_spawn", "candidate_peer_spawn"],
        risk: "orchestrator-gated",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "session-introspection",
    title: "Always-active session introspection tools",
    description: "Foundational self-inspection and subagent dispatch surfaces.",
    ownerPackage: "packages/pi-autonomous-session-control",
    ownerSemantics:
      "pi-autonomous-session-control owns self/subagent behavior; self and dispatch_subagent remain always-active foundational tools when their owner package is registered.",
    keywords: ["self", "subagent", "introspection", "progress", "loop"],
    profiles: [
      {
        id: "default",
        description: "Foundational self-inspection and subagent dispatch tools.",
        tools: ["self", "dispatch_subagent"],
        risk: "safe",
        defaultTtlTurns: 6,
        requiresExplicitUserIntent: false,
      },
    ],
  },
  {
    id: "operator-interaction",
    title: "Operator interaction tools",
    description: "Foundational structured operator input surface.",
    ownerPackage: "pi-interview / interaction packages",
    ownerSemantics:
      "operator interaction packages own UI behavior; interview remains always-active as the core structured input tool.",
    keywords: ["interview", "operator", "form", "requirements", "decision"],
    profiles: [
      {
        id: "default",
        description: "Structured operator interview tool.",
        tools: ["interview"],
        risk: "safe",
        defaultTtlTurns: 6,
        requiresExplicitUserIntent: false,
      },
    ],
  },
];
