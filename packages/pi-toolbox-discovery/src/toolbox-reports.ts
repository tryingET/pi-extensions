// ---
// summary: builds toolbox status and doctor reports from registrations, active tools, catalog entries, and leases.
// read_when:
//   - changing toolbox diagnostics or operator-facing health output.
// ---
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CATALOG } from "./toolbox-catalog.ts";
import {
  ALWAYS_ACTIVE_TOOLS,
  MISSING_REGISTRATION_CONTRACT,
  type ToolboxState,
} from "./toolbox-contract.ts";
import { describeLeases, getKnownToolNames } from "./toolbox-runtime.ts";

const catalogToolNames = () =>
  new Set(CATALOG.flatMap((bundle) => bundle.profiles.flatMap((profile) => profile.tools)));

const catalogToolBundleIndex = () => {
  const index = new Map<string, Set<string>>();
  for (const bundle of CATALOG) {
    for (const profile of bundle.profiles) {
      for (const tool of profile.tools) {
        const bundleIds = index.get(tool) ?? new Set<string>();
        bundleIds.add(bundle.id);
        index.set(tool, bundleIds);
      }
    }
  }
  return index;
};

export const findMissingCatalogRegistrations = (pi: ExtensionAPI): string[] => {
  const registered = getKnownToolNames(pi);
  return [...catalogToolNames()].filter((tool) => !registered.has(tool)).sort();
};

export const findUnleasedActiveCatalogTools = (pi: ExtensionAPI, state: ToolboxState): string[] => {
  const catalogTools = catalogToolNames();
  return pi
    .getActiveTools()
    .filter(
      (tool) =>
        catalogTools.has(tool) && !ALWAYS_ACTIVE_TOOLS.includes(tool) && !state.leases.has(tool),
    )
    .sort();
};

const groupToolsByBundle = (tools: string[]): string[] => {
  const index = catalogToolBundleIndex();
  const grouped = new Map<string, string[]>();

  for (const tool of tools) {
    const bundleIds = index.get(tool) ?? new Set<string>(["unknown"]);
    for (const bundleId of bundleIds) {
      const bundleTools = grouped.get(bundleId) ?? [];
      bundleTools.push(tool);
      grouped.set(bundleId, bundleTools);
    }
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bundleId, bundleTools]) => `${bundleId}: ${bundleTools.sort().join(", ")}`);
};

export const buildDoctorReport = (pi: ExtensionAPI, state: ToolboxState) => {
  const active = pi.getActiveTools();
  const registeredTools = pi.getAllTools().map((tool) => tool.name);
  const registered = new Set(registeredTools);
  const activeSet = new Set(active);
  const activeLeases = describeLeases(state);
  const missingAlwaysActiveRegistrations = ALWAYS_ACTIVE_TOOLS.filter(
    (tool) => !registered.has(tool),
  );
  const inactiveAlwaysActiveTools = ALWAYS_ACTIVE_TOOLS.filter(
    (tool) => registered.has(tool) && !activeSet.has(tool),
  );
  const missingCatalogRegistrations = findMissingCatalogRegistrations(pi);
  const missingCatalogRegistrationGroups = groupToolsByBundle(missingCatalogRegistrations).map(
    (group) => {
      const bundleId = group.split(":", 1)[0] ?? "unknown";
      const bundle = CATALOG.find((candidate) => candidate.id === bundleId);
      const owner = bundle?.ownerPackage ?? "unknown owner package";
      return `${group} — enable/install ${owner} and /reload or start a fresh session so Pi registers the tool schema before activation`;
    },
  );
  const unleasedActiveCatalogTools = findUnleasedActiveCatalogTools(pi, state);
  const leasedInactiveTools = [...state.leases.keys()]
    .filter((tool) => !activeSet.has(tool))
    .sort();
  const problems: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (missingAlwaysActiveRegistrations.length > 0) {
    problems.push(
      `missing registered baseline tools: ${missingAlwaysActiveRegistrations.join(", ")}`,
    );
    recommendations.push(
      "Enable/install the owner packages for missing foundational tools and /reload before relying on the standard startup profile.",
    );
  }
  if (inactiveAlwaysActiveTools.length > 0) {
    problems.push(`inactive baseline tools: ${inactiveAlwaysActiveTools.join(", ")}`);
    recommendations.push(
      "Run /reload or allow toolbox session_start to re-apply the always-active baseline.",
    );
  }
  if (missingCatalogRegistrations.length > 0) {
    warnings.push(
      `catalog tools not registered in this Pi runtime: ${missingCatalogRegistrations.join(", ")}`,
    );
    recommendations.push(MISSING_REGISTRATION_CONTRACT);
  }
  if (unleasedActiveCatalogTools.length > 0) {
    problems.push(`catalog tools active without a lease: ${unleasedActiveCatalogTools.join(", ")}`);
    recommendations.push(
      "Deactivate unneeded catalog tools or reactivate them through toolbox so TTL/pin state is explicit.",
    );
  }
  if (leasedInactiveTools.length > 0) {
    problems.push(`leased tools are not active: ${leasedInactiveTools.join(", ")}`);
    recommendations.push(
      "Run toolbox doctor after active-set recovery; use /reload if Pi cannot restore a lease-consistent active set.",
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Standard startup profile is healthy; activate registered latent tools only when the task needs them.",
    );
  }

  return {
    ok: problems.length === 0,
    activeTools: active,
    registeredTools,
    activeLeases,
    missingAlwaysActiveRegistrations,
    inactiveAlwaysActiveTools,
    missingCatalogRegistrations,
    missingCatalogRegistrationGroups,
    unleasedActiveCatalogTools,
    leasedInactiveTools,
    recommendations,
    problems,
    warnings,
  };
};

export const formatDoctor = (report: ReturnType<typeof buildDoctorReport>): string =>
  [
    "toolbox doctor",
    `- verdict: ${!report.ok ? "fail" : report.warnings.length > 0 ? "warn" : "pass"}`,
    `- active tools (${report.activeTools.length}): ${report.activeTools.join(", ") || "none"}`,
    `- registered tools (${report.registeredTools.length}): ${report.registeredTools.join(", ") || "none"}`,
    `- foundational baseline: ${
      report.missingAlwaysActiveRegistrations.length === 0 &&
      report.inactiveAlwaysActiveTools.length === 0
        ? "ok"
        : "needs attention"
    }`,
    `- missing baseline registrations (${report.missingAlwaysActiveRegistrations.length}): ${report.missingAlwaysActiveRegistrations.join(", ") || "none"}`,
    `- inactive baseline tools (${report.inactiveAlwaysActiveTools.length}): ${report.inactiveAlwaysActiveTools.join(", ") || "none"}`,
    `- active leases (${report.activeLeases.length}): ${report.activeLeases.join("; ") || "none"}`,
    `- missing catalog registrations (${report.missingCatalogRegistrations.length}): ${report.missingCatalogRegistrations.join(", ") || "none"}`,
    `- missing registration groups (${report.missingCatalogRegistrationGroups.length}): ${report.missingCatalogRegistrationGroups.join("; ") || "none"}`,
    `- unleased active catalog tools (${report.unleasedActiveCatalogTools.length}): ${report.unleasedActiveCatalogTools.join(", ") || "none"}`,
    `- leased inactive tools (${report.leasedInactiveTools.length}): ${report.leasedInactiveTools.join(", ") || "none"}`,
    `- warnings: ${report.warnings.join(" ") || "none"}`,
    `- recommendations: ${report.recommendations.join(" ")}`,
  ].join("\n");

export const formatStatus = (pi: ExtensionAPI, state: ToolboxState): string => {
  const active = pi.getActiveTools();
  const all = pi.getAllTools();
  const registeredNames = new Set(all.map((tool) => tool.name));
  const latentCatalogTools = [...catalogToolNames()];
  const registeredCatalogTools = latentCatalogTools.filter((tool) => registeredNames.has(tool));
  const unavailableCatalogTools = latentCatalogTools.filter((tool) => !registeredNames.has(tool));
  const activeLeases = describeLeases(state);
  const doctorReport = buildDoctorReport(pi, state);

  return [
    "toolbox status",
    `- active tools (${active.length}): ${active.join(", ") || "none"}`,
    `- registered tools (${all.length}): ${all.map((tool) => tool.name).join(", ") || "none"}`,
    `- catalog bundles (${CATALOG.length}): ${CATALOG.map((bundle) => bundle.id).join(", ")}`,
    `- registered catalog tools (${registeredCatalogTools.length}): ${registeredCatalogTools.join(", ") || "none"}`,
    `- not currently registered (${unavailableCatalogTools.length}): ${unavailableCatalogTools.join(", ") || "none"}`,
    `- active leases (${activeLeases.length}): ${activeLeases.join("; ") || "none"}`,
    `- baseline health: ${
      doctorReport.missingAlwaysActiveRegistrations.length === 0 &&
      doctorReport.inactiveAlwaysActiveTools.length === 0
        ? "ok"
        : "needs attention"
    }`,
    `- missing catalog registrations (${doctorReport.missingCatalogRegistrations.length}): ${doctorReport.missingCatalogRegistrations.join(", ") || "none"}`,
    `- unleased active catalog tools (${doctorReport.unleasedActiveCatalogTools.length}): ${doctorReport.unleasedActiveCatalogTools.join(", ") || "none"}`,
    `- leased inactive tools (${doctorReport.leasedInactiveTools.length}): ${doctorReport.leasedInactiveTools.join(", ") || "none"}`,
    "- startup profile: standard active set is verified on session_start when these tools are registered; lease bookkeeping is cleared only after verification.",
  ].join("\n");
};
