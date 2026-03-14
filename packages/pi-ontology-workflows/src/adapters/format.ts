import type {
  OntologyChangeResult,
  OntologyInspectResult,
  ValidationFinding,
} from "../core/contracts.ts";

export function formatInspectResult(result: OntologyInspectResult): string {
  const lines = [
    "# Ontology Inspect",
    "",
    `- scope: ${result.target.scope}`,
    `- repo: ${result.target.repoPath}`,
    `- repo_kind: ${result.target.repoKind}`,
    `- workspace_root: ${result.target.workspaceRoot}`,
    `- reasons: ${result.target.reasons.join("; ")}`,
  ];

  if (result.status) {
    lines.push(
      "",
      "## Status",
      `- concepts: ${result.status.counts.concepts}`,
      `- relations: ${result.status.counts.relations}`,
      `- layers: ${result.status.layers.length}`,
    );
    for (const layer of result.status.layers) {
      lines.push(`  - ${layer.name}: ${layer.origin} (${layer.kind}, source=${layer.source})`);
    }
    if (result.status.validation) {
      lines.push("", "## Validation", `- ok: ${result.status.validation.ok ? "yes" : "no"}`);
      if (!result.status.validation.ok) {
        lines.push(...formatFindings(result.status.validation.findings));
      }
    }
  }

  if (result.search) {
    lines.push("", `## Search — ${result.search.query}`);
    if (result.search.hits.length === 0) {
      lines.push("- no hits");
    }
    for (const hit of result.search.hits) {
      lines.push(
        `- ${hit.ontId} [${hit.kind}] (${hit.layer}) score=${hit.score}`,
        `  labels: ${hit.labels.join(", ") || "-"}`,
        `  title: ${hit.title || "-"}`,
        `  definition: ${truncate(hit.definition, 160)}`,
        `  path: ${hit.path}`,
      );
    }
  }

  if (result.pack) {
    lines.push("", `## Pack — ${result.pack.ontId}`, "", result.pack.text.trim());
  }

  if (result.warnings.length > 0) {
    lines.push("", "## Warnings", ...result.warnings.map((warning) => `- ${warning}`));
  }

  return `${lines.join("\n").trim()}\n`;
}

export function formatChangeResult(result: OntologyChangeResult): string {
  const lines = [
    "# Ontology Change",
    "",
    `- applied: ${result.applied ? "yes" : "no"}`,
    `- scope: ${result.target.scope}`,
    `- repo: ${result.target.repoPath}`,
    `- reasons: ${result.target.reasons.join("; ")}`,
    "",
    "## Planned writes",
  ];

  for (const write of result.writes) {
    lines.push(
      `- ${write.summary}`,
      `  path: ${write.path}`,
      `  existed: ${write.existed ? "yes" : "no"}`,
    );
  }

  if (result.validation) {
    lines.push("", "## Validation", `- ok: ${result.validation.ok ? "yes" : "no"}`);
    if (!result.validation.ok) lines.push(...formatFindings(result.validation.findings));
  }

  if (result.build) {
    lines.push(
      "",
      "## Build",
      `- ok: ${result.build.ok ? "yes" : "no"}`,
      `- summary_path: ${result.build.summaryPath || "-"}`,
      `- id_index_path: ${result.build.idIndexPath || "-"}`,
    );
  }

  if (result.warnings.length > 0) {
    lines.push("", "## Warnings", ...result.warnings.map((warning) => `- ${warning}`));
  }

  return `${lines.join("\n").trim()}\n`;
}

function formatFindings(findings: ValidationFinding[]): string[] {
  if (findings.length === 0) return ["- no findings"];
  return findings.slice(0, 12).map((finding) => {
    const pathLabel = finding.path ? ` (${finding.path})` : "";
    const rule = finding.rule_id ? `${finding.rule_id}: ` : "";
    return `- ${rule}${finding.message || "finding"}${pathLabel}`;
  });
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}
