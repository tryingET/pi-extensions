import { Text } from "@mariozechner/pi-tui";
export const PROMPT_VAULT_ROOT = process.env.PROMPT_VAULT_ROOT || "/home/tryinget/ai-society/core/prompt-vault";
export const VAULT_DIR = process.env.VAULT_DIR || `${PROMPT_VAULT_ROOT}/prompt-vault-db`;
export const VLLM_ENDPOINT = process.env.VLLM_ENDPOINT || "http://localhost:8000";
export const VLLM_MODEL = process.env.VLLM_MODEL || "Qwen/Qwen2.5-3B-Instruct";
export const DEFAULT_VAULT_QUERY_LIMIT = 20;
export const MAX_VAULT_QUERY_LIMIT = 50;
export const INTENT_RANKING_CANDIDATE_POOL_LIMIT = 500;
export const LIVE_VAULT_TRIGGER_ID = "vault-template-live-picker";
export const LIVE_VAULT_TRIGGER_DEBOUNCE_MS = 150;
export const LIVE_VAULT_MIN_QUERY = 0;
export const LIVE_TRIGGER_TELEMETRY_LIMIT = 100;
export const SCHEMA_VERSION = 9;
export const COMPANIES = [
    "core",
    "software",
    "finance",
    "house",
    "health",
    "teaching",
    "holding",
];
export const ARTIFACT_KINDS = ["cognitive", "procedure", "session"];
export const CONTROL_MODES = ["one_shot", "router", "loop"];
export const FORMALIZATION_LEVELS = ["napkin", "bounded", "structured", "workflow"];
export const CONTROLLED_VOCABULARY_DIMENSIONS = [
    "routing_context",
    "activity_phase",
    "input_artifact",
    "transition_target_type",
    "selection_principles",
    "output_commitment",
];
export const RENDER_ENGINES = ["none", "pi-vars", "nunjucks"];
export function renderTextPreview(result) {
    const text = result.content[0];
    return new Text(text?.type === "text" ? String(text.text || "").slice(0, 200) : "", 0, 0);
}
