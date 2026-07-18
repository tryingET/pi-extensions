export function appendBoundedString(
  current: string,
  addition: string,
  maxChars: number,
): { value: string; truncated: boolean } {
  if (maxChars <= 0) {
    return { value: "", truncated: current.length > 0 || addition.length > 0 };
  }

  if (current.length >= maxChars) {
    return { value: current, truncated: addition.length > 0 };
  }

  const remaining = maxChars - current.length;
  if (addition.length <= remaining) {
    return { value: current + addition, truncated: false };
  }

  return {
    value: current + addition.slice(0, remaining),
    truncated: true,
  };
}

export function redactSubagentDiagnosticText(value: string): string {
  const credentialKey =
    "(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key|authorization|password|passphrase|token)";
  const completeJsonCredential = new RegExp(
    `(["']${credentialKey}["']\\s*:\\s*["'])([^"']*)(["'])`,
    "giu",
  );
  const unterminatedJsonCredential = new RegExp(
    `(["']${credentialKey}["']\\s*:\\s*)(["'])([^"']*)$`,
    "giu",
  );
  const assignedCredential = new RegExp(`(\\b${credentialKey}\\b\\s*[:=]\\s*)([^\\s,;]+)`, "giu");

  return value
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
      "[REDACTED PRIVATE KEY]",
    )
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*$/gu, "[REDACTED PRIVATE KEY]")
    .replace(completeJsonCredential, "$1[REDACTED]$3")
    .replace(unterminatedJsonCredential, "$1$2[REDACTED]$2")
    .replace(/(\bauthorization\b\s*[:=]\s*)(?:(?:bearer|basic)\s+)?([^\s,;]+)/giu, "$1[REDACTED]")
    .replace(assignedCredential, "$1[REDACTED]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{8,16}\b/gu, "[REDACTED AWS ACCESS KEY]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/gu, "[REDACTED GITHUB TOKEN]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, "[REDACTED API TOKEN]")
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/gu, "[REDACTED JWT]");
}

export function readNonNegativeIntEnv(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = process.env[name]?.trim();
    if (!raw) {
      continue;
    }

    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return fallback;
}
