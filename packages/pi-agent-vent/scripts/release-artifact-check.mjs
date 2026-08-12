// ---
// summary: validates packed file whitelists and local links in published markdown
// read_when:
//   - changing pi-agent-vent package contents or release artifact policy
// ---

import fs from "node:fs";
import path from "node:path";

export const normalizePackPath = (value) => String(value).replace(/^\.\//, "").replace(/\\/g, "/");

export const assertSafePackPath = (filePath) => {
  if (path.posix.isAbsolute(filePath) || filePath === ".." || filePath.split("/").includes("..")) {
    throw new Error(`npm pack output contains unsafe package path: ${filePath}`);
  }
  return filePath;
};

export const parsePackJson = (packJsonText, expectedIdentity = null) => {
  let pack;
  try {
    pack = JSON.parse(packJsonText || "[]");
  } catch (error) {
    throw new Error(`Could not parse npm pack --dry-run --json output: ${error.message}`);
  }

  let packEntry = null;
  if (Array.isArray(pack) && pack.length === 1) {
    [packEntry] = pack;
  } else if (pack && typeof pack === "object") {
    const entries = Object.entries(pack);
    if (entries.length === 1 && entries[0][0] === entries[0][1]?.name) {
      packEntry = entries[0][1];
    }
  }
  if (!packEntry || !Array.isArray(packEntry.files)) {
    throw new Error("Could not parse npm pack --dry-run --json output.");
  }
  if (
    expectedIdentity &&
    (packEntry.name !== expectedIdentity.name ||
      packEntry.version !== expectedIdentity.version ||
      packEntry.id !== `${expectedIdentity.name}@${expectedIdentity.version}`)
  ) {
    throw new Error(
      `npm pack identity mismatch: expected ${expectedIdentity.name}@${expectedIdentity.version}.`,
    );
  }

  return packEntry.files
    .map((file) => normalizePackPath(String(file.path || "")))
    .filter(Boolean)
    .map(assertSafePackPath)
    .sort();
};

export const readPackageFilesContract = (packageJsonPath = "package.json") => {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const filesEntries = Array.isArray(pkg.files)
    ? pkg.files.map((entry) => normalizePackPath(String(entry).trim())).filter(Boolean)
    : [];

  if (filesEntries.length === 0) {
    throw new Error(
      "package.json must define a non-empty files array for deterministic publish artifacts.",
    );
  }

  return filesEntries;
};

const isAlwaysIncluded = (filePath) =>
  /^README(?:\.[^/]+)?$/i.test(filePath) ||
  /^LICENSE(?:\.[^/]+)?$/i.test(filePath) ||
  /^NOTICE(?:\.[^/]+)?$/i.test(filePath);

export const validatePackageFilesWhitelist = ({
  actualFiles,
  filesEntries,
  cwd = process.cwd(),
}) => {
  const actualSet = new Set(actualFiles);
  const expectedExact = new Set(["package.json"]);
  const expectedDirPrefixes = [];

  for (const entry of filesEntries) {
    if (/[*?[]/.test(entry)) {
      throw new Error(
        `Unsupported files[] wildcard entry; use exact files or directories: ${entry}`,
      );
    }

    const fullPath = path.resolve(cwd, entry);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`files[] entry does not exist: ${entry}`);
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      expectedDirPrefixes.push(entry.endsWith("/") ? entry : `${entry}/`);
    } else {
      expectedExact.add(entry);
    }
  }

  const missing = [];
  for (const filePath of expectedExact) {
    if (!actualSet.has(filePath)) {
      missing.push(filePath);
    }
  }
  for (const prefix of expectedDirPrefixes) {
    if (!actualFiles.some((filePath) => filePath.startsWith(prefix))) {
      missing.push(`${prefix}*`);
    }
  }

  const extra = actualFiles.filter((filePath) => {
    if (expectedExact.has(filePath)) return false;
    if (expectedDirPrefixes.some((prefix) => filePath.startsWith(prefix))) return false;
    if (isAlwaysIncluded(filePath)) return false;
    return true;
  });

  return { missing, extra };
};

export const isExternalMarkdownDestination = (target) =>
  /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith("//");

export const markdownDestination = (rawTarget) => {
  let target = String(rawTarget || "").trim();
  if (!target) return "";
  if (target.startsWith("<")) {
    const closingAngle = target.indexOf(">");
    target = closingAngle >= 0 ? target.slice(1, closingAngle).trim() : target;
  } else {
    target = target.split(/\s+/, 1)[0] || "";
  }
  try {
    return decodeURI(target);
  } catch {
    return target;
  }
};

const markdownLinkPattern = /!?\[[^\]\n]*\]\(([^)\n]+)\)/g;
const referenceLinkDefinitionPattern = /^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*(\S.*)$/gm;

const collectMarkdownDestinations = (markdown) => [
  ...[...markdown.matchAll(markdownLinkPattern)].map((match) => match[1]),
  ...[...markdown.matchAll(referenceLinkDefinitionPattern)].map((match) => match[1]),
];

export const collectPackagedMarkdownLinkFailures = ({ actualFiles, readFile }) => {
  const actualSet = new Set(actualFiles);
  const failures = [];
  const packagedMarkdownFiles = actualFiles.filter((filePath) =>
    filePath.toLowerCase().endsWith(".md"),
  );

  for (const markdownPath of packagedMarkdownFiles) {
    const markdown = readFile(markdownPath);
    for (const rawTarget of collectMarkdownDestinations(markdown)) {
      const target = markdownDestination(rawTarget);
      if (!target || target.startsWith("#") || isExternalMarkdownDestination(target)) {
        continue;
      }

      const targetWithoutFragment = target.split("#", 1)[0].split("?", 1)[0];
      if (!targetWithoutFragment) {
        continue;
      }

      const normalizedTarget = normalizePackPath(
        path.posix.normalize(
          path.posix.join(path.posix.dirname(markdownPath), targetWithoutFragment),
        ),
      );
      if (
        path.posix.isAbsolute(targetWithoutFragment) ||
        normalizedTarget === ".." ||
        normalizedTarget.startsWith("../")
      ) {
        failures.push(`${markdownPath}: local link escapes package root: ${target}`);
        continue;
      }

      const directoryPrefix = normalizedTarget.endsWith("/")
        ? normalizedTarget
        : `${normalizedTarget}/`;
      const targetIsPackaged =
        actualSet.has(normalizedTarget) ||
        actualSet.has(`${normalizedTarget}.md`) ||
        actualFiles.some((filePath) => filePath.startsWith(directoryPrefix));
      if (!targetIsPackaged) {
        failures.push(`${markdownPath}: local link missing from npm artifact: ${target}`);
      }
    }
  }

  return { failures, packagedMarkdownCount: packagedMarkdownFiles.length };
};

export const runReleaseArtifactCheck = ({
  packJsonText,
  cwd = process.cwd(),
  log = console.log,
}) => {
  const manifestPath = path.join(cwd, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const actualFiles = parsePackJson(packJsonText, {
    name: manifest.name,
    version: manifest.version,
  });
  const filesEntries = readPackageFilesContract(manifestPath);
  const whitelist = validatePackageFilesWhitelist({ actualFiles, filesEntries, cwd });

  if (whitelist.missing.length || whitelist.extra.length) {
    const lines = ["Publish file whitelist mismatch."];
    if (whitelist.missing.length) lines.push(`Missing: ${whitelist.missing.join(", ")}`);
    if (whitelist.extra.length) lines.push(`Extra: ${whitelist.extra.join(", ")}`);
    throw new Error(lines.join("\n"));
  }

  const markdown = collectPackagedMarkdownLinkFailures({
    actualFiles,
    readFile: (filePath) => fs.readFileSync(path.join(cwd, filePath), "utf8"),
  });

  if (markdown.failures.length) {
    throw new Error(
      [
        "Packaged Markdown link check failed.",
        ...markdown.failures.map((failure) => `- ${failure}`),
      ].join("\n"),
    );
  }

  log(`File whitelist OK (${actualFiles.length} files).`);
  log(`Packaged Markdown links OK (${markdown.packagedMarkdownCount} files).`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runReleaseArtifactCheck({ packJsonText: process.env.PACK_JSON || "[]" });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
