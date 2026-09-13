// summary: prefix the Vault close-session procedure with host-bound caller identity.
// read_when: changing /session-closeout prompt injection or host-binding literals.

export function boundCloseoutProcedurePrompt(
  procedure: string,
  host: {
    closeoutId: string;
    sessionId: string;
    sessionFile: string;
    repo: string;
    boundary: string;
  },
): string {
  return [
    "<!-- closeout-host-binding:start -->",
    'The `/session-closeout` command already opened this caller gate. Do not call `session_closeout({ action: "open" })` again.',
    `CALLER_CLOSEOUT_ID=${host.closeoutId}`,
    `CALLER_SESSION_ID=${host.sessionId}`,
    `CALLER_SESSION_FILE=${host.sessionFile}`,
    `CALLER_REPO=${host.repo}`,
    `CALLER_BOUNDARY=${host.boundary}`,
    "Copy these exact values. The host gate remains authority.",
    "<!-- closeout-host-binding:end -->",
    "",
    procedure,
  ].join("\n");
}
