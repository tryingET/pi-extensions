const HIGH_CONFIDENCE_CREDENTIAL_PATTERNS = [
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/u,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})\b/u,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/u,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/u,
  /\bxox[baprs]-[A-Za-z0-9-]{16,}\b/u,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/u,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
  /\bAIza[0-9A-Za-z_-]{30,}\b/u,
  /\bGOCSPX-[0-9A-Za-z_-]{16,}\b/u,
  /\bnpm_[A-Za-z0-9]{30,}\b/u,
  /\bpypi-[A-Za-z0-9_-]{30,}\b/u,
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/u,
  /\b(?:hf|r8)_[A-Za-z0-9]{20,}\b/u,
  /\b(?:shpat|shpca|shppa|shpss)_[A-Fa-f0-9]{24,}\b/u,
  /\bdop_v1_[A-Fa-f0-9]{32,}\b/u,
  /\bPMAK-[A-Za-z0-9_-]{20,}\b/u,
  /\bhvs\.[A-Za-z0-9_-]{20,}\b/u,
  /\bglsa_[A-Za-z0-9_-]{20,}\b/u,
  /\b(?:sq0atp|sq0csp)-[A-Za-z0-9_-]{20,}\b/u,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/u,
] as const;

/** Returns true only for strongly prefixed or structurally distinctive credential forms. */
export function containsHighConfidenceCredential(value: string): boolean {
  return HIGH_CONFIDENCE_CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value));
}
