import { refuse } from "./json.js";
export const AUTH_MARGIN_MS = 360000; // native 5 minutes plus versioned 60-second safety margin
function accountId(access: string): string {
  try {
    return JSON.parse(Buffer.from(access.split(".")[1], "base64url").toString("utf8"))[
      "https://api.openai.com/auth"
    ].chatgpt_account_id;
  } catch {
    return refuse("credential_account_invalid");
  }
}
export function assertCredentialMetadata(
  credential: { type: string; access: string; expires: number },
  profile: { account: string; runDeadline: number },
): void {
  if (
    credential.type !== "oauth" ||
    accountId(credential.access) !== profile.account ||
    !Number.isSafeInteger(credential.expires) ||
    credential.expires <= Math.max(Date.now(), profile.runDeadline) + AUTH_MARGIN_MS
  )
    refuse("auth_refresh_required_or_account_mismatch");
}
