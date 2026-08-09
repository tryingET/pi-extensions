// ---
// summary: "Builds and renders stable list and resolved-host payloads for the Pi host canary CLI."
// read_when:
//   - "Changing canary JSON payload fields or human-readable list/host output."
// ---
import {
  resolveProfileHost,
  resolveScenarioPackageTargets,
  selectScenarios,
} from "./manifest.mjs";
import { commandToString } from "./host-state.mjs";

export function resolveHostPayload(manifest, options) {
  const profile = options.profile ?? manifest.defaultProfile;
  const host = resolveProfileHost(manifest, profile);
  return {
    manifestPath: manifest.manifestPath,
    profile,
    hostPackage: manifest.hostPackage,
    hostCompanionPackages: manifest.hostCompanionPackages,
    trackedChangelog: manifest.trackedChangelog,
    host,
  };
}

export function scenarioFields(scenario) {
  const { id, title, cwd, command, packages, upstreamSurfaces, owner, why, notes } = scenario;
  return { id, title, cwd, command, packages, upstreamSurfaces, owner, why, notes };
}

export function scenarioHostResult(host, preparation, restoration) {
  return {
    packageName: host.packageName,
    version: host.version,
    reviewAnchor: host.reviewAnchor,
    preparation,
    restoration,
  };
}

export function listPayload(manifest, options) {
  const selection = selectScenarios(manifest, options);
  const host = resolveProfileHost(manifest, selection.profile);
  return {
    manifestPath: manifest.manifestPath,
    hostPackage: manifest.hostPackage,
    hostCompanionPackages: manifest.hostCompanionPackages,
    trackedChangelog: manifest.trackedChangelog,
    profile: selection.profile,
    profiles: manifest.profiles,
    host,
    scenarios: selection.scenarios.map((scenario) => ({
      ...scenarioFields(scenario),
      packageRoots: resolveScenarioPackageTargets(scenario).map((entry) => ({
        declaredPath: entry.declaredPath,
        packagePath: entry.packagePath,
        mode: entry.mode,
      })),
    })),
  };
}

export function printHostContract(payload) {
  const { host } = payload;
  const fields = {
    host_package: host.packageName,
    host_version: host.version,
    host_version_source: host.versionSource,
    review_anchor: host.reviewAnchor,
    review_anchor_source: host.reviewAnchorSource,
    tracked_changelog: payload.trackedChangelog,
    host_companion_packages: host.companionPackages.join(", ") || "none",
  };
  for (const [name, value] of Object.entries(fields)) console.log(`- ${name}: ${value}`);
}

export function printResolvedHost(payload) {
  console.log(`# Pi host compatibility host contract (${payload.profile})\n`);
  printHostContract(payload);
}

export function printList(payload) {
  console.log(`# Pi host compatibility canary (${payload.profile})\n`);
  printHostContract(payload);
  console.log(`- scenarios: ${payload.scenarios.length}\n`);

  for (const scenario of payload.scenarios) {
    console.log(`## ${scenario.id}`);
    console.log(scenario.title);
    console.log(`- owner: ${scenario.owner}`);
    console.log(`- packages: ${scenario.packages.join(", ")}`);
    if (Array.isArray(scenario.packageRoots) && scenario.packageRoots.length > 0) {
      console.log(`- package_roots: ${scenario.packageRoots.map((entry) => entry.packagePath).join(", ")}`);
    }
    console.log(`- upstream_surfaces: ${scenario.upstreamSurfaces.join(", ")}`);
    console.log(`- cwd: ${scenario.cwd}`);
    console.log(`- command: ${commandToString(scenario.command)}`);
    console.log(`- why: ${scenario.why}`);
    if (scenario.notes) {
      console.log(`- notes: ${scenario.notes}`);
    }
    console.log("");
  }
}
