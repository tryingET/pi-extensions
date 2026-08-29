/**
summary: "Context-packet shared test fixtures; split from context-pack.test.js."
read_when:
  - "You change shared test fixtures behavior."
*/
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContextPacket as buildContextPacketImpl } from "../src/context-pack.js";

export const buildContextPacket = (input, env = {}) =>
  buildContextPacketImpl(input, { cwd: input.cwd, ...env });

export const makeWorkspace = async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-context-pack-"));
  await mkdir(join(root, "docs", "project"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# AGENTS\n\nUse bounded read-only context.\n", "utf8");
  await writeFile(
    join(root, "docs", "project", "note.md"),
    "# Note\n\nThis is source-owned Markdown context.\n",
    "utf8",
  );
  return root;
};

export const writeGitMarker = async (root) => {
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, ".git", "HEAD"), "ref: refs/heads/main\n", "utf8");
};

export const fileExists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};
