import { basename } from "node:path";

function collapseWhitespace(value) {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : undefined;
}

function extractTextFromContent(content) {
  if (typeof content === "string") {
    return collapseWhitespace(content);
  }

  if (!Array.isArray(content)) return undefined;

  const text = content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join(" ");

  return collapseWhitespace(text);
}

function isLowSignalObjectiveHint(value) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (/^(continue|ok|okay|yes|y|go on|next|proceed|done|thanks|thank you|thx)\.?$/.test(normalized)) return true;
  if (/must\s*replace|placeholder|something like that/.test(normalized)) return true;
  return false;
}

function readLatestObjectiveHint(sessionManager) {
  if (!sessionManager || typeof sessionManager.getBranch !== "function") return undefined;

  let branch;
  try {
    branch = sessionManager.getBranch();
  } catch {
    return undefined;
  }

  if (!Array.isArray(branch)) return undefined;

  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (!entry || entry.type !== "message") continue;

    const message = entry.message;
    if (!message || message.role !== "user") continue;

    const text = extractTextFromContent(message.content);
    if (!text) continue;
    if (text.startsWith("/") || text.startsWith("$$")) continue;

    return text.length > 160 ? `${text.slice(0, 157)}...` : text;
  }

  return undefined;
}

async function readGitBranch(pi, cwd) {
  try {
    const result = await pi.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      timeout: 1500,
    });

    if (result.code !== 0) return undefined;

    const branch = result.stdout.trim();
    return branch.length > 0 ? branch : undefined;
  } catch {
    return undefined;
  }
}

function inferSystem4dMode(providedArgs, objectiveHint) {
  const validModes = new Set(["off", "lite", "full"]);

  const provided = (providedArgs[2] ?? "").trim().toLowerCase();
  if (validModes.has(provided)) return provided;

  const objective = (objectiveHint ?? "").toLowerCase();
  const explicitMatch = objective.match(/system4d(?:_mode)?\s*[:= ]\s*(off|lite|full)/);
  if (explicitMatch && validModes.has(explicitMatch[1])) {
    return explicitMatch[1];
  }

  return "lite";
}

/**
 * Infer deterministic context snippets for missing prompt-template args.
 */
export async function inferContextArgs({ pi, ctx, providedArgs }) {
  const cwd = ctx?.cwd || process.cwd();
  const repoName = basename(cwd) || cwd;
  const branch = await readGitBranch(pi, cwd);
  const rawObjectiveHint = readLatestObjectiveHint(ctx?.sessionManager);
  const objectiveHint = isLowSignalObjectiveHint(rawObjectiveHint) ? undefined : rawObjectiveHint;

  const firstProvidedArgRaw = providedArgs.find((arg) => arg.trim().length > 0);
  const firstProvidedArg =
    firstProvidedArgRaw && !isLowSignalObjectiveHint(firstProvidedArgRaw) ? firstProvidedArgRaw : undefined;
  const roughThought = firstProvidedArg || objectiveHint || "<MUST_REPLACE_PRIMARY_OBJECTIVE>";

  const contextParts = [`repo=${repoName}`, `cwd=${cwd}`];
  if (branch) contextParts.push(`branch=${branch}`);
  if (objectiveHint) contextParts.push(`objective=${objectiveHint}`);

  const extraParts = [`repo=${repoName}`];
  if (branch) extraParts.push(`branch=${branch}`);
  extraParts.push(`cwd=${cwd}`);
  if (objectiveHint) extraParts.push(`objective=${objectiveHint}`);

  return {
    cwd,
    repoName,
    branch,
    objectiveHint,
    roughThought,
    system4dMode: inferSystem4dMode(providedArgs, objectiveHint),
    contextSummary: contextParts.join("; "),
    contextExtrasSummary: `context: ${extraParts.join(", ")}`,
    extrasSummary: "",
  };
}
