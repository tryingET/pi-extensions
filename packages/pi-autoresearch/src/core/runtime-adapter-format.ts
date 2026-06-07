import type {
  AutoresearchAdapterContractCatalog,
  AutoresearchAdapterPacketValidationResult,
} from "./runtime-adapter.ts";

export function formatAutoresearchAdapterContractCatalog(
  catalog: AutoresearchAdapterContractCatalog,
): string {
  const entries = catalog.entries.flatMap((entry) => [
    `- ${entry.packetKind}`,
    `  - version: ${entry.adapterContractVersion}`,
    `  - producer: ${entry.producerAction}`,
    `  - targets: ${entry.targetKinds.join(", ")}`,
    `  - required fields: ${entry.requiredFields.join(", ")}`,
    `  - optional fields: ${entry.optionalFields.length > 0 ? entry.optionalFields.join(", ") : "(none)"}`,
    `  - summary: ${entry.summary}`,
    `  - boundary: ${entry.boundary}`,
  ]);

  return [
    "# PI-AUTORESEARCH ADAPTER CONTRACT CATALOG",
    "",
    `- packet kind: ${catalog.packetKind}`,
    `- adapter contract version: ${catalog.adapterContractVersion}`,
    `- target kinds: ${catalog.targetKinds.join(", ")}`,
    `- adapter boundary: ${catalog.adapterBoundary}`,
    "",
    "## Packet contracts",
    ...entries,
  ].join("\n");
}

export function formatAutoresearchAdapterPacketValidationResult(
  result: AutoresearchAdapterPacketValidationResult,
): string {
  const issueLines = result.issues.map((issue) => `- ${issue.path}: ${issue.message}`);
  return [
    "# PI-AUTORESEARCH ADAPTER PACKET VALIDATION",
    "",
    `- packet kind: ${result.packetKind}`,
    `- adapter contract version: ${result.adapterContractVersion}`,
    `- target kinds: ${result.targetKinds.join(", ")}`,
    `- valid: ${result.valid ? "yes" : "no"}`,
    `- validated packet kind: ${result.validatedPacketKind ?? "(unknown)"}`,
    `- validated version: ${result.validatedVersion ?? "(unknown)"}`,
    `- adapter boundary: ${result.adapterBoundary}`,
    "",
    "## Issues",
    ...(issueLines.length > 0 ? issueLines : ["- (none)"]),
  ].join("\n");
}
