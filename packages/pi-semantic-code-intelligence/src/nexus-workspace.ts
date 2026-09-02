import type { SciBridgeCallResult } from "./mcp-bridge.ts";

export type WorkspaceRefV1 = Readonly<{
  schema: "semantic-code-intelligence.workspace_ref.v1";
  workspaceId: string;
}>;

export type WorkspaceStateRefV1 = Readonly<{
  schema: "semantic-code-intelligence.workspace_state_ref.v1";
  workspaceId: string;
  digest: string;
}>;

export type WorkspacePathRefV1 = Readonly<{
  schema: "semantic-code-intelligence.workspace_path_ref.v1";
  workspaceId: string;
  path: string;
}>;

export type SnapshotRefV1 = Readonly<{
  schema: "semantic-code-intelligence.snapshot_ref.v1";
  workspaceId: string;
  snapshotId: string;
  revision: number;
  baseDigest: string;
  overlayDigest: string;
}>;

export type NexusWorkspaceContext = Readonly<{
  workspace: WorkspaceRefV1;
  initialSnapshotRef: SnapshotRefV1;
}>;

export const NEXUS_WORKSPACE_ENTRY_TYPE = "pi-sci-nexus-workspace-v1";
export const NEXUS_WORKSPACE_MISMATCH_MESSAGE =
  "SCI NEXUS workspace identity changed for this Pi session; start a target-root session.";
const NEXUS_RESTORE_VISIT_LIMIT = 512;

export type NexusWorkspaceEntry = Readonly<{
  schema: "pi.sci_nexus_workspace.v1";
  workspace: WorkspaceRefV1;
}>;

const WORKSPACE_ID = /^wsp_[0-9a-f]{32}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const SNAPSHOT_ID = /^[0-9a-f-]{8,64}$/iu;

export function isWorkspaceRefV1(value: unknown): value is WorkspaceRefV1 {
  const record = exactRecord(value, ["schema", "workspaceId"]);
  return Boolean(
    record &&
      record.schema === "semantic-code-intelligence.workspace_ref.v1" &&
      typeof record.workspaceId === "string" &&
      WORKSPACE_ID.test(record.workspaceId),
  );
}

export function isWorkspaceStateRefV1(value: unknown): value is WorkspaceStateRefV1 {
  const record = exactRecord(value, ["schema", "workspaceId", "digest"]);
  return Boolean(
    record &&
      record.schema === "semantic-code-intelligence.workspace_state_ref.v1" &&
      typeof record.workspaceId === "string" &&
      WORKSPACE_ID.test(record.workspaceId) &&
      typeof record.digest === "string" &&
      SHA256.test(record.digest),
  );
}

export function isWorkspacePathRefV1(value: unknown): value is WorkspacePathRefV1 {
  const record = exactRecord(value, ["schema", "workspaceId", "path"]);
  return Boolean(
    record &&
      record.schema === "semantic-code-intelligence.workspace_path_ref.v1" &&
      typeof record.workspaceId === "string" &&
      WORKSPACE_ID.test(record.workspaceId) &&
      typeof record.path === "string" &&
      validRelativePath(record.path),
  );
}

export function isSnapshotRefV1(value: unknown): value is SnapshotRefV1 {
  const record = exactRecord(value, [
    "schema",
    "workspaceId",
    "snapshotId",
    "revision",
    "baseDigest",
    "overlayDigest",
  ]);
  return Boolean(
    record &&
      record.schema === "semantic-code-intelligence.snapshot_ref.v1" &&
      typeof record.workspaceId === "string" &&
      WORKSPACE_ID.test(record.workspaceId) &&
      typeof record.snapshotId === "string" &&
      SNAPSHOT_ID.test(record.snapshotId) &&
      Number.isSafeInteger(record.revision) &&
      Number(record.revision) >= 0 &&
      typeof record.baseDigest === "string" &&
      SHA256.test(record.baseDigest) &&
      typeof record.overlayDigest === "string" &&
      SHA256.test(record.overlayDigest),
  );
}

export function parseNexusHandshake(result: SciBridgeCallResult): NexusWorkspaceContext {
  const payload = parseResultPayload(result);
  if (!payload || !isWorkspaceRefV1(payload.workspace) || !isSnapshotRefV1(payload.snapshotRef)) {
    throw new Error("SCI NEXUS handshake returned an invalid reference contract");
  }
  if (payload.snapshotRef.workspaceId !== payload.workspace.workspaceId) {
    throw new Error("SCI NEXUS handshake returned mismatched workspace lineage");
  }
  return Object.freeze({
    workspace: Object.freeze(payload.workspace),
    initialSnapshotRef: Object.freeze(payload.snapshotRef),
  });
}

export function bindNexusArgs(
  args: Record<string, unknown>,
  context: NexusWorkspaceContext,
): Record<string, unknown> {
  return { ...args, workspace: context.workspace };
}

export function payloadHasNexusWorkspace(
  payload: Record<string, unknown>,
  workspace: WorkspaceRefV1,
): boolean {
  return (
    isWorkspaceRefV1(payload.workspace) && payload.workspace.workspaceId === workspace.workspaceId
  );
}

export function sameWorkspace(left: WorkspaceRefV1, right: WorkspaceRefV1): boolean {
  return left.workspaceId === right.workspaceId;
}
export function isNexusWorkspaceEntry(value: unknown): value is NexusWorkspaceEntry {
  const entry = exactRecord(value, ["schema", "workspace"]);
  return Boolean(
    entry && entry.schema === "pi.sci_nexus_workspace.v1" && isWorkspaceRefV1(entry.workspace),
  );
}

export function restoreNexusWorkspaceEntry(
  branch: readonly unknown[],
): NexusWorkspaceEntry | undefined {
  const limit = Math.max(0, branch.length - NEXUS_RESTORE_VISIT_LIMIT);
  for (let index = branch.length - 1; index >= limit; index -= 1) {
    const entry = record(branch[index]);
    if (entry?.type !== "custom" || entry.customType !== NEXUS_WORKSPACE_ENTRY_TYPE) continue;
    if (isNexusWorkspaceEntry(entry.data)) {
      return Object.freeze({ schema: entry.data.schema, workspace: entry.data.workspace });
    }
  }
  return undefined;
}

export function nextPinnedNexusWorkspace(
  current: WorkspaceRefV1 | undefined,
  candidate: unknown,
): { workspace: WorkspaceRefV1; persist: boolean } | undefined {
  if (!isWorkspaceRefV1(candidate)) return undefined;
  if (current && !sameWorkspace(current, candidate)) {
    throw new Error(NEXUS_WORKSPACE_MISMATCH_MESSAGE);
  }
  return { workspace: candidate, persist: current === undefined };
}

export function localSciBridgeError(error: unknown): Error | undefined {
  if (!(error instanceof Error)) return undefined;
  return error.message.startsWith("SCI NEXUS ") ||
    error.message.startsWith("SCI bridge workspace is immutable")
    ? error
    : undefined;
}

export function renderNexusWorkspaceEntry(
  data: unknown,
  expanded: boolean,
): { render(width: number): string[]; invalidate(): void } {
  const workspaceId = isNexusWorkspaceEntry(data) ? data.workspace.workspaceId : "unreadable";
  const text = expanded ? `SCI NEXUS workspace ${workspaceId}` : "SCI NEXUS workspace bound";
  return {
    render(width: number) {
      const safeWidth = Number.isSafeInteger(width) && width > 0 ? width : 1;
      return [text.length <= safeWidth ? text : text.slice(0, safeWidth)];
    },
    invalidate() {},
  };
}

function parseResultPayload(result: SciBridgeCallResult): Record<string, unknown> | undefined {
  const content = Array.isArray(result.content) ? result.content : [];
  const item = content.find(
    (entry): entry is { type: string; text: string } =>
      entry !== null &&
      typeof entry === "object" &&
      "text" in entry &&
      typeof (entry as { text?: unknown }).text === "string",
  );
  if (!item) return undefined;
  try {
    return record(JSON.parse(item.text));
  } catch {
    return undefined;
  }
}

function validRelativePath(value: string): boolean {
  return Boolean(
    value &&
      value !== "." &&
      !value.includes("\\") &&
      !value.includes("\0") &&
      !value.startsWith("/") &&
      !/^[A-Za-z]:/u.test(value) &&
      !value.split("/").includes(".."),
  );
}

function exactRecord(value: unknown, keys: string[]): Record<string, unknown> | undefined {
  const entry = record(value);
  if (!entry) return undefined;
  const actual = Object.keys(entry).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
    ? entry
    : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null
    ? (value as Record<string, unknown>)
    : undefined;
}
