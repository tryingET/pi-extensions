const PI_VARS_PATTERN = /\$\d+|\$@|\$ARGUMENTS|\$\{@:\d+(?::\d+)?\}/;
const VALID_RENDER_ENGINES = new Set(["none", "pi-vars", "nunjucks"]);
const RESERVED_RENDER_CONTEXT_KEYS = new Set([
  "args",
  "arguments",
  "current_company",
  "context",
  "template_name",
]);
const FORBIDDEN_RENDER_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const UNSUPPORTED_NUNJUCKS_TOKENS = ["{%", "{#", "#}"];

function unquote(value) {
  const text = String(value ?? "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

export function parseTemplateFrontmatter(raw) {
  const text = String(raw ?? "");
  const match = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/.exec(text);
  if (!match) {
    return { attributes: {}, body: text, frontmatter: "", hasFrontmatter: false };
  }

  const frontmatter = match[2];
  const attributes = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const keyValueMatch = /^([A-Za-z0-9_-]+)\s*:\s*(.*?)\s*$/.exec(line.trim());
    if (!keyValueMatch) continue;
    attributes[keyValueMatch[1]] = unquote(keyValueMatch[2]);
  }

  return {
    attributes,
    body: text.slice(match[0].length),
    frontmatter,
    hasFrontmatter: true,
  };
}

export function stripFrontmatter(raw) {
  return parseTemplateFrontmatter(raw).body;
}

export function normalizeRenderEngine(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  return VALID_RENDER_ENGINES.has(normalized) ? normalized : "invalid";
}

export function detectTemplateRenderEngine(raw, options = {}) {
  const parsed = parseTemplateFrontmatter(raw);
  const explicitRaw = parsed.attributes.render_engine ?? parsed.attributes["render-engine"];
  const explicitEngine = normalizeRenderEngine(explicitRaw);
  if (explicitEngine === "invalid") {
    return {
      engine: "invalid",
      explicitEngine,
      body: parsed.body,
      hasFrontmatter: parsed.hasFrontmatter,
      error: `Unsupported render_engine: ${String(explicitRaw)}`,
      usedRenderKeys: [],
    };
  }
  if (explicitEngine) {
    return {
      engine: explicitEngine,
      explicitEngine,
      body: parsed.body,
      hasFrontmatter: parsed.hasFrontmatter,
      error: null,
      usedRenderKeys: [],
    };
  }

  const allowLegacyPiVarsAutoDetect = Boolean(options.allowLegacyPiVarsAutoDetect);
  return {
    engine: allowLegacyPiVarsAutoDetect && PI_VARS_PATTERN.test(parsed.body) ? "pi-vars" : "none",
    explicitEngine: null,
    body: parsed.body,
    hasFrontmatter: parsed.hasFrontmatter,
    error: null,
    usedRenderKeys: [],
  };
}

function analyzePiVarUsage(content) {
  const text = String(content ?? "");
  const usage = {
    hasReferences: false,
    highestRequiredIndex: 0,
  };

  for (const match of text.matchAll(/\$(\d+)|\$@|\$ARGUMENTS|\$\{@:(\d+)(?::(\d+))?\}/g)) {
    usage.hasReferences = true;

    if (match[1]) {
      usage.highestRequiredIndex = Math.max(
        usage.highestRequiredIndex,
        Number.parseInt(match[1], 10),
      );
      continue;
    }

    if (match[2]) {
      const startIndex = Number.parseInt(match[2], 10);
      const sliceLength = match[3] ? Number.parseInt(match[3], 10) : 1;
      usage.highestRequiredIndex = Math.max(
        usage.highestRequiredIndex,
        startIndex + Math.max(0, sliceLength - 1),
      );
      continue;
    }

    usage.highestRequiredIndex = Math.max(usage.highestRequiredIndex, 1);
  }

  return usage;
}

function validatePiVarInputs(content, args) {
  const usage = analyzePiVarUsage(content);
  if (!usage.hasReferences) return;

  const providedArgs = Array.isArray(args) ? args.length : 0;
  if (providedArgs === 0) {
    throw new Error(
      "Pi-vars template requires positional args, but this execution path supplied none",
    );
  }

  if (usage.highestRequiredIndex > providedArgs) {
    throw new Error(
      `Pi-vars template requires at least ${usage.highestRequiredIndex} positional arg(s), but received ${providedArgs}`,
    );
  }
}

export function substitutePiVars(content, args) {
  const values = Array.isArray(args) ? args.map((value) => String(value ?? "")) : [];
  let result = String(content ?? "");

  result = result.replace(/\$(\d+)/g, (_, num) => values[Number.parseInt(num, 10) - 1] ?? "");
  result = result.replace(/\$\{@:(\d+)(?::(\d+))?\}/g, (_, startStr, lengthStr) => {
    let start = Number.parseInt(startStr, 10) - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (lengthStr) {
      const length = Number.parseInt(lengthStr, 10);
      return values.slice(start, start + length).join(" ");
    }
    return values.slice(start).join(" ");
  });

  const allArgs = values.join(" ");
  return result.replace(/\$ARGUMENTS/g, allArgs).replace(/\$@/g, allArgs);
}

function sanitizeRenderData(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => {
      if (RESERVED_RENDER_CONTEXT_KEYS.has(key)) return false;
      return !/^arg\d+$/.test(key);
    }),
  );
}

export function buildRenderContext(options = {}) {
  const args = Array.isArray(options.args) ? options.args.map((value) => String(value ?? "")) : [];
  const data = sanitizeRenderData(options.data);
  const positional = Object.fromEntries(args.map((value, index) => [`arg${index + 1}`, value]));

  return {
    ...data,
    args,
    arguments: args.join(" "),
    current_company: options.currentCompany ? String(options.currentCompany) : "",
    context: options.context ? String(options.context) : "",
    template_name: options.templateName ? String(options.templateName) : "",
    ...positional,
  };
}

function parseSafeNunjucksExpression(expression) {
  const raw = String(expression ?? "").trim();
  const normalized = raw.replace(/\s+/g, "");
  if (!normalized) throw new Error("Empty Nunjucks expression");
  if (/[^.[\]A-Za-z0-9_]/.test(normalized)) {
    throw new Error(`Unsafe Nunjucks expression: ${raw}`);
  }

  const segments = [];
  let index = 0;
  const rootMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(normalized);
  if (!rootMatch) throw new Error(`Unsafe Nunjucks expression: ${raw}`);
  segments.push(rootMatch[0]);
  index = rootMatch[0].length;

  while (index < normalized.length) {
    const char = normalized[index];
    if (char === ".") {
      const propMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(normalized.slice(index + 1));
      if (!propMatch) throw new Error(`Unsafe Nunjucks expression: ${raw}`);
      segments.push(propMatch[0]);
      index += 1 + propMatch[0].length;
      continue;
    }

    if (char === "[") {
      const bracketMatch = /^\[(\d+)\]/.exec(normalized.slice(index));
      if (!bracketMatch) throw new Error(`Unsafe Nunjucks expression: ${raw}`);
      segments.push(Number.parseInt(bracketMatch[1], 10));
      index += bracketMatch[0].length;
      continue;
    }

    throw new Error(`Unsafe Nunjucks expression: ${raw}`);
  }

  for (const segment of segments) {
    if (typeof segment === "string" && FORBIDDEN_RENDER_SEGMENTS.has(segment)) {
      throw new Error(`Unsafe Nunjucks expression: ${raw}`);
    }
  }

  return { raw, rootKey: String(segments[0]), segments };
}

function resolveRenderPath(expression, renderContext) {
  const parsed = parseSafeNunjucksExpression(expression);
  let current = renderContext;

  for (let i = 0; i < parsed.segments.length; i++) {
    const segment = parsed.segments[i];
    if (typeof segment === "number") {
      if (!Array.isArray(current) || segment < 0 || segment >= current.length) {
        throw new Error(`Undefined render path: ${parsed.raw}`);
      }
      current = current[segment];
      continue;
    }

    if (Array.isArray(current)) {
      throw new Error(`Undefined render path: ${parsed.raw}`);
    }

    if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) {
      throw new Error(`Undefined render path: ${parsed.raw}`);
    }
    current = current[segment];
  }

  return { value: current, rootKey: parsed.rootKey };
}

function coerceRenderedValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((item) => String(item ?? "")).join(" ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function renderSafeNunjucksContent(body, renderContext) {
  const text = String(body ?? "");
  for (const token of UNSUPPORTED_NUNJUCKS_TOKENS) {
    if (text.includes(token)) {
      throw new Error(
        "Unsupported Nunjucks syntax: only variable interpolation tags like {{ current_company }} are allowed",
      );
    }
  }

  const usedRenderKeys = new Set();
  const rendered = text.replace(/\{\{([\s\S]*?)\}\}/g, (_match, expression) => {
    const resolved = resolveRenderPath(expression, renderContext);
    if (resolved.rootKey) usedRenderKeys.add(resolved.rootKey);
    return coerceRenderedValue(resolved.value);
  });

  const unmatchedTemplateTokens = text.replace(/\{\{([\s\S]*?)\}\}/g, "");
  if (unmatchedTemplateTokens.includes("{{") || unmatchedTemplateTokens.includes("}}")) {
    throw new Error("Unsupported Nunjucks syntax: unmatched variable tag");
  }

  return {
    rendered,
    usedRenderKeys: [...usedRenderKeys],
  };
}

export function renderTemplateContent(raw, options = {}) {
  const contract = detectTemplateRenderEngine(raw, {
    allowLegacyPiVarsAutoDetect: options.allowLegacyPiVarsAutoDetect,
  });
  if (contract.error) throw new Error(contract.error);

  const body = contract.body;
  const args = Array.isArray(options.args) ? options.args : [];
  const renderContext = buildRenderContext(options);

  if (contract.engine === "none") {
    return { ...contract, rendered: body, renderContext, usedRenderKeys: [] };
  }

  if (contract.engine === "pi-vars") {
    try {
      validatePiVarInputs(body, args);
      return {
        ...contract,
        rendered: substitutePiVars(body, args),
        renderContext,
        usedRenderKeys: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Pi-vars render failed: ${message}`);
    }
  }

  try {
    const rendered = renderSafeNunjucksContent(body, renderContext);
    return {
      ...contract,
      rendered: rendered.rendered,
      renderContext,
      usedRenderKeys: rendered.usedRenderKeys,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Nunjucks render failed: ${message}`);
  }
}

export function prepareTemplateForExecution(raw, options = {}) {
  const context = options.context ? String(options.context) : "";
  const appendContextSection = options.appendContextSection ?? true;

  try {
    const rendered = renderTemplateContent(raw, options);
    const referencesContext = rendered.usedRenderKeys.includes("context");
    const contextAppended = Boolean(context) && appendContextSection && !referencesContext;
    return {
      ok: true,
      ...rendered,
      prepared: contextAppended
        ? `${rendered.rendered}\n\n## CONTEXT\n${context}`
        : rendered.rendered,
      contextAppended,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
