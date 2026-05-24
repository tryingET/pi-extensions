import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
  repoRelativePathSafetyIssue,
  subprocessFailureDetail,
  symbolSeedSafetyIssue,
} from "./context-intake-safety.js";

const execFileAsync = promisify(execFile);
const ESTIMATED_BYTES_PER_TOKEN = 4;
const SCI_MAX_BUFFER = 96_000;
const SCI_TIMEOUT_MS = 10_000;
const DEFAULT_SUBPROCESS_PATH = "/usr/local/bin:/usr/bin:/bin";
const DEFAULT_SCI_COMMAND_PATHS = [
  "/usr/local/bin/sci",
  "/usr/bin/sci",
  "/bin/sci",
  "/usr/local/bin/semantic-code-intelligence",
  "/usr/bin/semantic-code-intelligence",
  "/bin/semantic-code-intelligence",
];

const textTokens = (text) => Math.ceil(text.length / ESTIMATED_BYTES_PER_TOKEN);

const isMarkdownPath = (value) => /\.md$/i.test(value);

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const isInside = (root, candidate) => candidate === root || candidate.startsWith(`${root}${sep}`);

const truthy = (value) => /^(1|true|yes)$/iu.test(value ?? "");

const customSciCliOverrideAllowed = (env = {}) =>
  env.allowCustomSciCommand === true || truthy(process.env.PI_CONTEXT_PACKER_TRUST_CUSTOM_SCI_CLI);

const processSciCliOverrideRefusals = (env = {}) => {
  if (customSciCliOverrideAllowed(env)) return [];
  return ["PI_CONTEXT_PACKER_SCI_CLI", "SCI_CLI"]
    .filter((name) => typeof process.env[name] === "string" && process.env[name].trim().length > 0)
    .map((name) => ({
      provider: "sci",
      reason: "blocked",
      detail: `process-level ${name} override ignored because PI_CONTEXT_PACKER_TRUST_CUSTOM_SCI_CLI is not set; raw command path omitted`,
    }));
};

const executableExists = async (candidate) => {
  if (typeof candidate !== "string" || !isAbsolute(candidate)) return false;
  try {
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const sciCommandCandidates = async (env = {}) => {
  const processCandidates = customSciCliOverrideAllowed(env)
    ? [process.env.PI_CONTEXT_PACKER_SCI_CLI, process.env.SCI_CLI]
    : [];
  const trustedDefaultCandidates = [];
  for (const candidate of DEFAULT_SCI_COMMAND_PATHS) {
    if (await executableExists(candidate)) trustedDefaultCandidates.push(candidate);
  }
  const candidates = [env.sciCommand, ...processCandidates, ...trustedDefaultCandidates].filter(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );
  return Array.from(new Set(candidates.map((candidate) => candidate.trim())));
};

const parseWorkflowStdout = (stdout) => {
  const outer = JSON.parse(stdout);
  if (outer?.isError) {
    return { ok: false, error: "SCI workflow returned isError=true", raw: outer };
  }

  const text = outer?.content?.find?.((entry) => entry?.type === "text")?.text;
  if (typeof text !== "string") return { ok: true, value: outer, raw: outer };

  try {
    return { ok: true, value: JSON.parse(text), raw: outer };
  } catch {
    return { ok: true, value: { text }, raw: outer };
  }
};

const SUBPROCESS_ENV_ALLOWLIST = new Set([
  "HOME",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "NO_COLOR",
  "CI",
]);
const SUBPROCESS_ENV_FORBIDDEN =
  /^(?:SCI|PI_CONTEXT_PACKER)_|(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|CREDENTIAL)/iu;

const workflowEnv = (cwd) => {
  const inherited = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (!SUBPROCESS_ENV_ALLOWLIST.has(name) || SUBPROCESS_ENV_FORBIDDEN.test(name)) continue;
    if (typeof value === "string") inherited[name] = value;
  }
  return {
    ...inherited,
    PATH: DEFAULT_SUBPROCESS_PATH,
    SILENT_MODE: "true",
    STDIO_MODE: "true",
    PWD: cwd,
    OLDPWD: cwd,
    INIT_CWD: cwd,
    npm_config_local_prefix: cwd,
  };
};

const runWorkflow = async ({ cwd, command, workflow, args, exec = execFileAsync }) => {
  const { stdout } = await exec(
    command,
    ["workflow", workflow, "--args", JSON.stringify(args), "--json"],
    {
      cwd,
      timeout: SCI_TIMEOUT_MS,
      maxBuffer: SCI_MAX_BUFFER,
      env: workflowEnv(cwd),
    },
  );
  return parseWorkflowStdout(stdout);
};

const tryWorkflow = async ({ cwd, workflow, args, env, exec, shouldAbort }) => {
  const errors = [];
  for (const command of await sciCommandCandidates(env)) {
    try {
      const result = await runWorkflow({ cwd, command, workflow, args, exec });
      return { ...result, command };
    } catch (error) {
      errors.push(subprocessFailureDetail("SCI workflow", error, workflow));
      if (shouldAbort && (await shouldAbort())) {
        return {
          ok: false,
          aborted: true,
          error: "SCI workflow aborted after owner-state artifact appeared",
        };
      }
    }
  }
  const uniqueErrors = Array.from(new Set(errors));
  return {
    ok: false,
    error: uniqueErrors.length
      ? `SCI ${workflow} unavailable after ${errors.length} candidate(s): ${uniqueErrors.join("; ")}`
      : "no SCI command candidates available",
  };
};

const pathSeedsForSci = (seeds) =>
  seeds
    .filter((seed) => seed.kind === "path" && !isMarkdownPath(seed.value))
    .slice(0, 3)
    .map((seed) => seed.value);

const symbolSeedsForSci = (seeds) =>
  seeds
    .filter((seed) => seed.kind === "symbol" && !symbolSeedSafetyIssue(seed.value))
    .slice(0, 4)
    .map((seed) => seed.value);

const itemFromValue = ({ id, workflow, command, value, rationale }) => {
  const content =
    typeof value?.content === "string" ? value.content : JSON.stringify(value, null, 2);
  return {
    id,
    kind: workflow === "read_file" ? "file" : "symbol",
    provenance: { provider: "sci", command: `sci workflow ${workflow}`, ref: command },
    rationale,
    estimatedTokens: textTokens(content),
    bytes: Buffer.byteLength(content),
    content,
    contentMode: workflow === "read_file" ? "range" : "metadata",
    freshness: "SCI CLI live workflow call in temporary sandbox",
  };
};

const artifactExists = async (path) => {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
};

const sameFileSnapshot = (left, right) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.mode === right.mode &&
  left.size === right.size &&
  left.mtimeNs === right.mtimeNs &&
  left.ctimeNs === right.ctimeNs;

const ancestorRootsBetween = ({ cwd, repoRoot }) => {
  const roots = [];
  const sourceCwd = resolve(cwd);
  const sourceRepoRoot = repoRoot ? resolve(repoRoot) : undefined;
  if (!sourceRepoRoot || !isInside(sourceRepoRoot, sourceCwd)) return [sourceCwd];

  let current = sourceCwd;
  while (true) {
    roots.push(current);
    if (current === sourceRepoRoot) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return roots;
};

const artifactPaths = ({ cwd, repoRoot, sandboxRoot }) =>
  unique(
    [
      ...ancestorRootsBetween({ cwd, repoRoot }),
      sandboxRoot ? resolve(sandboxRoot) : undefined,
    ].map((root) => root && resolve(root, ".ontology")),
  );

const firstExistingArtifact = async (paths) => {
  for (const path of paths) {
    if (await artifactExists(path)) return path;
  }
  return undefined;
};

const safeCopyPathSeed = async ({ sourceRoot, sandboxRoot, pathSeed }) => {
  const issue = repoRelativePathSafetyIssue(pathSeed, "SCI path seed");
  if (issue) return { ok: false, omission: `${pathSeed}: ${issue}` };

  const realSourceRoot = await realpath(sourceRoot);
  const sourcePath = resolve(sourceRoot, pathSeed);
  let sourceStat;
  try {
    sourceStat = await lstat(sourcePath, { bigint: true });
  } catch {
    return { ok: false, omission: `${pathSeed}: not statable` };
  }

  if (sourceStat.isSymbolicLink()) {
    return { ok: false, omission: `${pathSeed}: symlink path seed omitted` };
  }
  if (!sourceStat.isFile()) {
    return { ok: false, omission: `${pathSeed}: not a regular file` };
  }
  if (typeof fsConstants.O_NOFOLLOW !== "number") {
    return { ok: false, omission: `${pathSeed}: no-symlink open is unavailable` };
  }

  const realSourcePath = await realpath(sourcePath);
  if (!isInside(realSourceRoot, realSourcePath)) {
    return { ok: false, omission: `${pathSeed}: path seed escapes workspace` };
  }

  const relativePath = relative(realSourceRoot, realSourcePath);
  if (relativePath !== pathSeed) {
    return { ok: false, omission: `${pathSeed}: path seed resolves to a different real path` };
  }

  let handle;
  try {
    handle = await open(sourcePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const openedStat = await handle.stat({ bigint: true });
    if (!sameFileSnapshot(openedStat, sourceStat)) {
      return { ok: false, omission: `${pathSeed}: changed before sandbox copy` };
    }

    const content = await handle.readFile();
    const afterReadStat = await handle.stat({ bigint: true });
    if (
      !sameFileSnapshot(afterReadStat, sourceStat) ||
      BigInt(content.byteLength) !== sourceStat.size
    ) {
      return { ok: false, omission: `${pathSeed}: changed during sandbox copy` };
    }

    const sandboxPath = resolve(sandboxRoot, pathSeed);
    await mkdir(dirname(sandboxPath), { recursive: true });
    await writeFile(sandboxPath, content, { flag: "wx" });
    return { ok: true, path: pathSeed };
  } finally {
    await handle?.close();
  }
};

const setupSciSandbox = async ({ sourceRoot, pathSeeds }) => {
  const sandboxRoot = await mkdtemp(join(tmpdir(), "pi-context-packer-sci-"));
  const copiedPaths = [];
  const omissions = [];

  for (const pathSeed of pathSeeds) {
    try {
      const result = await safeCopyPathSeed({ sourceRoot, sandboxRoot, pathSeed });
      if (result.ok) copiedPaths.push(result.path);
      else omissions.push({ provider: "sci", reason: "unsafe_path", detail: result.omission });
    } catch {
      omissions.push({
        provider: "sci",
        reason: "blocked",
        detail: `${pathSeed}: SCI sandbox copy failed; raw filesystem error output omitted`,
      });
    }
  }

  return { sandboxRoot, copiedPaths, omissions };
};

const sandboxSetupFailure = (omissions = []) => ({
  section: sectionFromItems([]),
  omissions: [
    ...omissions,
    {
      provider: "sci",
      reason: "blocked",
      detail: "SCI sandbox setup failed; raw filesystem error output omitted",
    },
  ],
});

export const buildSciSection = async ({ cwd, repoRoot, seeds, maxBytes, env = {} }) => {
  const items = [];
  const omissions = [];
  const exec = env.execFileAsync;
  const sourceCwd = resolve(cwd);
  const sourceRepoRoot = repoRoot ? resolve(repoRoot) : undefined;
  const sourceArtifactPaths = artifactPaths({ cwd: sourceCwd, repoRoot: sourceRepoRoot });
  const hadSourceArtifactBefore = await firstExistingArtifact(sourceArtifactPaths);
  omissions.push(...processSciCliOverrideRefusals(env));

  if (env.sciReadOnlySafe !== true) {
    return {
      section: sectionFromItems([]),
      omissions: [
        ...omissions,
        {
          provider: "sci",
          reason: "blocked",
          detail:
            "SCI read-only safety was not confirmed; context-packer cannot authorize workflows that may create or mutate .ontology artifacts; use the SCI owner surface directly when indexing is required",
        },
      ],
    };
  }

  if (hadSourceArtifactBefore) {
    return {
      section: sectionFromItems([]),
      omissions: [
        ...omissions,
        {
          provider: "sci",
          reason: "blocked",
          detail:
            "existing .ontology SCI artifacts present in source workspace; refusing to run against source-owned SCI state from context-packer; use the SCI owner surface directly",
        },
      ],
    };
  }

  let sandbox;
  try {
    sandbox = await setupSciSandbox({
      sourceRoot: sourceRepoRoot ?? sourceCwd,
      pathSeeds: pathSeedsForSci(seeds),
    });
  } catch {
    return sandboxSetupFailure(omissions);
  }
  omissions.push(...sandbox.omissions);
  const sandboxArtifactPaths = artifactPaths({ cwd: sandbox.sandboxRoot });
  const allArtifactPaths = [...sourceArtifactPaths, ...sandboxArtifactPaths];

  const artifactCreatedResult = () => ({
    section: sectionFromItems([]),
    omissions: [
      ...omissions,
      {
        provider: "sci",
        reason: "blocked",
        detail:
          "SCI created or exposed .ontology artifacts during a sandboxed read-only packet attempt; SCI packet items were omitted and source workspace artifacts were left to the SCI owner surface",
      },
    ],
  });

  const cleanupFailureResult = () => ({
    section: sectionFromItems([]),
    omissions: [
      ...omissions,
      {
        provider: "sci",
        reason: "blocked",
        detail:
          "SCI sandbox cleanup failed; raw filesystem error output omitted and SCI packet items were omitted",
      },
    ],
  });

  let result;
  try {
    for (const path of sandbox.copiedPaths) {
      const workflowResult = await tryWorkflow({
        cwd: sandbox.sandboxRoot,
        workflow: "read_file",
        args: { path, range: { startLine: 1, endLine: 120 } },
        env,
        exec,
        shouldAbort: () => firstExistingArtifact(allArtifactPaths),
      });
      if (await firstExistingArtifact(allArtifactPaths)) {
        result = artifactCreatedResult();
        return result;
      }
      if (workflowResult.ok) {
        const item = itemFromValue({
          id: `sci:read_file:${path}`,
          workflow: "read_file",
          command: workflowResult.command,
          value: workflowResult.value,
          rationale: "SCI bounded code file range for sandboxed seeded path",
        });
        if (item.bytes <= maxBytes) items.push(item);
        else
          omissions.push({
            provider: "sci",
            reason: "budget",
            detail: `${path}: SCI result over budget`,
          });
      } else {
        omissions.push({ provider: "sci", reason: "unavailable", detail: workflowResult.error });
        break;
      }
    }

    const symbols = symbolSeedsForSci(seeds);
    if (symbols.length > 0 && sandbox.copiedPaths.length === 0) {
      omissions.push({
        provider: "sci",
        reason: "low_rank",
        detail:
          "SCI sandboxed symbol search requires at least one safe code path seed; use SCI owner surface directly for broad repository indexing",
      });
    }

    for (const symbol of sandbox.copiedPaths.length > 0 ? symbols : []) {
      const symbolResult = await tryWorkflow({
        cwd: sandbox.sandboxRoot,
        workflow: "symbol_search",
        args: { query: symbol, maxResults: 8 },
        env,
        exec,
        shouldAbort: () => firstExistingArtifact(allArtifactPaths),
      });
      if (await firstExistingArtifact(allArtifactPaths)) {
        result = artifactCreatedResult();
        return result;
      }
      const workflowResult =
        symbolResult.ok && (symbolResult.value?.count ?? 0) > 0
          ? symbolResult
          : await tryWorkflow({
              cwd: sandbox.sandboxRoot,
              workflow: "text_search",
              args: { query: symbol, path: ".", maxResults: 8 },
              env,
              exec,
              shouldAbort: () => firstExistingArtifact(allArtifactPaths),
            });

      if (await firstExistingArtifact(allArtifactPaths)) {
        result = artifactCreatedResult();
        return result;
      }
      if (workflowResult.ok) {
        const item = itemFromValue({
          id: `sci:symbol:${symbol}`,
          workflow: workflowResult === symbolResult ? "symbol_search" : "text_search",
          command: workflowResult.command,
          value: workflowResult.value,
          rationale: "SCI bounded symbol/text search in temporary sandbox",
        });
        if (item.bytes <= maxBytes) items.push(item);
        else
          omissions.push({
            provider: "sci",
            reason: "budget",
            detail: `${symbol}: SCI result over budget`,
          });
      } else {
        omissions.push({ provider: "sci", reason: "unavailable", detail: workflowResult.error });
        break;
      }
    }

    if (items.length === 0 && omissions.length === 0) {
      omissions.push({
        provider: "sci",
        reason: "low_rank",
        detail: "SCI selected but no code path or symbol seeds were supplied",
      });
    }

    if (await firstExistingArtifact(allArtifactPaths)) {
      result = artifactCreatedResult();
      return result;
    }

    result = { section: sectionFromItems(items), omissions };
    return result;
  } finally {
    try {
      await rm(sandbox.sandboxRoot, { recursive: true, force: true });
    } catch {
      const cleanupResult = cleanupFailureResult();
      if (result) {
        result.section = cleanupResult.section;
        result.omissions = cleanupResult.omissions;
      } else {
        result = cleanupResult;
      }
    }
  }
};

const sectionFromItems = (items) => ({
  id: "sci",
  title: "SCI code context",
  provider: "sci",
  authority:
    "Semantic Code Intelligence read-only code navigation output from a temporary sandbox; not docs/task/evidence authority.",
  estimatedTokens: items.reduce((sum, item) => sum + item.estimatedTokens, 0),
  bytes: items.reduce((sum, item) => sum + item.bytes, 0),
  items,
});
