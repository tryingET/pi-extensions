import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ESTIMATED_BYTES_PER_TOKEN = 4;
const SCI_MAX_BUFFER = 96_000;
const SCI_TIMEOUT_MS = 10_000;

const textTokens = (text) => Math.ceil(text.length / ESTIMATED_BYTES_PER_TOKEN);

const isMarkdownPath = (value) => /\.md$/i.test(value);

const sciCommandCandidates = (env = {}) => {
  const candidates = [
    env.sciCommand,
    process.env.PI_CONTEXT_PACKER_SCI_CLI,
    process.env.SCI_CLI,
    "sci",
    "semantic-code-intelligence",
  ].filter((candidate) => typeof candidate === "string" && candidate.trim().length > 0);
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

const runWorkflow = async ({ cwd, command, workflow, args, exec = execFileAsync }) => {
  const { stdout } = await exec(
    command,
    ["workflow", workflow, "--args", JSON.stringify(args), "--json"],
    {
      cwd,
      timeout: SCI_TIMEOUT_MS,
      maxBuffer: SCI_MAX_BUFFER,
      env: { ...process.env, SILENT_MODE: "true", STDIO_MODE: "true" },
    },
  );
  return parseWorkflowStdout(stdout);
};

const tryWorkflow = async ({ cwd, workflow, args, env, exec }) => {
  const errors = [];
  for (const command of sciCommandCandidates(env)) {
    try {
      const result = await runWorkflow({ cwd, command, workflow, args, exec });
      return { ...result, command };
    } catch (error) {
      errors.push(`${command}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: false, error: errors.join("; ") || "no SCI command candidates available" };
};

const pathSeedsForSci = (seeds) =>
  seeds
    .filter((seed) => seed.kind === "path" && !isMarkdownPath(seed.value))
    .slice(0, 3)
    .map((seed) => seed.value);

const symbolSeedsForSci = (seeds) =>
  seeds
    .filter((seed) => seed.kind === "symbol")
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
    freshness: "SCI CLI live workflow call",
  };
};

const pathExists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

export const buildSciSection = async ({ cwd, seeds, maxBytes, env = {} }) => {
  const items = [];
  const omissions = [];
  const exec = env.execFileAsync;
  const ontologyPath = resolve(cwd, ".ontology");
  const hadOntologyBefore = await pathExists(ontologyPath);

  if (hadOntologyBefore && env.allowExistingSciArtifacts !== true) {
    return {
      section: sectionFromItems([]),
      omissions: [
        {
          provider: "sci",
          reason: "blocked",
          detail:
            "existing .ontology SCI artifacts present; refusing to mutate source-owned SCI state",
        },
      ],
    };
  }

  for (const path of pathSeedsForSci(seeds)) {
    const result = await tryWorkflow({
      cwd,
      workflow: "read_file",
      args: { path, range: { startLine: 1, endLine: 120 } },
      env,
      exec,
    });
    if (result.ok) {
      const item = itemFromValue({
        id: `sci:read_file:${path}`,
        workflow: "read_file",
        command: result.command,
        value: result.value,
        rationale: "SCI bounded code file range for seeded path",
      });
      if (item.bytes <= maxBytes) items.push(item);
      else
        omissions.push({
          provider: "sci",
          reason: "budget",
          detail: `${path}: SCI result over budget`,
        });
    } else {
      omissions.push({ provider: "sci", reason: "unavailable", detail: result.error });
      break;
    }
  }

  for (const symbol of symbolSeedsForSci(seeds)) {
    const symbolResult = await tryWorkflow({
      cwd,
      workflow: "symbol_search",
      args: { query: symbol, maxResults: 8 },
      env,
      exec,
    });
    const result =
      symbolResult.ok && (symbolResult.value?.count ?? 0) > 0
        ? symbolResult
        : await tryWorkflow({
            cwd,
            workflow: "text_search",
            args: { query: symbol, path: ".", maxResults: 8 },
            env,
            exec,
          });

    if (result.ok) {
      const item = itemFromValue({
        id: `sci:symbol:${symbol}`,
        workflow: result === symbolResult ? "symbol_search" : "text_search",
        command: result.command,
        value: result.value,
        rationale: "SCI bounded symbol/text search for seeded symbol",
      });
      if (item.bytes <= maxBytes) items.push(item);
      else
        omissions.push({
          provider: "sci",
          reason: "budget",
          detail: `${symbol}: SCI result over budget`,
        });
    } else {
      omissions.push({ provider: "sci", reason: "unavailable", detail: result.error });
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

  if (
    !hadOntologyBefore &&
    (await pathExists(ontologyPath)) &&
    env.allowSciArtifactCreation !== true
  ) {
    return {
      section: sectionFromItems([]),
      omissions: [
        ...omissions,
        {
          provider: "sci",
          reason: "blocked",
          detail:
            "SCI created .ontology artifacts during a read-only packet attempt; artifacts were left untouched and SCI packet items were omitted",
        },
      ],
    };
  }

  return { section: sectionFromItems(items), omissions };
};

const sectionFromItems = (items) => ({
  id: "sci",
  title: "SCI code context",
  provider: "sci",
  authority:
    "Semantic Code Intelligence read-only code navigation output; not docs/task/evidence authority.",
  estimatedTokens: items.reduce((sum, item) => sum + item.estimatedTokens, 0),
  bytes: items.reduce((sum, item) => sum + item.bytes, 0),
  items,
});
