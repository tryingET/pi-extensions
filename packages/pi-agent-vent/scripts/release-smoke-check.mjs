import fs from "node:fs";
import path from "node:path";

export const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

export const packageSourcesFromSettings = (settings) => {
  const packages = Array.isArray(settings?.packages) ? settings.packages : [];
  return packages
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (entry && typeof entry === "object" && typeof entry.source === "string") {
        return entry.source;
      }
      return undefined;
    })
    .filter(Boolean);
};

export const assertPackageSpecInstalled = ({ settings, packageSpec }) => {
  if (!packageSpec || typeof packageSpec !== "string") {
    throw new Error("PACKAGE_SPEC is required for release smoke validation.");
  }

  const sources = packageSourcesFromSettings(settings);
  if (!sources.includes(packageSpec)) {
    throw new Error(
      [
        `Installed package spec not found in isolated pi settings: ${packageSpec}`,
        `Found: ${sources.join(", ") || "(none)"}`,
      ].join("\n"),
    );
  }
};

const normalizePathForOutput = (value) => path.resolve(value).replace(/\\/g, "/");
const normalizeOutput = (value) => String(value || "").replace(/\\/g, "/");

export const assertInstalledArtifactPackage = ({ packageRoot, packageName, packageVersion }) => {
  if (!packageRoot || typeof packageRoot !== "string") {
    throw new Error("packageRoot is required for release smoke validation.");
  }

  const packageJsonPath = path.join(packageRoot, "package.json");
  const extensionPath = path.join(packageRoot, "extensions", "agent-vent.ts");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Installed package.json not found: ${packageJsonPath}`);
  }
  if (!fs.existsSync(extensionPath)) {
    throw new Error(`Installed agent_vent extension not found: ${extensionPath}`);
  }

  const pkg = readJsonFile(packageJsonPath);
  if (pkg.name !== packageName) {
    throw new Error(`Installed package name mismatch: expected ${packageName}, got ${pkg.name}`);
  }
  if (pkg.version !== packageVersion) {
    throw new Error(
      `Installed package version mismatch: expected ${packageVersion}, got ${pkg.version}`,
    );
  }
  const extensions = Array.isArray(pkg.pi?.extensions) ? pkg.pi.extensions : [];
  if (!extensions.includes("./extensions/agent-vent.ts")) {
    throw new Error("Installed package pi.extensions does not include ./extensions/agent-vent.ts");
  }

  return { packageJsonPath, extensionPath };
};

export const assertAgentVentPathSmokeOutput = ({ output, ventDir }) => {
  if (!ventDir || typeof ventDir !== "string") {
    throw new Error("ventDir is required for release smoke validation.");
  }

  const normalizedOutput = normalizeOutput(output);
  const normalizedVentDir = normalizePathForOutput(ventDir);
  const expectedStore = `${normalizedVentDir}/vents.jsonl`;
  const expectedReview = `${normalizedVentDir}/review-events.jsonl`;
  const expectedCuration = `${normalizedVentDir}/curation-events.jsonl`;
  const expectedRetention = `${normalizedVentDir}/retention-events.jsonl`;
  const expectedBackups = `${normalizedVentDir}/backups`;

  const requiredFragments = [
    `Agent vent store: ${expectedStore}`,
    `Agent vent review events: ${expectedReview}`,
    `Agent vent curation events: ${expectedCuration}`,
    `Agent vent retention events: ${expectedRetention}`,
    `Agent vent retention backups: ${expectedBackups}`,
    "Override: set PI_AGENT_VENT_DIR",
    "not tasks, issues, incidents, evidence, telemetry, or ASC/self state",
  ];

  const missing = requiredFragments.filter((fragment) => !normalizedOutput.includes(fragment));
  if (missing.length) {
    throw new Error(
      [
        "Installed /agent_vent path smoke output did not match the expected local diagnostic contract.",
        ...missing.map((fragment) => `Missing: ${fragment}`),
      ].join("\n"),
    );
  }

  const defaultStoreFragment = "/.pi/agent/agent-vent/vents.jsonl";
  if (normalizedOutput.includes(defaultStoreFragment)) {
    throw new Error(
      "Installed /agent_vent path smoke used the default operator vent store instead of the isolated PI_AGENT_VENT_DIR.",
    );
  }
};

const readArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const runCli = () => {
  const [command, ...args] = process.argv.slice(2);

  if (command === "assert-settings") {
    const settingsPath = readArgValue(args, "--settings");
    const packageSpec = readArgValue(args, "--package-spec");
    if (!settingsPath) throw new Error("--settings is required");
    assertPackageSpecInstalled({ settings: readJsonFile(settingsPath), packageSpec });
    console.log("Isolated pi settings include installed package spec.");
    return;
  }

  if (command === "assert-installed-artifact") {
    const packageRoot = readArgValue(args, "--package-root");
    const packageName = readArgValue(args, "--package-name");
    const packageVersion = readArgValue(args, "--package-version");
    assertInstalledArtifactPackage({ packageRoot, packageName, packageVersion });
    console.log("Installed package artifact exposes the agent_vent extension entrypoint.");
    return;
  }

  if (command === "assert-command-output") {
    const outputPath = readArgValue(args, "--output");
    const ventDir = readArgValue(args, "--vent-dir");
    if (!outputPath) throw new Error("--output is required");
    assertAgentVentPathSmokeOutput({ output: fs.readFileSync(outputPath, "utf8"), ventDir });
    console.log("Installed /agent_vent path command smoke output OK.");
    return;
  }

  throw new Error(
    "Usage: node ./scripts/release-smoke-check.mjs <assert-settings|assert-installed-artifact|assert-command-output> ...",
  );
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
