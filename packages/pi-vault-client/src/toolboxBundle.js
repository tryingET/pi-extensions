// summary: expose vault tools through read, diagnostic, and mutating toolbox profiles.
// read_when:
//   - registering the vault toolbox bundle or changing profile-to-tool risk summaries.
import registerVaultExtension from "../extensions/vault.js";

const PROFILE_TOOLS = {
  read: [
    { name: "vault_query", profile: "read", risk: "read" },
    { name: "vault_retrieve", profile: "read", risk: "read" },
    { name: "vault_vocabulary", profile: "read", risk: "read" },
    { name: "vault_dispatch_check", profile: "read", risk: "read" },
  ],
  diagnostic: [
    { name: "vault_schema_diagnostics", profile: "diagnostic", risk: "diagnostic" },
    { name: "vault_dolt_telemetry", profile: "diagnostic", risk: "diagnostic" },
    { name: "vault_executions", profile: "diagnostic", risk: "diagnostic" },
    { name: "vault_replay", profile: "diagnostic", risk: "diagnostic" },
  ],
  mutating: [
    { name: "vault_insert", profile: "mutating", risk: "mutating" },
    { name: "vault_update", profile: "mutating", risk: "mutating" },
    { name: "vault_rate", profile: "mutating", risk: "mutating" },
    { name: "prompt_eval", profile: "mutating", risk: "mutating" },
  ],
};
export const id = "vault";
export const version = 1;
export function registerToolboxBundle(pi, context = { profile: "read" }) {
  registerVaultExtension(pi);
  const profile = context.profile || "read";
  const summaries = PROFILE_TOOLS[profile] ?? Object.values(PROFILE_TOOLS).flat();
  const requested = new Set(context.requestedTools ?? []);
  if (requested.size === 0) return summaries;
  return summaries.filter((summary) => requested.has(summary.name));
}
export default registerToolboxBundle;
