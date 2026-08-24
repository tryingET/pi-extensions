import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  SCI_COMPOSITE_TOOL_NAMES,
  SCI_COMPOSITE_TOOL_SPECS,
  type SciCompositeToolName,
} from "./tool-definitions.ts";

export const PI_SCI_MCP_CLIENT_INFO = Object.freeze({
  name: "pi-semantic-code-intelligence",
  version: "0.1.1-rc.2",
});

export interface SciBridgeCallResult {
  content?: unknown[];
  isError?: boolean;
  [key: string]: unknown;
}

export interface SciBridge {
  callTool(
    name: SciCompositeToolName,
    args: Record<string, unknown>,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SciBridgeCallResult>;
  advertisedToolNames(cwd: string): Promise<string[]>;
  close(): Promise<void>;
}

interface LiveConnection {
  cwd: string;
  client: Client;
  transport: StdioClientTransport;
  advertisedTools: Set<string>;
}

export interface McpBridgeOptions {
  command?: string;
  environment?: Record<string, string>;
}

interface AdvertisedTool {
  name: string;
  inputSchema?: unknown;
}

interface JsonSchema {
  type?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: unknown;
  default?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  enum?: unknown;
  items?: JsonSchema;
  maxItems?: unknown;
}

export function assertSciSchemaCompatibility(advertised: readonly AdvertisedTool[]): void {
  const byName = new Map(advertised.map((tool) => [tool.name, tool]));
  const failures: string[] = [];

  for (const spec of SCI_COMPOSITE_TOOL_SPECS) {
    const remote = byName.get(spec.name)?.inputSchema as JsonSchema | undefined;
    const local = spec.parameters as JsonSchema;
    if (!remote) {
      failures.push(`${spec.name}: missing advertised input schema`);
      continue;
    }

    compareSchemaSubset(local, remote, spec.name, failures);
  }

  if (failures.length > 0) {
    throw new Error(`SCI composite schema compatibility check failed: ${failures.join("; ")}`);
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareSchemaSubset(
  local: JsonSchema,
  remote: JsonSchema,
  schemaPath: string,
  failures: string[],
): void {
  if (local.type !== undefined && local.type !== remote.type) {
    failures.push(
      `${schemaPath}: type differs (Pi=${String(local.type)}; SCI=${String(remote.type)})`,
    );
  }

  const localRequired = stringArray(local.required).sort();
  const remoteRequired = stringArray(remote.required).sort();
  if (localRequired.join("\0") !== remoteRequired.join("\0")) {
    failures.push(
      `${schemaPath}: required fields differ (Pi=${localRequired.join(",")}; SCI=${remoteRequired.join(",")})`,
    );
  }

  if (
    local.default !== undefined &&
    remote.default !== undefined &&
    !sameJson(local.default, remote.default)
  ) {
    failures.push(`${schemaPath}: default differs`);
  }
  if (
    typeof local.maximum === "number" &&
    typeof remote.maximum === "number" &&
    local.maximum > remote.maximum
  ) {
    failures.push(`${schemaPath}: Pi maximum exceeds SCI maximum`);
  }
  if (
    typeof local.minimum === "number" &&
    typeof remote.minimum === "number" &&
    local.minimum < remote.minimum
  ) {
    failures.push(`${schemaPath}: Pi minimum is below SCI minimum`);
  }
  if (
    typeof local.maxItems === "number" &&
    typeof remote.maxItems === "number" &&
    local.maxItems > remote.maxItems
  ) {
    failures.push(`${schemaPath}: Pi maxItems exceeds SCI maxItems`);
  }
  const localEnum = Array.isArray(local.enum) ? local.enum : undefined;
  const remoteEnum = Array.isArray(remote.enum) ? remote.enum : undefined;
  if (localEnum && remoteEnum) {
    const unsupported = localEnum.filter(
      (value) => !remoteEnum.some((candidate) => sameJson(candidate, value)),
    );
    if (unsupported.length > 0) failures.push(`${schemaPath}: Pi enum exceeds SCI enum`);
  }

  if (local.items) {
    if (!remote.items) failures.push(`${schemaPath}.items: not advertised by SCI`);
    else compareSchemaSubset(local.items, remote.items, `${schemaPath}.items`, failures);
  }

  for (const [propertyName, localProperty] of Object.entries(local.properties ?? {})) {
    const remoteProperty = remote.properties?.[propertyName];
    const propertyPath = `${schemaPath}.${propertyName}`;
    if (!remoteProperty) {
      failures.push(`${propertyPath}: not advertised by SCI`);
      continue;
    }
    compareSchemaSubset(localProperty, remoteProperty, propertyPath, failures);
  }
}

export class SciMcpBridge implements SciBridge {
  private connection: LiveConnection | undefined;
  private connecting: Promise<LiveConnection> | undefined;

  constructor(private readonly options: McpBridgeOptions = {}) {}

  async callTool(
    name: SciCompositeToolName,
    args: Record<string, unknown>,
    cwd: string,
    signal?: AbortSignal,
  ): Promise<SciBridgeCallResult> {
    const connection = await this.ensureConnection(cwd);
    if (!connection.advertisedTools.has(name)) {
      throw new Error(
        `Installed semantic-code-mcp does not advertise ${name}; update SCI or use its CLI fallback.`,
      );
    }

    const timeoutSeconds =
      typeof args.timeoutSec === "number" && Number.isFinite(args.timeoutSec)
        ? Math.min(600, Math.max(1, args.timeoutSec))
        : 240;
    const timeout = timeoutSeconds * 1000 + 30_000;

    try {
      return (await connection.client.callTool({ name, arguments: args }, undefined, {
        signal,
        timeout,
        maxTotalTimeout: timeout,
      })) as SciBridgeCallResult;
    } catch {
      await this.resetConnection(connection);
      throw new Error(
        `SCI MCP call ${name} failed; effect state may be indeterminate for check workflows. Inspect the workspace before retrying. Backend diagnostics were withheld.`,
      );
    }
  }

  async advertisedToolNames(cwd: string): Promise<string[]> {
    return [...(await this.ensureConnection(cwd)).advertisedTools].sort();
  }

  async close(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    this.connecting = undefined;
    if (!connection) return;
    await closeConnection(connection);
  }

  private async ensureConnection(cwd: string): Promise<LiveConnection> {
    const workspace = path.resolve(cwd);
    if (this.connection?.cwd === workspace) return this.connection;
    if (this.connection) await this.close();
    if (this.connecting) return this.connecting;

    const connecting = this.connect(workspace);
    this.connecting = connecting;
    try {
      const connection = await connecting;
      this.connection = connection;
      return connection;
    } finally {
      if (this.connecting === connecting) this.connecting = undefined;
    }
  }

  private async connect(cwd: string): Promise<LiveConnection> {
    const runtimeDir = path.join(cwd, ".ontology", "pi-mcp");
    await mkdir(runtimeDir, { recursive: true });

    const command = this.options.command ?? process.env.SCI_MCP_COMMAND ?? "semantic-code-mcp";
    const transport = new StdioClientTransport({
      command,
      cwd,
      stderr: "pipe",
      env: {
        ...getDefaultEnvironment(),
        ...this.options.environment,
        SEMANTIC_CODE_WORKSPACE: cwd,
        WORKSPACE_ROOT: cwd,
        MCP_LOG_DIR: runtimeDir,
        SILENT_MODE: "true",
        STDIO_MODE: "true",
      },
    });
    const stderrTail: string[] = [];
    transport.stderr?.on("data", (chunk) => {
      stderrTail.push(String(chunk));
      if (stderrTail.length > 20) stderrTail.shift();
    });

    const client = new Client(PI_SCI_MCP_CLIENT_INFO, { capabilities: {} });

    try {
      await client.connect(transport);
      const listed = await client.listTools(undefined, { timeout: 30_000 });
      assertSciSchemaCompatibility(listed.tools);
      const advertisedTools = new Set(listed.tools.map((tool) => tool.name));
      const missing = SCI_COMPOSITE_TOOL_NAMES.filter((name) => !advertisedTools.has(name));
      if (missing.length > 0) {
        throw new Error(`missing required composite tools: ${missing.join(", ")}`);
      }
      return { cwd, client, transport, advertisedTools };
    } catch {
      await Promise.allSettled([client.close(), transport.close()]);
      const stderrObserved = stderrTail.some((entry) => entry.length > 0);
      throw new Error(
        `Could not start installed semantic-code-mcp for this workspace. Backend diagnostics were withheld${stderrObserved ? "; stderr was observed" : ""}.`,
      );
    }
  }

  private async resetConnection(connection: LiveConnection): Promise<void> {
    if (this.connection === connection) this.connection = undefined;
    await closeConnection(connection);
  }
}

async function closeConnection(connection: LiveConnection): Promise<void> {
  await Promise.allSettled([connection.client.close(), connection.transport.close()]);
}
