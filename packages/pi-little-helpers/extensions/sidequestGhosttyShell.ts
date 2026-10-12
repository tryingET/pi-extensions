// summary: pure Pi shell scaffold and attachment-only fail-closed exit policy.
import type { GhosttyWindowLaunchHandshake } from "./sidequestDetachedWindow.ts";

/** Attachment viewers must not leave an executable shell behind after failure. */
export type ShellExitPolicy = "debug-shell" | "fail-closed";

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildPiShellCommand(
  titleBase: string | undefined,
  cwd: string,
  launchHandshake?: GhosttyWindowLaunchHandshake,
  shellExitPolicy: ShellExitPolicy = "debug-shell",
): string {
  const titleSetup = titleBase
    ? [
        `export PI_SESSION_PRESENCE_TITLE_BASE=${shellSingleQuote(titleBase)}`,
        'printf "\\033]0;%s\\007" "$PI_SESSION_PRESENCE_TITLE_BASE"',
      ]
    : [];

  return [
    `cd ${shellSingleQuote(cwd)}`,
    "status=$?",
    shellExitPolicy === "fail-closed"
      ? 'if [ "$status" -ne 0 ]; then echo "[sidequest] failed to enter working directory"; exit "$status"; fi'
      : 'if [ "$status" -ne 0 ]; then echo; echo "[sidequest] failed to enter working directory"; echo "[sidequest] leaving an interactive shell open for debugging"; exec "$' +
        '{SHELL:-/bin/bash}" -i; fi',
    ...titleSetup,
    'cmd="$1"',
    "shift",
    ...(launchHandshake
      ? [
          'if ! command -v "$cmd" >/dev/null 2>&1; then echo "[sidequest] Pi command is unavailable: $cmd"; exit 127; fi',
          `launch_handshake_tmp=${shellSingleQuote(launchHandshake.path)}.tmp.$$`,
          `if ! (umask 077; printf '%s\\n' ${shellSingleQuote(launchHandshake.token)} > "$launch_handshake_tmp" && mv -f -- "$launch_handshake_tmp" ${shellSingleQuote(launchHandshake.path)}); then rm -f -- "$launch_handshake_tmp"; echo "[sidequest] launch handshake failed"; exit 125; fi`,
        ]
      : []),
    ...(shellExitPolicy === "fail-closed"
      ? ['exec "$cmd" "$@"']
      : [
          '"$cmd" "$@"',
          "status=$?",
          'if [ "$status" -ne 0 ]; then echo; echo "[sidequest] pi exited with status $status"; echo "[sidequest] leaving an interactive shell open for debugging"; exec "$' +
            '{SHELL:-/bin/bash}" -i; fi',
        ]),
  ].join("; ");
}
