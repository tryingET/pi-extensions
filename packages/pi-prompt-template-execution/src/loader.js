/**
summary: "Loads global and project prompt templates, parses supported frontmatter, and reports deterministic ownership diagnostics."
read_when:
  - "Changing template discovery, frontmatter fields, model parsing, command precedence, or reserved-name handling."
*/
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parseModelSpecList } from "@tryinget/pi-model-selection";

export const RESERVED_COMMAND_NAMES = new Set([
  "chain-prompts",
  "prompt-tool",
  "settings",
  "model",
  "scoped-models",
  "export",
  "share",
  "copy",
  "name",
  "session",
  "changelog",
  "hotkeys",
  "fork",
  "tree",
  "login",
  "logout",
  "new",
  "compact",
  "resume",
  "reload",
  "quit",
]);

const VALID_THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
const DEFERRED_OWNERSHIP_FIELDS = new Set([
  "chain",
  "loop",
  "fresh",
  "converge",
  "subagent",
  "inheritContext",
]);

function lexicalCompare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function createDiagnostic(code, filePath, source, message) {
  return { code, filePath, source, message, key: `${code}:${filePath}:${message}` };
}

function normalizeString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  const quoted = value.match(/^(?:"([\s\S]*)"|'([\s\S]*)')$/);
  if (quoted) return quoted[1] ?? quoted[2] ?? "";
  return value;
}

export function parseMarkdownFrontmatter(markdown) {
  const text = String(markdown ?? "");
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) {
    return { frontmatter: {}, body: text };
  }

  const newline = text.startsWith("---\r\n") ? "\r\n" : "\n";
  const closeToken = `${newline}---${newline}`;
  const closeIndex = text.indexOf(closeToken, 3);
  if (closeIndex < 0) {
    throw new Error("Missing closing frontmatter delimiter");
  }

  const rawFrontmatter = text.slice(3 + newline.length, closeIndex);
  const body = text.slice(closeIndex + closeToken.length);
  const frontmatter = {};
  const lines = rawFrontmatter.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("- ")) {
      return { frontmatter: [], body };
    }
    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*?)\s*$/);
    if (!match) throw new Error(`Unsupported frontmatter line: ${line}`);

    const key = match[1];
    const rawValue = match[2] ?? "";
    if (rawValue.trim() === "") {
      const items = [];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const candidate = lines[cursor];
        const candidateTrimmed = candidate.trim();
        if (!candidateTrimmed || candidateTrimmed.startsWith("#")) {
          cursor += 1;
          continue;
        }
        const itemMatch = candidate.match(/^\s+-\s*(.*?)\s*$/);
        if (!itemMatch) break;
        items.push(parseScalar(itemMatch[1] ?? ""));
        cursor += 1;
      }
      if (items.length > 0) {
        frontmatter[key] = items;
        index = cursor - 1;
        continue;
      }
    }

    frontmatter[key] = parseScalar(rawValue);
  }
  return { frontmatter, body };
}

function normalizeFrontmatterRecord(value, filePath, source, diagnostics) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  diagnostics.push(
    createDiagnostic(
      "invalid-frontmatter",
      filePath,
      source,
      `Skipping prompt template at ${filePath}: frontmatter must be a key-value object.`,
    ),
  );
  return undefined;
}

function normalizeModelSpecs(value, filePath, source, diagnostics) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    diagnostics.push(
      createDiagnostic(
        "invalid-model",
        filePath,
        source,
        `Skipping prompt template at ${filePath}: frontmatter field "model" must be a string.`,
      ),
    );
    return undefined;
  }
  try {
    return parseModelSpecList(value);
  } catch (error) {
    diagnostics.push(
      createDiagnostic(
        "invalid-model-spec",
        filePath,
        source,
        `Skipping prompt template at ${filePath}: ${error instanceof Error ? error.message : String(error)}.`,
      ),
    );
    return undefined;
  }
}

function normalizeBoolean(value, defaultValue, field, filePath, source, diagnostics) {
  if (value === undefined) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  diagnostics.push(
    createDiagnostic(
      `invalid-${field}`,
      filePath,
      source,
      `Using default ${field}=${defaultValue} for ${filePath}: frontmatter field "${field}" must be true or false.`,
    ),
  );
  return defaultValue;
}

function normalizeThinking(value, filePath, source, diagnostics) {
  const thinking = normalizeString(value);
  if (!thinking) return undefined;
  const normalized = thinking.toLowerCase();
  if (VALID_THINKING_LEVELS.has(normalized)) return normalized;
  diagnostics.push(
    createDiagnostic(
      "invalid-thinking",
      filePath,
      source,
      `Ignoring invalid thinking level in ${filePath}: ${JSON.stringify(thinking)}.`,
    ),
  );
  return undefined;
}

function hasModelConditionals(body) {
  return /<if-model(?:\s|>)|<else(?:\s|>)|<\/if-model\s*>|<\/else(?:\s|>)/.test(body);
}

function hasDeferredOwnership(frontmatter) {
  return Object.keys(frontmatter).some((key) => DEFERRED_OWNERSHIP_FIELDS.has(key));
}

function promptFromMarkdown({ rawContent, filePath, source, subdir, name, diagnostics }) {
  const parsed = parseMarkdownFrontmatter(rawContent);
  const frontmatter = normalizeFrontmatterRecord(parsed.frontmatter, filePath, source, diagnostics);
  if (!frontmatter) return undefined;

  if (hasDeferredOwnership(frontmatter)) {
    diagnostics.push(
      createDiagnostic(
        "deferred-orchestrator-or-asc-feature",
        filePath,
        source,
        `Skipping prompt template at ${filePath}: chain/loop/subagent style execution is outside prompt-template-execution MVP ownership.`,
      ),
    );
    return undefined;
  }

  const hasModelField = Object.hasOwn(frontmatter, "model");
  const models = normalizeModelSpecs(frontmatter.model, filePath, source, diagnostics);
  if (hasModelField && !models) return undefined;

  const skill = normalizeString(frontmatter.skill);
  const thinking = normalizeThinking(frontmatter.thinking, filePath, source, diagnostics);
  const hasConditionals = hasModelConditionals(parsed.body);
  if (!hasModelField && !skill && !thinking && !hasConditionals) return undefined;

  if (RESERVED_COMMAND_NAMES.has(name)) {
    diagnostics.push(
      createDiagnostic(
        "reserved-command-name",
        filePath,
        source,
        `Skipping prompt template at ${filePath}: command name "${name}" is reserved.`,
      ),
    );
    return undefined;
  }

  return {
    name,
    description: normalizeString(frontmatter.description) ?? "",
    content: parsed.body,
    models: models ?? [],
    restore: normalizeBoolean(frontmatter.restore, true, "restore", filePath, source, diagnostics),
    skill,
    thinking,
    source,
    subdir: subdir || undefined,
    filePath,
  };
}

function loadFromDir(dir, source, subdir = "", visitedDirectories = new Set()) {
  const prompts = [];
  const diagnostics = [];
  if (!existsSync(dir)) return { prompts, diagnostics };

  let canonicalDir;
  try {
    canonicalDir = realpathSync(dir);
  } catch (error) {
    diagnostics.push(
      createDiagnostic(
        "unreadable-directory",
        dir,
        source,
        `Skipping prompt directory ${dir}: ${error instanceof Error ? error.message : String(error)}.`,
      ),
    );
    return { prompts, diagnostics };
  }
  if (visitedDirectories.has(canonicalDir)) {
    diagnostics.push(
      createDiagnostic(
        "directory-cycle",
        dir,
        source,
        `Skipping already visited prompt directory at ${dir}.`,
      ),
    );
    return { prompts, diagnostics };
  }
  visitedDirectories.add(canonicalDir);

  try {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      lexicalCompare(a.name, b.name),
    );
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      let isFile = entry.isFile();
      let isDirectory = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          const stats = statSync(fullPath);
          isFile = stats.isFile();
          isDirectory = stats.isDirectory();
        } catch (error) {
          diagnostics.push(
            createDiagnostic(
              "unreadable-symlink",
              fullPath,
              source,
              `Skipping unreadable symlink at ${fullPath}: ${error instanceof Error ? error.message : String(error)}.`,
            ),
          );
          continue;
        }
      }

      if (isDirectory) {
        const nested = loadFromDir(
          fullPath,
          source,
          subdir ? `${subdir}:${entry.name}` : entry.name,
          visitedDirectories,
        );
        prompts.push(...nested.prompts);
        diagnostics.push(...nested.diagnostics);
        continue;
      }
      if (!isFile || !entry.name.endsWith(".md")) continue;

      try {
        const prompt = promptFromMarkdown({
          rawContent: readFileSync(fullPath, "utf8"),
          filePath: fullPath,
          source,
          subdir,
          name: entry.name.slice(0, -3),
          diagnostics,
        });
        if (prompt) prompts.push(prompt);
      } catch (error) {
        diagnostics.push(
          createDiagnostic(
            "invalid-prompt-file",
            fullPath,
            source,
            `Skipping prompt template at ${fullPath}: ${error instanceof Error ? error.message : String(error)}.`,
          ),
        );
      }
    }
  } catch (error) {
    diagnostics.push(
      createDiagnostic(
        "unreadable-directory",
        dir,
        source,
        `Skipping prompt directory ${dir}: ${error instanceof Error ? error.message : String(error)}.`,
      ),
    );
  }
  return { prompts, diagnostics };
}

export function loadPromptTemplates(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const globalDir = options.globalDir ?? join(homedir(), ".pi", "agent", "prompts");
  const projectDir = options.projectDir ?? resolve(cwd, ".pi", "prompts");
  const promptMap = new Map();
  const diagnostics = [];

  const addPrompt = (prompt) => {
    const existing = promptMap.get(prompt.name);
    if (!existing) {
      promptMap.set(prompt.name, prompt);
      return;
    }
    if (existing.source === prompt.source) {
      diagnostics.push(
        createDiagnostic(
          "duplicate-command-name",
          prompt.filePath,
          prompt.source,
          `Skipping ${prompt.source} prompt template "${prompt.name}" at ${prompt.filePath} because it conflicts with ${existing.filePath}.`,
        ),
      );
      return;
    }
    promptMap.set(prompt.name, prompt);
  };

  for (const result of [loadFromDir(globalDir, "user"), loadFromDir(projectDir, "project")]) {
    diagnostics.push(...result.diagnostics);
    for (const prompt of result.prompts) addPrompt(prompt);
  }

  return { prompts: promptMap, diagnostics };
}

export function buildPromptCommandDescription(prompt) {
  const sourceLabel = prompt.subdir ? `(${prompt.source}:${prompt.subdir})` : `(${prompt.source})`;
  const modelLabel =
    prompt.models.length > 0
      ? prompt.models.map((model) => model.split("/").pop() || model).join("|")
      : "current";
  const skillLabel = prompt.skill ? ` +${prompt.skill}` : "";
  const thinkingLabel = prompt.thinking ? ` ${prompt.thinking}` : "";
  const details = `[${modelLabel}${thinkingLabel}${skillLabel}] ${sourceLabel}`;
  return prompt.description ? `${prompt.description} ${details}` : details;
}
