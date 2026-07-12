// ---
// summary: supplies assertions and isolated tool-path probes for release smoke testing
// read_when:
//   - changing installed-artifact validation or agent_vent release smoke behavior
// ---

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

export const assertExactHostContract = ({ packageJson, hostVersion }) => {
  const piAi = packageJson?.devDependencies?.["@earendil-works/pi-ai"];
  const codingAgent = packageJson?.devDependencies?.["@earendil-works/pi-coding-agent"];
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(hostVersion || "")) {
    throw new Error(
      `Release smoke requires an exact Pi host version, got: ${hostVersion || "(empty)"}`,
    );
  }
  if (piAi !== hostVersion || codingAgent !== hostVersion) {
    throw new Error(
      `Release smoke host contract mismatch: pi=${hostVersion}, pi-ai=${piAi || "(missing)"}, pi-coding-agent=${codingAgent || "(missing)"}`,
    );
  }
  return hostVersion;
};

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

export const findPackageEntryBySource = (settings, packageSpec) => {
  const packages = Array.isArray(settings?.packages) ? settings.packages : [];
  return packages.find((entry) => {
    if (typeof entry === "string") return entry === packageSpec;
    return entry && typeof entry === "object" && entry.source === packageSpec;
  });
};

export const assertPackageSpecInstalled = ({ settings, packageSpec }) => {
  if (!packageSpec || typeof packageSpec !== "string") {
    throw new Error("PACKAGE_SPEC is required for release smoke validation.");
  }

  const entry = findPackageEntryBySource(settings, packageSpec);
  if (!entry) {
    const sources = packageSourcesFromSettings(settings);
    throw new Error(
      [
        `Installed package spec not found in isolated pi settings: ${packageSpec}`,
        `Found: ${sources.join(", ") || "(none)"}`,
      ].join("\n"),
    );
  }

  if (typeof entry !== "string") {
    throw new Error(
      "Release smoke requires an unfiltered package entry; object-form package filters could disable the extension under test.",
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

export const assertLocalTarballInstallSource = ({ packageSpec }) => {
  if (!packageSpec || typeof packageSpec !== "string") {
    throw new Error("PACKAGE_SPEC is required for local tarball install-source validation.");
  }
  if (!packageSpec.startsWith("npm:")) {
    throw new Error(`Release smoke expected an npm: tarball install source, got: ${packageSpec}`);
  }

  const tarballPath = packageSpec.slice("npm:".length);
  if (!path.isAbsolute(tarballPath) || !tarballPath.endsWith(".tgz")) {
    throw new Error(
      `Release smoke expected npm:<absolute .tgz path> as the install source, got: ${packageSpec}`,
    );
  }

  return { tarballPath };
};

export const buildLocalPathArtifactSettings = ({ settings, packageRoot }) => {
  if (!packageRoot || typeof packageRoot !== "string") {
    throw new Error("packageRoot is required for release smoke settings preparation.");
  }

  return {
    ...settings,
    packages: [packageRoot],
    extensions: [],
  };
};

export const buildInstalledArtifactSettings = buildLocalPathArtifactSettings;

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

const activeStoreArtifacts = (ventDir) => [
  path.join(ventDir, "vents.jsonl"),
  path.join(ventDir, "review-events.jsonl"),
  path.join(ventDir, "curation-events.jsonl"),
  path.join(ventDir, "retention-events.jsonl"),
  path.join(ventDir, "backups"),
];

const findNodeModulesAncestor = (startPath) => {
  let current = path.resolve(startPath);
  while (current && current !== path.dirname(current)) {
    if (path.basename(current) === "node_modules") return current;
    current = path.dirname(current);
  }
  return undefined;
};

const createImportablePackageShadow = (packageRoot) => {
  const resolvedPackageRoot = path.resolve(packageRoot);
  const shadowParent = fs.mkdtempSync(path.join(os.tmpdir(), "agent-vent-installed-shadow-"));
  const shadowRoot = path.join(shadowParent, "package");
  fs.cpSync(resolvedPackageRoot, shadowRoot, {
    recursive: true,
    filter: (sourcePath) => {
      const relativePath = path.relative(resolvedPackageRoot, sourcePath);
      return !relativePath.split(path.sep).includes("node_modules");
    },
  });

  const packageNodeModules = path.join(packageRoot, "node_modules");
  const dependencyRoot = fs.existsSync(packageNodeModules)
    ? packageNodeModules
    : findNodeModulesAncestor(packageRoot);
  if (dependencyRoot) {
    fs.symlinkSync(dependencyRoot, path.join(shadowRoot, "node_modules"), "dir");
  }

  return { shadowParent, shadowRoot };
};

export const executeInstalledArtifactToolPathSmoke = async ({ packageRoot, ventDir }) => {
  if (!packageRoot || typeof packageRoot !== "string") {
    throw new Error("packageRoot is required for installed tool smoke validation.");
  }
  if (!ventDir || typeof ventDir !== "string") {
    throw new Error("ventDir is required for installed tool smoke validation.");
  }

  const installedExtensionPath = path.join(packageRoot, "extensions", "agent-vent.ts");
  if (!fs.existsSync(installedExtensionPath)) {
    throw new Error(`Installed agent_vent extension not found: ${installedExtensionPath}`);
  }

  const tools = new Map();
  const commands = new Map();
  const shadow = createImportablePackageShadow(packageRoot);
  try {
    const extensionPath = path.join(shadow.shadowRoot, "extensions", "agent-vent.ts");
    const extensionModule = await import(pathToFileURL(extensionPath).href);
    if (typeof extensionModule.default !== "function") {
      throw new Error(
        `Installed agent_vent extension has no default factory: ${installedExtensionPath}`,
      );
    }

    extensionModule.default({
      registerTool(tool) {
        if (tool?.name) tools.set(tool.name, tool);
      },
      registerCommand(name, command) {
        commands.set(name, command);
      },
    });
  } finally {
    fs.rmSync(shadow.shadowParent, { recursive: true, force: true });
  }

  const tool = tools.get("agent_vent");
  if (!tool || typeof tool.execute !== "function") {
    throw new Error("Installed agent_vent extension did not register executable agent_vent tool.");
  }

  const artifacts = activeStoreArtifacts(ventDir);
  const existingArtifacts = new Set(
    artifacts.filter((artifactPath) => fs.existsSync(artifactPath)),
  );
  const oldVentDir = process.env.PI_AGENT_VENT_DIR;
  let result;
  try {
    process.env.PI_AGENT_VENT_DIR = ventDir;
    result = await tool.execute(
      "release-smoke-tool-path",
      { action: "path" },
      undefined,
      undefined,
      {
        cwd: packageRoot,
        sessionManager: { getSessionFile: () => undefined },
      },
    );
  } finally {
    if (oldVentDir === undefined) delete process.env.PI_AGENT_VENT_DIR;
    else process.env.PI_AGENT_VENT_DIR = oldVentDir;
  }

  const output = result?.content?.[0]?.text;
  if (typeof output !== "string") {
    throw new Error("Installed agent_vent tool path smoke did not return text content.");
  }

  assertAgentVentPathSmokeOutput({ output, ventDir });

  const createdArtifacts = artifacts.filter(
    (artifactPath) => !existingArtifacts.has(artifactPath) && fs.existsSync(artifactPath),
  );
  if (createdArtifacts.length) {
    throw new Error(
      [
        "Installed agent_vent tool path smoke created local store artifacts; action=path must stay no-store-read/no-store-write.",
        ...createdArtifacts.map((artifactPath) => `Created: ${artifactPath}`),
      ].join("\n"),
    );
  }

  return { output, executionMode: "shadow-copy", registeredCommandCount: commands.size };
};

const readArgValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
};

const runCli = async () => {
  const [command, ...args] = process.argv.slice(2);

  if (command === "assert-exact-host-contract") {
    const packageJsonPath = readArgValue(args, "--package-json");
    const hostVersion = readArgValue(args, "--host-version");
    if (!packageJsonPath) throw new Error("--package-json is required");
    assertExactHostContract({ packageJson: readJsonFile(packageJsonPath), hostVersion });
    console.log(`Exact Pi host contract selected: ${hostVersion}.`);
    return;
  }

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

  if (command === "assert-local-tarball-install-source") {
    const packageSpec = readArgValue(args, "--package-spec");
    assertLocalTarballInstallSource({ packageSpec });
    console.log(
      "Local npm:<tarball> package spec is validated as an install source; runtime discovery smoke uses the installed local package path.",
    );
    return;
  }

  if (
    command === "prepare-local-path-artifact-settings" ||
    command === "prepare-installed-artifact-settings"
  ) {
    const settingsPath = readArgValue(args, "--settings");
    const packageRoot = readArgValue(args, "--package-root");
    if (!settingsPath) throw new Error("--settings is required");
    const settings = readJsonFile(settingsPath);
    const nextSettings = buildLocalPathArtifactSettings({ settings, packageRoot });
    fs.writeFileSync(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");
    console.log(
      "Isolated pi settings now load the installed package artifact through local-path package discovery.",
    );
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

  if (command === "assert-installed-tool-path") {
    const packageRoot = readArgValue(args, "--package-root");
    const ventDir = readArgValue(args, "--vent-dir");
    await executeInstalledArtifactToolPathSmoke({ packageRoot, ventDir });
    console.log("Installed artifact shadow registered-tool path smoke output OK.");
    return;
  }

  throw new Error(
    "Usage: node ./scripts/release-smoke-check.mjs <assert-exact-host-contract|assert-settings|assert-local-tarball-install-source|assert-installed-artifact|prepare-local-path-artifact-settings|assert-command-output|assert-installed-tool-path> ...",
  );
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runCli();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
