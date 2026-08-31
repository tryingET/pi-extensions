// ---
// summary: bounded template provenance and exact-role collision helpers for fleet lint.
// read_when:
//   - changing Copier lineage diagnostics, template ownership recognition, or role normalization.
// ---

import { basename, isAbsolute, resolve } from "node:path";
import { type FleetGitSnapshot, verifyFleetGitRevision } from "./fleet-git-snapshot.ts";
import type { FleetLintDiagnostic, FleetLintRepositoryResult } from "./fleet-lint-types.ts";

const FULL_REVISION = /^[0-9a-f]{40,64}$/u;
const ANSWERS_PATH = ".copier-answers.yml";
const OWNERSHIP_PATH = "contracts/template-ownership.yml";

function decodeOwnerUtf8(bytes: Buffer, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not strict UTF-8`);
  }
}

function isPythonWhitespace(code: number): boolean {
  return (
    (code >= 0x0009 && code <= 0x000d) ||
    (code >= 0x001c && code <= 0x001f) ||
    code === 0x0020 ||
    code === 0x0085 ||
    code === 0x00a0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

function pythonStrip(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isPythonWhitespace(value.charCodeAt(start))) start += 1;
  while (end > start && isPythonWhitespace(value.charCodeAt(end - 1))) end -= 1;
  return value.slice(start, end);
}

function pythonSplitLines(value: string): string[] {
  const lines: string[] = [];
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const separator =
      code === 10 ||
      code === 11 ||
      code === 12 ||
      code === 13 ||
      (code >= 28 && code <= 30) ||
      code === 133 ||
      code === 8232 ||
      code === 8233;
    if (!separator) {
      current += value[index];
      continue;
    }
    lines.push(current);
    current = "";
    if (code === 13 && value.charCodeAt(index + 1) === 10) index += 1;
  }
  if (current) lines.push(current);
  return lines;
}

function parseCopierScalar(raw: string, label: string): string {
  if (!raw || "!&*|>{[".includes(raw[0] ?? "")) {
    throw new Error(`${label} uses unsupported YAML syntax`);
  }
  let value: unknown;
  if (raw.startsWith('"')) {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error(`${label} has invalid double-quoted syntax`);
    }
  } else if (raw.startsWith("'")) {
    if (raw.length < 2 || !raw.endsWith("'")) {
      throw new Error(`${label} has invalid single-quoted syntax`);
    }
    value = raw.slice(1, -1).replace(/''/gu, "'");
  } else {
    if (raw.includes(" #")) throw new Error(`${label} cannot contain an inline comment`);
    value = raw;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be one non-empty scalar`);
  }
  return value;
}

function copierScalar(text: string, key: string, required = false): string | undefined {
  const prefix = `${key}:`;
  const values = pythonSplitLines(text)
    .filter((line) => line.startsWith(prefix))
    .map((line) => pythonStrip(line.slice(prefix.length)));
  if (values.length === 0) {
    if (required) throw new Error(`${key} must occur exactly once`);
    return undefined;
  }
  if (values.length !== 1) throw new Error(`${key} must occur exactly once`);
  return parseCopierScalar(values[0] ?? "", key);
}

export function parseFleetCopierSource(text: string): string {
  const source = copierScalar(text, "_src_path", true);
  if (source === undefined) throw new Error("_src_path must occur exactly once");
  return source;
}

function ownershipPatternsOverlap(left: string, right: string): boolean {
  const leftPrefix = left.endsWith("/**") ? left.slice(0, -3).replace(/\/+$/u, "") : undefined;
  const rightPrefix = right.endsWith("/**") ? right.slice(0, -3).replace(/\/+$/u, "") : undefined;
  if (leftPrefix === undefined && rightPrefix === undefined) return left === right;
  if (leftPrefix !== undefined && rightPrefix !== undefined) {
    return (
      leftPrefix === rightPrefix ||
      leftPrefix.startsWith(`${rightPrefix}/`) ||
      rightPrefix.startsWith(`${leftPrefix}/`)
    );
  }
  if (leftPrefix !== undefined) return right === leftPrefix || right.startsWith(`${leftPrefix}/`);
  return left === rightPrefix || left.startsWith(`${rightPrefix}/`);
}

export function parseFleetTemplateOwnership(text: string): {
  templateOwned: string[];
  agentOwned: string[];
} {
  let section: "template_owned" | "agent_owned" | undefined;
  let schema = "";
  const sections = { template_owned: [] as string[], agent_owned: [] as string[] };
  for (const [index, raw] of pythonSplitLines(text).entries()) {
    const line = pythonStrip(raw);
    if (!line || line.startsWith("#")) continue;
    if (raw === line && line.startsWith("schema:")) {
      schema = pythonStrip(line.slice("schema:".length));
      section = undefined;
      continue;
    }
    if (raw === line && (line === "template_owned:" || line === "agent_owned:")) {
      section = line.slice(0, -1) as typeof section;
      continue;
    }
    if (section && raw.startsWith("  - ")) {
      const pattern = pythonStrip(raw.slice(4));
      if (!pattern || pattern.startsWith("/") || pattern.split("/").includes("..")) {
        throw new Error(`invalid ownership pattern at line ${index + 1}`);
      }
      sections[section].push(pattern);
      continue;
    }
    throw new Error(`unsupported ownership syntax at line ${index + 1}`);
  }
  if (schema !== "ai-society.template-ownership/1") {
    throw new Error("unsupported template ownership schema");
  }
  if (sections.template_owned.length === 0 || sections.agent_owned.length === 0) {
    throw new Error("ownership map requires non-empty template_owned and agent_owned lists");
  }
  for (const [name, patterns] of Object.entries(sections)) {
    if (new Set(patterns).size !== patterns.length) {
      throw new Error(`duplicate pattern in ${name}`);
    }
  }
  for (const templatePattern of sections.template_owned) {
    for (const agentPattern of sections.agent_owned) {
      if (ownershipPatternsOverlap(templatePattern, agentPattern)) {
        throw new Error(`ambiguous ownership patterns: ${templatePattern} and ${agentPattern}`);
      }
    }
  }
  return { templateOwned: sections.template_owned, agentOwned: sections.agent_owned };
}

export function validateFleetTemplateOwnershipPolicy(parsed: {
  templateOwned: string[];
  agentOwned: string[];
}): void {
  const requiredAgentOwned = [".copier-answers.yml", "agent.json", "docs/person/**"];
  if (requiredAgentOwned.some((entry) => !parsed.agentOwned.includes(entry))) {
    throw new Error("required agent-owned manifest/persona paths are missing");
  }
}

export function normalizeFleetRole(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
}

export async function inspectTemplateProvenance(params: {
  snapshot: FleetGitSnapshot;
  repoName: string;
}): Promise<{
  template: FleetLintRepositoryResult["template"];
  diagnostics: FleetLintDiagnostic[];
}> {
  const diagnostics: FleetLintDiagnostic[] = [];
  const [answersResult, ownershipResult] = await Promise.allSettled([
    params.snapshot.readFile(ANSWERS_PATH, 64 * 1024),
    params.snapshot.readFile(OWNERSHIP_PATH, 64 * 1024),
  ]);
  const answers = answersResult.status === "fulfilled" ? answersResult.value : undefined;
  const ownership = ownershipResult.status === "fulfilled" ? ownershipResult.value : undefined;
  const answersCaptureFailed = answersResult.status === "rejected";
  const ownershipCaptureFailed = ownershipResult.status === "rejected";
  const template: FleetLintRepositoryResult["template"] = {
    mode: ownership ? "managed_v2" : answers && !ownershipCaptureFailed ? "legacy" : "unknown",
    provenanceStatus: answersCaptureFailed || ownershipCaptureFailed ? "invalid" : "unbound",
    ...(answers ? { answersSha256: answers.sha256 } : {}),
    ...(ownership ? { ownershipSha256: ownership.sha256 } : {}),
  };

  if (ownershipCaptureFailed) {
    diagnostics.push({
      code: "template.ownership_capture_failed",
      severity: "error",
      repo: params.repoName,
      path: OWNERSHIP_PATH,
      message: "committed template ownership bytes could not be captured within the lint bound",
    });
  }
  if (answersCaptureFailed) {
    diagnostics.push({
      code: "template.answers_capture_failed",
      severity: "error",
      repo: params.repoName,
      path: ANSWERS_PATH,
      message: "committed Copier provenance bytes could not be captured within the lint bound",
    });
  }

  if (ownership) {
    try {
      const parsed = parseFleetTemplateOwnership(
        decodeOwnerUtf8(ownership.bytes, "template ownership"),
      );
      validateFleetTemplateOwnershipPolicy(parsed);
    } catch {
      template.provenanceStatus = "invalid";
      diagnostics.push({
        code: "template.ownership_invalid",
        severity: "error",
        repo: params.repoName,
        path: OWNERSHIP_PATH,
        message: "template ownership does not satisfy the ratified parser and fleet path policy",
      });
    }
  }

  if (!answers) {
    if (!answersCaptureFailed) {
      diagnostics.push({
        code: "template.provenance_missing",
        severity: "warning",
        repo: params.repoName,
        path: ANSWERS_PATH,
        message: "repository has no committed Copier provenance answers",
        hint: "provenance remains unverifiable; do not re-render or infer template currentness",
      });
    }
    return { template, diagnostics };
  }

  let answersText: string;
  try {
    answersText = decodeOwnerUtf8(answers.bytes, "Copier answers");
  } catch {
    template.provenanceStatus = "invalid";
    diagnostics.push({
      code: "template.answers_invalid",
      severity: "error",
      repo: params.repoName,
      path: ANSWERS_PATH,
      message: "committed Copier provenance is not strict UTF-8",
    });
    return { template, diagnostics };
  }

  let sourcePath: string | undefined;
  let revision: string | undefined;
  try {
    sourcePath = parseFleetCopierSource(answersText);
    revision =
      copierScalar(answersText, "template_source_sha") ??
      copierScalar(answersText, "l0_source_sha") ??
      copierScalar(answersText, "_commit");
  } catch {
    template.provenanceStatus = "invalid";
    diagnostics.push({
      code: "template.answers_invalid",
      severity: "error",
      repo: params.repoName,
      path: ANSWERS_PATH,
      message: "committed Copier provenance uses unsupported or ambiguous scalar syntax",
    });
    return { template, diagnostics };
  }
  const resolvedSourcePath = sourcePath
    ? isAbsolute(sourcePath)
      ? sourcePath
      : resolve(params.snapshot.root, sourcePath)
    : undefined;
  if (revision && FULL_REVISION.test(revision)) template.sourceRevision = revision;
  if (
    revision &&
    FULL_REVISION.test(revision) &&
    resolvedSourcePath &&
    basename(resolvedSourcePath) === "tpl-agent-repo"
  ) {
    try {
      const verified = await verifyFleetGitRevision(resolvedSourcePath, revision, {
        requiredFiles: [
          "agent.json.j2",
          "copier.yml",
          "contracts/template-ownership.yml",
          "scripts/compile-system-prompt.py",
        ],
      });
      template.sourcePath = `${basename(verified.repoRoot) || "root"}/${verified.sourceRelative}`;
      template.sourceTreeOid = verified.treeOid;
      if (template.provenanceStatus !== "invalid") {
        template.provenanceStatus = "verified_local_source";
      }
    } catch {
      diagnostics.push({
        code: "template.revision_unverifiable",
        severity: template.mode === "managed_v2" ? "error" : "warning",
        repo: params.repoName,
        path: ANSWERS_PATH,
        message: "declared local template source revision could not be verified",
        hint: "a declared revision is not matched until the exact source Git object is locally verifiable",
      });
    }
  } else {
    diagnostics.push({
      code: revision ? "template.revision_invalid" : "template.revision_unbound",
      severity: template.mode === "managed_v2" ? "error" : "warning",
      repo: params.repoName,
      path: ANSWERS_PATH,
      message:
        revision && !FULL_REVISION.test(revision)
          ? "template provenance revision is not one full immutable Git object id"
          : "template provenance lacks a verifiable source path and immutable revision",
      hint: "record exact source revision only through the owning template propagation contract",
    });
  }
  return { template, diagnostics };
}
