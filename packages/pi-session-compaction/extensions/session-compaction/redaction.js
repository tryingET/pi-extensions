/**
summary: "Redacts high-confidence credential shapes from compaction inputs and outputs."
read_when:
  - "Changing secret detection, redaction placeholders, or structured-value sanitization."
*/
import { createHash } from "node:crypto";

export const REDACTION_PLACEHOLDER_RE = /\[REDACTED:[a-z0-9_-]+:[a-f0-9]{12}\]/giu;

const SECRET_PATTERNS = [
  {
    kind: "private_key",
    pattern:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/gu,
  },
  {
    kind: "github_token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})\b/gu,
  },
  {
    kind: "openai_token",
    pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/gu,
  },
  {
    kind: "slack_token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/gu,
  },
  {
    kind: "aws_access_key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu,
  },
  {
    kind: "google_api_key",
    pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/gu,
  },
  {
    kind: "npm_token",
    pattern: /\bnpm_[A-Za-z0-9]{30,}\b/gu,
  },
  {
    kind: "pypi_token",
    pattern: /\bpypi-[A-Za-z0-9_-]{30,}\b/gu,
  },
  {
    kind: "bearer_token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{24,}={0,2}\b/giu,
  },
  {
    kind: "url_credentials",
    pattern: /\bhttps?:\/\/[^\s/:@]{1,128}:[^\s/@]{8,}@[^\s/]+/giu,
  },
  {
    kind: "credential_assignment",
    pattern:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|secret|token)\b\s*(?:=|:)\s*["']?([^\s"'`,;]{12,})["']?/giu,
    preservePrefix: true,
  },
];

function normalizeText(value) {
  return typeof value === "string" ? value : String(value ?? "");
}

export function secretFingerprint(value) {
  return createHash("sha256").update(normalizeText(value)).digest("hex").slice(0, 12);
}

function placeholder(kind, value) {
  return `[REDACTED:${kind}:${secretFingerprint(value)}]`;
}

function replaceAssignment(match, captured, kind) {
  const value = captured || match;
  const index = captured ? match.lastIndexOf(captured) : -1;
  if (index < 0) return placeholder(kind, value);
  return `${match.slice(0, index)}${placeholder(kind, value)}${match.slice(index + captured.length)}`;
}

function uniqueRedactions(redactions) {
  const seen = new Set();
  const out = [];
  for (const redaction of redactions) {
    const key = `${redaction.kind}:${redaction.fingerprint}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(redaction);
  }
  return out;
}

export function redactSecrets(value) {
  let text = normalizeText(value);
  const redactions = [];

  for (const entry of SECRET_PATTERNS) {
    entry.pattern.lastIndex = 0;
    text = text.replace(entry.pattern, (...args) => {
      const match = args[0];
      const captured = entry.preservePrefix ? args[1] : undefined;
      if (REDACTION_PLACEHOLDER_RE.test(captured || match)) {
        REDACTION_PLACEHOLDER_RE.lastIndex = 0;
        return match;
      }
      REDACTION_PLACEHOLDER_RE.lastIndex = 0;
      const secretValue = captured || match;
      redactions.push({
        kind: entry.kind,
        fingerprint: secretFingerprint(secretValue),
      });
      return entry.preservePrefix
        ? replaceAssignment(match, captured, entry.kind)
        : placeholder(entry.kind, secretValue);
    });
  }

  return {
    text,
    redactions: uniqueRedactions(redactions),
  };
}

export function containsPotentialSecret(value) {
  const text = normalizeText(value).replace(REDACTION_PLACEHOLDER_RE, "[REDACTED]");
  for (const entry of SECRET_PATTERNS) {
    entry.pattern.lastIndex = 0;
    if (entry.pattern.test(text)) return true;
  }
  return false;
}

export function sanitizeDisplayText(value, options = {}) {
  const maxChars = Number.isFinite(options.maxChars)
    ? Math.max(0, Math.floor(options.maxChars))
    : undefined;
  const raw = normalizeText(value).replaceAll("\u0000", "");
  const redacted = redactSecrets(raw);
  let text =
    options.singleLine === true
      ? redacted.text.replace(/[\r\n\t]+/gu, " ").replace(/\s{2,}/gu, " ")
      : redacted.text;
  let truncated = false;

  if (maxChars !== undefined && text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n\n[... truncated at ${maxChars} characters ...]`;
    truncated = true;
  }

  return {
    text,
    redactions: redacted.redactions,
    truncated,
  };
}

export function redactStructuredValue(value, options = {}) {
  const maxStringChars = Number.isFinite(options.maxStringChars)
    ? Math.max(0, Math.floor(options.maxStringChars))
    : 2_000;
  const maxDepth = Number.isFinite(options.maxDepth)
    ? Math.max(0, Math.floor(options.maxDepth))
    : 5;
  const maxArrayItems = Number.isFinite(options.maxArrayItems)
    ? Math.max(0, Math.floor(options.maxArrayItems))
    : 50;
  const maxObjectEntries = Number.isFinite(options.maxObjectEntries)
    ? Math.max(0, Math.floor(options.maxObjectEntries))
    : 100;
  const redactions = [];

  function visit(current, depth) {
    if (depth > maxDepth) return "[omitted: max depth]";
    if (typeof current === "string") {
      const sanitized = sanitizeDisplayText(current, { maxChars: maxStringChars });
      redactions.push(...sanitized.redactions);
      return sanitized.text;
    }
    if (
      current === null ||
      typeof current === "number" ||
      typeof current === "boolean" ||
      current === undefined
    ) {
      return current;
    }
    if (Array.isArray(current)) {
      return current.slice(0, maxArrayItems).map((item) => visit(item, depth + 1));
    }
    if (typeof current === "object") {
      const out = {};
      for (const [key, item] of Object.entries(current).slice(0, maxObjectEntries)) {
        if (/^(?:authorization|cookie|set-cookie|proxy-authorization)$/iu.test(key)) {
          const raw = normalizeText(item);
          const fingerprint = secretFingerprint(raw);
          redactions.push({ kind: "sensitive_header", fingerprint });
          out[key] = placeholder("sensitive_header", raw);
          continue;
        }
        out[key] = visit(item, depth + 1);
      }
      return out;
    }
    return String(current);
  }

  return {
    value: visit(value, 0),
    redactions: uniqueRedactions(redactions),
  };
}
