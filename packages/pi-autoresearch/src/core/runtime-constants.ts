import {
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
} from "./decisions.ts";
import { AUTORESEARCH_CAMPAIGN_GOAL_LEDGER_FILE } from "./goal.ts";
import { AUTORESEARCH_EVENT_LEDGER_FILE } from "./ledger.ts";
import { AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_FILE } from "./llamacppCampaign.ts";
import { AUTORESEARCH_RUNTIME_SNAPSHOT_FILE } from "./resume.ts";

export const AUTORESEARCH_COMMAND_NAME = "autoresearch";
export const AUTORESEARCH_STATUS_TOOL_NAME = "autoresearch_runtime_status";
export const AUTORESEARCH_RUN_TOOL_NAME = "autoresearch_runtime_run";
export const AUTORESEARCH_CONTROL_TOOL_NAME = "autoresearch_runtime_control";
export const AUTORESEARCH_FINALIZE_TOOL_NAME = "autoresearch_runtime_finalize";
export const AUTORESEARCH_PEER_ASSIST_TOOL_NAME = "autoresearch_runtime_peer_assist";
export const AUTORESEARCH_LOOP_TOOL_NAME = "autoresearch_runtime_loop";
export const AUTORESEARCH_RESUME_APPLY_TOOL_NAME = "autoresearch_runtime_resume_apply";
export const AUTORESEARCH_AUTOPLAN_TOOL_NAME = "autoresearch_runtime_autoplan";
export const AUTORESEARCH_SETUP_TOOL_NAME = "autoresearch_runtime_setup";
export const AUTORESEARCH_CAMPAIGN_START_TOOL_NAME = "autoresearch_campaign_start";
export const AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME = "autoresearch_candidate_bind";
export const AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME = "autoresearch_candidate_decision";
export const AUTORESEARCH_PHASE = "bounded_runtime_kernel" as const;
export const AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE = ".autoresearch/oracle_evidence.json";
export const AUTORESEARCH_LEARNING_EXPORT_FILE = ".autoresearch/learning.json";
export const AUTORESEARCH_CANDIDATE_RESULT_EXPORT_FILE = ".autoresearch/candidate-result.json";
export const AUTORESEARCH_CANDIDATE_WAVE_RESULT_EXPORT_DIR = ".autoresearch/candidate-wave";
export const AUTORESEARCH_CANDIDATE_INVENTORY_CLEANUP_CONFIRMATION =
  "ARCHIVE STALE AUTORESEARCH CANDIDATES";

export const AUTORESEARCH_LOCAL_ARTIFACTS = [
  "autoresearch.jsonl",
  AUTORESEARCH_EVENT_LEDGER_FILE,
  AUTORESEARCH_CAMPAIGN_GOAL_LEDGER_FILE,
  AUTORESEARCH_RUNTIME_SNAPSHOT_FILE,
  "autoresearch.finalization.json",
  AUTORESEARCH_LLAMACPP_CAMPAIGN_PROJECTION_FILE,
  "autoresearch.md",
  "autoresearch.sh",
  "autoresearch.checks.sh",
  "autoresearch.ideas.md",
  AUTORESEARCH_ORACLE_EVIDENCE_EXPORT_FILE,
  AUTORESEARCH_LEARNING_EXPORT_FILE,
  AUTORESEARCH_CANDIDATE_RESULT_EXPORT_FILE,
] as const;

export const AUTORESEARCH_DASHBOARD_EXPORT_FILE = ".autoresearch/autoresearch-dashboard.html";

export const READY_PROMPT_VAULT_TEMPLATES = [
  AUTORESEARCH_SETUP_TEMPLATE_NAME,
  AUTORESEARCH_NEXT_HYPOTHESIS_TEMPLATE_NAME,
  AUTORESEARCH_FINALIZE_TEMPLATE_NAME,
] as const;

export const BLOCKED_PROMPT_VAULT_TEMPLATES = ["pi-autoresearch-state-router"] as const;
