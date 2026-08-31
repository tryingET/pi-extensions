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
