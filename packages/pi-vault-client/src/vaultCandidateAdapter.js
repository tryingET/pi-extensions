function truncate(value, max = 90) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function facetLabel(template) {
  const artifactKind = template.artifact_kind || "procedure";
  const controlMode = template.control_mode || "one_shot";
  const formalizationLevel = template.formalization_level || "structured";
  return `${artifactKind}/${controlMode}/${formalizationLevel}`;
}

function governanceLabel(template) {
  const ownerCompany = template.owner_company || "core";
  const visibilityCompanies = Array.isArray(template.visibility_companies)
    ? template.visibility_companies.join(",")
    : "";
  return visibilityCompanies
    ? `owner=${ownerCompany}; visible=${visibilityCompanies}`
    : `owner=${ownerCompany}`;
}

export function toVaultCandidates(templates) {
  if (!Array.isArray(templates)) return [];

  return templates
    .filter(
      (template) =>
        template && typeof template.name === "string" && template.name.trim().length > 0,
    )
    .map((template) => ({
      id: template.name,
      label: `/vault:${template.name}`,
      detail:
        `[${facetLabel(template)}] ${governanceLabel(template)} — ${truncate(template.description || "")}`.trim(),
      preview: truncate(template.content || "", 180),
      source: "vault",
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
