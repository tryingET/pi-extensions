// ---
// summary: "Plans editor-open attempts for overlay Enter without coupling the live TUI to zellij-only launch."
// read_when:
//   - "Changing how /c opens a file-backed context item in an editor."
// ---
import { join } from "node:path";

export interface OpenFileAttempt {
  label: string;
  command: string;
  args: string[];
  timeoutMs?: number;
}

export const resolveEditorCommand = (env: NodeJS.ProcessEnv = process.env): string[] => {
  const rawEditor = (env.VISUAL ?? env.EDITOR ?? "vi").trim();
  const parts = rawEditor.split(/\s+/).filter((part) => part.length > 0);
  return parts.length > 0 ? parts : ["vi"];
};

const isZellij = (env: NodeJS.ProcessEnv): boolean => Boolean(env.ZELLIJ?.trim());

const isGhostty = (env: NodeJS.ProcessEnv): boolean =>
  env.TERM_PROGRAM?.trim().toLowerCase() === "ghostty" ||
  Boolean(env.GHOSTTY_BIN_DIR?.trim()) ||
  Boolean(env.GHOSTTY_RESOURCES_DIR?.trim());

const ghosttyBin = (env: NodeJS.ProcessEnv): string => {
  const binDir = env.GHOSTTY_BIN_DIR?.trim();
  return binDir ? join(binDir, "ghostty") : "ghostty";
};

const zellijAttempts = (
  filePath: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): OpenFileAttempt[] => {
  const sessionName = env.ZELLIJ_SESSION_NAME?.trim();
  const sessionPrefix = sessionName ? ["--session", sessionName] : [];
  const editorCommand = resolveEditorCommand(env);
  const attempts: OpenFileAttempt[] = [
    {
      label: "zellij-run",
      command: "zellij",
      args: [
        ...sessionPrefix,
        "run",
        "--direction",
        "down",
        "--cwd",
        cwd,
        "--",
        ...editorCommand,
        filePath,
      ],
    },
    {
      label: "zellij-action-edit",
      command: "zellij",
      args: [...sessionPrefix, "action", "edit", "--direction", "down", "--cwd", cwd, filePath],
    },
    {
      label: "zellij-edit",
      command: "zellij",
      args: [...sessionPrefix, "edit", "--direction", "down", "--cwd", cwd, filePath],
    },
  ];
  if (sessionPrefix.length > 0) {
    attempts.push({
      label: "zellij-run-no-session",
      command: "zellij",
      args: ["run", "--direction", "down", "--cwd", cwd, "--", ...editorCommand, filePath],
    });
  }
  return attempts;
};

const ghosttyAttempts = (
  filePath: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): OpenFileAttempt[] => {
  const bin = ghosttyBin(env);
  const editorCommand = resolveEditorCommand(env);
  const wd = `--working-directory=${cwd}`;
  const exec = ["-e", ...editorCommand, filePath];
  return [
    { label: "ghostty-new-tab", command: bin, args: ["+new-tab", wd, ...exec], timeoutMs: 5000 },
    {
      label: "ghostty-new-window",
      command: bin,
      args: ["+new-window", wd, ...exec],
      timeoutMs: 5000,
    },
    { label: "ghostty-e", command: bin, args: [wd, ...exec], timeoutMs: 5000 },
  ];
};

export const planOpenFile = (input: {
  filePath: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): OpenFileAttempt[] => {
  const env = input.env ?? process.env;
  const attempts: OpenFileAttempt[] = [];
  if (isZellij(env)) attempts.push(...zellijAttempts(input.filePath, input.cwd, env));
  if (isGhostty(env) || attempts.length === 0) {
    attempts.push(...ghosttyAttempts(input.filePath, input.cwd, env));
  }
  return attempts;
};
