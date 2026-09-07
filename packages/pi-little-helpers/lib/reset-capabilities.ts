// summary: verified reset capabilities, distinct from quota renewals and monetary credit.
// read_when: adding a reset provider or changing inventory and management guidance.
import { isCodexProvider } from "./codex-accounts.ts";

export interface ResetCapability {
  inventory: "native" | "sub-core" | "unsupported";
  redemption: "native" | "unsupported";
  explanation: string;
  management?: { url: string; instructions: string };
}

// Only verified, static provider URLs belong here. Never use API payloads or model URLs.
// Evidence and native-adapter admission requirements: docs/project/subscription-resets.md.
const CAPABILITIES: Readonly<Record<string, ResetCapability>> = {
  zai: {
    inventory: "sub-core",
    redemption: "unsupported",
    explanation:
      "Reset cards exist. Read-only inventory requires ZCode PERSONAL sign-in credentials; API-key quota and promotional purchase credits are separate. Native redemption is not enabled.",
    management: {
      url: "https://z.ai/manage-apikey/subscription",
      instructions:
        "For reset cards, open the signed-in ZCode app: Usage Statistics → Coding Plan. Review this account's plan separately on the website.",
    },
  },
  xai: {
    inventory: "sub-core",
    redemption: "unsupported",
    explanation:
      "Read-only weekly reset inventory uses Pi's base xAI OAuth credential through sub-core. Native redemption is not enabled; developer API credit is separate.",
    management: {
      url: "https://grok.com",
      instructions:
        "Open Settings → Billing for your Grok subscription; app-store purchases are managed through Apple or Google. In the official Grok CLI, /usage opens usage/billing options.",
    },
  },
};

export function resetCapability(provider: string): ResetCapability {
  if (isCodexProvider(provider))
    return {
      inventory: "native",
      redemption: "native",
      explanation: "Account-bound banked-reset inspection and confirmed redemption are supported.",
    };
  const capability = Object.hasOwn(CAPABILITIES, provider) ? CAPABILITIES[provider] : undefined;
  return (
    capability ?? {
      inventory: "unsupported",
      redemption: "unsupported",
      explanation:
        "Reset inspection and redemption are unsupported in this integration. This does not establish whether the provider offers resets; aliases never borrow base-account data.",
    }
  );
}

export function resetGuidance(provider: string): string[] {
  const capability = resetCapability(provider);
  if (capability.inventory === "native")
    return [
      "BANKED RESETS · native support",
      "Select this subscription, then /resets status to inspect or /resets use to confirm redemption.",
    ];
  return [
    `BANKED RESETS · ${capability.inventory === "sub-core" ? "read-only inventory" : "unsupported here"}`,
    capability.explanation,
    capability.inventory === "sub-core"
      ? "Select this subscription, then /resets status to query inventory. Unknown or sign-in required is not zero."
      : "No banked-reset count or expiry was read. Unknown / unsupported is not zero.",
    ...(capability.management
      ? [
          "Select this subscription, then /resets manage for provider management (not native reset redemption).",
          capability.management.url,
          capability.management.instructions,
          "Browser sign-in may differ from Pi; verify the account before making changes.",
        ]
      : []),
  ];
}
