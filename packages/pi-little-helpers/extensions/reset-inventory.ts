// summary: read-only machine query for reset inventory; no login, purchase, switch, or redemption action.
// read_when: changing the subscription_resets tool or its cancellation and scope boundary.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { queryResetInventory, resetInventoryLines } from "../lib/reset-inventory.ts";

export function createResetInventoryExtension(query = queryResetInventory) {
  return function resetInventoryExtension(pi: ExtensionAPI) {
    const lifecycle = new AbortController();
    pi.on("session_shutdown", () => lifecycle.abort());
    pi.registerTool({
      name: "subscription_resets",
      label: "Subscription reset inventory",
      description:
        "Read banked reset counts and expiry for one exact allowed subscription (default: active). Codex uses its account-bound API; Grok and z.ai use compatible sub-core inventory adapters. z.ai requires explicitly provisioned ZCode PERSONAL sign-in tokens. Returns precise unavailable/auth states, never invents zero. Does not log in, scan browser stores, switch models, or redeem resets. Multiple quota-window counts are not a summed count of distinct cards.",
      parameters: Type.Object({
        provider: Type.Optional(
          Type.String({
            maxLength: 100,
            description:
              "Exact Pi provider identity, e.g. xai, zai, openai-codex-2; default is active subscription.",
          }),
        ),
      }),
      async execute(_id, params, signal, _onUpdate, ctx) {
        const result = await query(
          ctx,
          pi.events,
          params.provider,
          AbortSignal.any([lifecycle.signal, ...(signal ? [signal] : [])]),
        );
        return {
          content: [
            {
              type: "text",
              text: [
                `Reset inventory — ${result.provider}`,
                ...resetInventoryLines(result),
                "Read-only. Provider-native credentials may differ from model overrides; no account-switch or redemption was performed.",
              ].join("\n"),
            },
          ],
          details: result,
        };
      },
    });
  };
}
export default createResetInventoryExtension();
