import { domainSeparatedDigest } from "./canonical-cbor.js";
import { BoundaryError } from "./errors.js";
import {
  assertBoolean,
  assertInteger,
  assertPlainObject,
  assertString,
  ByteString,
  cloneBytes,
  deepFreeze,
  rejectUnknownFields,
  stableUtf8Compare,
} from "./util.js";

export const OPERATION_KINDS = Object.freeze([
  "read",
  "write",
  "edit",
  "list",
  "grep",
  "find",
  "exec",
]);

const READ_KINDS = new Set(["read", "list", "grep", "find"]);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const RESERVED_ENV = Object.freeze([
  /^PATH$/u,
  /^HOME$/u,
  /^TMPDIR$/u,
  /^TMP$/u,
  /^TEMP$/u,
  /^XDG_/u,
  /^LD_/u,
  /^DYLD_/u,
  /^BASH_ENV$/u,
  /^ENV$/u,
  /^SHELLOPTS$/u,
  /^GIT_CONFIG/u,
  /^GIT_DIR$/u,
  /^GIT_WORK_TREE$/u,
  /^SSH_AUTH_SOCK$/u,
  /^DOCKER_/u,
  /^(HTTP|HTTPS|ALL|NO)_PROXY$/iu,
  /^(http|https|all|no)_proxy$/u,
]);

const ALLOWED_FIELDS = Object.freeze({
  read: Object.freeze(["kind", "path", "offset", "limit"]),
  write: Object.freeze(["kind", "path", "content"]),
  edit: Object.freeze(["kind", "path", "oldText", "newText", "occurrence"]),
  list: Object.freeze(["kind", "path", "limit"]),
  grep: Object.freeze(["kind", "path", "pattern", "glob", "literal", "ignoreCase", "limit"]),
  find: Object.freeze(["kind", "path", "pattern", "limit"]),
  exec: Object.freeze(["kind", "argv", "cwd", "environment", "userInitiated"]),
});

export class WorkspacePath {
  constructor(segments) {
    if (!Array.isArray(segments)) {
      throw new BoundaryError("INVALID_WORKSPACE_PATH", "WorkspacePath requires a segment array");
    }
    if (segments.length > 256) {
      throw new BoundaryError("WORKSPACE_PATH_SEGMENTS", "Workspace path has too many segments");
    }
    this.segments = segments.map((rawSegment, index) => {
      if (typeof rawSegment !== "string" || rawSegment.length === 0) {
        throw new BoundaryError(
          "INVALID_WORKSPACE_PATH_SEGMENT",
          `Workspace path segment ${index} must be non-empty text`,
        );
      }
      if (
        rawSegment === "." ||
        rawSegment === ".." ||
        rawSegment.includes("/") ||
        rawSegment.includes("\\") ||
        /[\0\r\n\x00-\x1f\x7f\x1b]/u.test(rawSegment)
      ) {
        throw new BoundaryError(
          "INVALID_WORKSPACE_PATH_SEGMENT",
          `Workspace path segment ${index} is unsafe`,
        );
      }
      const normalized = rawSegment.normalize("NFC");
      if (normalized !== rawSegment) {
        throw new BoundaryError(
          "NON_CANONICAL_WORKSPACE_PATH",
          `Workspace path segment ${index} must already be NFC normalized`,
        );
      }
      if (Buffer.byteLength(normalized, "utf8") > 255) {
        throw new BoundaryError(
          "WORKSPACE_PATH_SEGMENT_TOO_LONG",
          `Workspace path segment ${index} exceeds 255 UTF-8 bytes`,
        );
      }
      if (normalized.toLowerCase() === ".git") {
        throw new BoundaryError("GIT_PATH_FORBIDDEN", ".git path segments are forbidden");
      }
      return normalized;
    });
    const utf8Length = Buffer.byteLength(this.toString(), "utf8");
    if (utf8Length > 4_096) {
      throw new BoundaryError("WORKSPACE_PATH_TOO_LONG", "Workspace path exceeds 4096 UTF-8 bytes");
    }
    Object.freeze(this.segments);
    Object.freeze(this);
  }

  static parse(input, { allowRoot = true } = {}) {
    if (input instanceof WorkspacePath) return input;
    if (input === "." && allowRoot) return new WorkspacePath([]);
    if (typeof input !== "string" || input.length === 0) {
      throw new BoundaryError("INVALID_WORKSPACE_PATH", "Path must be non-empty text");
    }
    if (
      input.startsWith("/") ||
      input.startsWith("~") ||
      /^[A-Za-z]:[\\/]/u.test(input) ||
      input.startsWith("\\\\")
    ) {
      throw new BoundaryError(
        "HOST_PATH_NOT_ALLOWED",
        "Path must be relative to /workspace",
      );
    }
    return new WorkspacePath(input.split("/"));
  }

  toString() {
    return this.segments.length === 0 ? "." : this.segments.join("/");
  }

  toSemanticBody() {
    return [...this.segments];
  }
}

function validateId(value, label) {
  return assertString(value, label, { min: 1, max: 256, pattern: ID_PATTERN });
}

function normalizeBytes(value, label, maxBytes = 1_073_741_824) {
  if (typeof value === "string") value = Buffer.from(value, "utf8");
  if (!(value instanceof ByteString || Buffer.isBuffer(value) || value instanceof Uint8Array)) {
    throw new BoundaryError("INVALID_BYTES", `${label} must be text or bytes`);
  }
  const bytes = cloneBytes(value);
  if (bytes.length > maxBytes) {
    throw new BoundaryError("BYTES_TOO_LARGE", `${label} exceeds ${maxBytes} bytes`);
  }
  return bytes;
}

function normalizeEnvironment(value) {
  if (value === undefined) return Object.freeze([]);
  assertPlainObject(value, "exec.environment");
  const entries = Object.entries(value);
  if (entries.length > 128) {
    throw new BoundaryError("ENVIRONMENT_TOO_LARGE", "exec.environment exceeds 128 entries");
  }
  let totalBytes = 0;
  const normalized = entries.map(([key, rawValue]) => {
    assertString(key, "exec.environment key", { min: 1, max: 128, pattern: ENV_KEY_PATTERN });
    if (RESERVED_ENV.some((pattern) => pattern.test(key))) {
      throw new BoundaryError(
        "RESERVED_ENVIRONMENT_KEY",
        `Environment key is controlled by the execution plan: ${key}`,
        { key },
      );
    }
    const valueText = assertString(rawValue, `exec.environment.${key}`, { max: 32_768 });
    totalBytes += Buffer.byteLength(key, "utf8") + Buffer.byteLength(valueText, "utf8") + 2;
    return Object.freeze([key, valueText]);
  });
  if (totalBytes > 65_536) {
    throw new BoundaryError("ENVIRONMENT_TOO_LARGE", "exec.environment exceeds 65536 bytes");
  }
  normalized.sort((left, right) => stableUtf8Compare(left[0], right[0]));
  return Object.freeze(normalized);
}

function normalizeArgv(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4_096) {
    throw new BoundaryError("INVALID_ARGV", "exec.argv must contain 1..4096 entries");
  }
  let totalBytes = 0;
  const argv = value.map((item, index) => {
    const normalized = assertString(item, `exec.argv[${index}]`, { max: 131_072 });
    totalBytes += Buffer.byteLength(normalized, "utf8") + 1;
    return normalized;
  });
  if (totalBytes > 1_048_576) {
    throw new BoundaryError("ARGV_TOO_LARGE", "exec.argv exceeds 1 MiB");
  }
  return Object.freeze(argv);
}

function normalizeGlob(value) {
  if (value === undefined) return undefined;
  const glob = assertString(value, "grep.glob", { min: 1, max: 1_024 });
  if (glob.includes("\0") || /[\r\n\x1b]/u.test(glob)) {
    throw new BoundaryError("INVALID_GLOB", "grep.glob contains unsafe control characters");
  }
  return glob;
}

export function deriveEffect(operation) {
  if (READ_KINDS.has(operation.kind)) return "read";
  if (operation.kind === "write" || operation.kind === "edit") return "workspace-mutation";
  if (operation.kind === "exec") return "arbitrary-process";
  throw new BoundaryError("UNKNOWN_OPERATION_KIND", `Unknown operation kind: ${operation.kind}`);
}

export function deriveDurability(operation) {
  return deriveEffect(operation) === "read" ? "D0-replay-safe-read" : "D1-workspace-effect";
}

export function normalizeRequestedOperation(value) {
  assertPlainObject(value, "operation");
  if (!OPERATION_KINDS.includes(value.kind)) {
    throw new BoundaryError("UNKNOWN_OPERATION_KIND", `Unknown operation kind: ${value.kind}`);
  }
  rejectUnknownFields(value, ALLOWED_FIELDS[value.kind], `operation.${value.kind}`);

  let normalized;
  switch (value.kind) {
    case "read":
      normalized = {
        kind: "read",
        path: WorkspacePath.parse(value.path, { allowRoot: false }),
        offset: value.offset === undefined ? 0 : assertInteger(value.offset, "read.offset", 0, Number.MAX_SAFE_INTEGER),
        limit: value.limit === undefined ? 262_144 : assertInteger(value.limit, "read.limit", 1, 16_777_216),
      };
      break;
    case "write":
      normalized = {
        kind: "write",
        path: WorkspacePath.parse(value.path, { allowRoot: false }),
        content: normalizeBytes(value.content, "write.content"),
      };
      break;
    case "edit":
      normalized = {
        kind: "edit",
        path: WorkspacePath.parse(value.path, { allowRoot: false }),
        oldText: normalizeBytes(value.oldText, "edit.oldText", 67_108_864),
        newText: normalizeBytes(value.newText, "edit.newText", 67_108_864),
        occurrence:
          value.occurrence === undefined
            ? 1
            : assertInteger(value.occurrence, "edit.occurrence", 1, 1_000_000),
      };
      if (normalized.oldText.length === 0) {
        throw new BoundaryError("EMPTY_EDIT_MATCH", "edit.oldText must not be empty");
      }
      break;
    case "list":
      normalized = {
        kind: "list",
        path: WorkspacePath.parse(value.path ?? "."),
        limit: value.limit === undefined ? 10_000 : assertInteger(value.limit, "list.limit", 1, 100_000),
      };
      break;
    case "grep":
      normalized = {
        kind: "grep",
        path: WorkspacePath.parse(value.path ?? "."),
        pattern: assertString(value.pattern, "grep.pattern", { min: 1, max: 65_536 }),
        glob: normalizeGlob(value.glob),
        literal: value.literal === undefined ? false : assertBoolean(value.literal, "grep.literal"),
        ignoreCase:
          value.ignoreCase === undefined ? false : assertBoolean(value.ignoreCase, "grep.ignoreCase"),
        limit: value.limit === undefined ? 10_000 : assertInteger(value.limit, "grep.limit", 1, 100_000),
      };
      break;
    case "find":
      normalized = {
        kind: "find",
        path: WorkspacePath.parse(value.path ?? "."),
        pattern: assertString(value.pattern, "find.pattern", { min: 1, max: 4_096 }),
        limit: value.limit === undefined ? 10_000 : assertInteger(value.limit, "find.limit", 1, 100_000),
      };
      break;
    case "exec":
      normalized = {
        kind: "exec",
        argv: normalizeArgv(value.argv),
        cwd: WorkspacePath.parse(value.cwd ?? "."),
        environment: normalizeEnvironment(value.environment),
        userInitiated:
          value.userInitiated === undefined
            ? false
            : assertBoolean(value.userInitiated, "exec.userInitiated"),
      };
      break;
    default:
      throw new BoundaryError("UNKNOWN_OPERATION_KIND", `Unknown operation kind: ${value.kind}`);
  }
  return deepFreeze(normalized);
}

function operationBodyFromNormalized(operation) {
  switch (operation.kind) {
    case "read":
      return { 1: "read", 2: operation.path.toSemanticBody(), 3: operation.offset, 4: operation.limit };
    case "write":
      return { 1: "write", 2: operation.path.toSemanticBody(), 3: operation.content };
    case "edit":
      return {
        1: "edit",
        2: operation.path.toSemanticBody(),
        3: operation.oldText,
        4: operation.newText,
        5: operation.occurrence,
      };
    case "list":
      return { 1: "list", 2: operation.path.toSemanticBody(), 3: operation.limit };
    case "grep":
      return {
        1: "grep",
        2: operation.path.toSemanticBody(),
        3: operation.pattern,
        4: operation.glob ?? null,
        5: operation.literal,
        6: operation.ignoreCase,
        7: operation.limit,
      };
    case "find":
      return { 1: "find", 2: operation.path.toSemanticBody(), 3: operation.pattern, 4: operation.limit };
    case "exec":
      return {
        1: "exec",
        2: operation.argv,
        3: operation.cwd.toSemanticBody(),
        4: operation.environment,
        5: operation.userInitiated,
      };
    default:
      throw new BoundaryError("UNKNOWN_OPERATION_KIND", `Unknown operation kind: ${operation.kind}`);
  }
}

function toolNameForOperation(operation) {
  if (operation.kind === "list") return "ls";
  if (operation.kind === "exec") return "bash";
  return operation.kind;
}

export function operationSemanticBody(operationInput) {
  return operationBodyFromNormalized(normalizeRequestedOperation(operationInput));
}

export function requestedCallSemanticBody({
  callId,
  leaseId,
  clientSessionId,
  clientEpoch,
  requestedTimeoutMs,
  expectedWorkspaceGeneration,
  operation,
}) {
  return {
    1: validateId(callId, "callId"),
    2: validateId(clientSessionId, "clientSessionId"),
    3: validateId(clientEpoch, "clientEpoch"),
    4: validateId(leaseId, "leaseId"),
    5: requestedTimeoutMs,
    6: expectedWorkspaceGeneration ?? null,
    7: operationBodyFromNormalized(normalizeRequestedOperation(operation)),
  };
}

export function admitOperation({
  callId,
  leaseId,
  clientSessionId,
  clientEpoch,
  requestedTimeoutMs,
  expectedWorkspaceGeneration,
  operation,
  effectivePolicy,
  workspaceGeneration = 1,
}) {
  if (!effectivePolicy || !effectivePolicy.tools || !effectivePolicy.resources) {
    throw new BoundaryError("INVALID_EFFECTIVE_POLICY", "A normalized effective policy is required");
  }
  validateId(callId, "callId");
  validateId(leaseId, "leaseId");
  validateId(clientSessionId, "clientSessionId");
  validateId(clientEpoch, "clientEpoch");
  assertInteger(workspaceGeneration, "workspaceGeneration", 1, Number.MAX_SAFE_INTEGER);

  const normalized = normalizeRequestedOperation(operation);
  const effect = deriveEffect(normalized);
  const durability = deriveDurability(normalized);
  const toolName = toolNameForOperation(normalized);

  if (!effectivePolicy.tools.allowed.includes(toolName)) {
    throw new BoundaryError("OPERATION_NOT_ALLOWED", `Tool is not allowed by policy: ${toolName}`);
  }
  if (normalized.kind === "exec" && normalized.userInitiated && !effectivePolicy.tools.userBash) {
    throw new BoundaryError("USER_BASH_NOT_ALLOWED", "User shell commands are disabled by policy");
  }

  const expectedGeneration =
    expectedWorkspaceGeneration === undefined
      ? workspaceGeneration
      : assertInteger(
          expectedWorkspaceGeneration,
          "expectedWorkspaceGeneration",
          1,
          Number.MAX_SAFE_INTEGER,
        );
  if (expectedGeneration !== workspaceGeneration) {
    throw new BoundaryError("WORKSPACE_STALE", "Workspace generation has changed", {
      expected: expectedGeneration,
      actual: workspaceGeneration,
    });
  }

  const requested =
    requestedTimeoutMs === undefined
      ? effectivePolicy.resources.callTimeoutMs
      : assertInteger(requestedTimeoutMs, "requestedTimeoutMs", 1, 86_400_000);
  const timeoutMs = Math.max(
    100,
    Math.min(requested, effectivePolicy.resources.callTimeoutMs),
  );

  const requestBody = {
    1: validateId(callId, "callId"),
    2: validateId(clientSessionId, "clientSessionId"),
    3: validateId(clientEpoch, "clientEpoch"),
    4: validateId(leaseId, "leaseId"),
    5: timeoutMs,
    6: expectedGeneration,
    7: operationBodyFromNormalized(normalized),
  };

  return deepFreeze({
    schema: "pi-tool-boundary-admitted-operation/v1",
    callId,
    leaseId,
    clientSessionId,
    clientEpoch,
    operation: normalized,
    effect,
    durability,
    workspaceGeneration,
    expectedWorkspaceGeneration: expectedGeneration,
    timeoutMs,
    requestDigest: domainSeparatedDigest(
      "pi-tool-boundary/requested-call/v1",
      requestBody,
    ),
  });
}
