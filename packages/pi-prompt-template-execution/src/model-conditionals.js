/**
 * summary: "parses and renders nested if-model markup with model matching and fail-closed diagnostics."
 * read_when:
 *   - "changing conditional prompt syntax, model-spec matching, nesting, or error reporting."
 */
/**
 * Pure <if-model> conditional renderer.
 *
 * Ported semantically from npm:pi-prompt-template-model so nested conditionals,
 * comma-separated model specs, provider wildcards, and invalid markup diagnostics
 * can be tested without loading the external package live.
 */

function isValidSpec(spec) {
  if (!spec || /\s/.test(spec)) return false;
  if (spec.includes("*")) {
    const segments = spec.split("/");
    return segments.length === 2 && segments[0].length > 0 && segments[1] === "*";
  }

  const segments = spec.split("/");
  if (segments.length === 1) return true;
  if (segments.length !== 2) return false;
  return segments[0].length > 0 && segments[1].length > 0;
}

function modelRef(model) {
  return model ? { provider: model.provider, id: model.id } : { provider: "", id: "" };
}

function matchSpec(spec, model) {
  const ref = modelRef(model);
  if (spec === `${ref.provider}/${ref.id}`) return true;
  if (spec === ref.id) return true;
  if (spec === `${ref.provider}/*`) return true;
  return false;
}

function parseIfModelTag(tagContent) {
  let cursor = 0;
  const attributes = new Map();

  while (cursor < tagContent.length) {
    while (cursor < tagContent.length && /\s/.test(tagContent[cursor])) cursor += 1;
    if (cursor >= tagContent.length) break;

    const nameStart = cursor;
    while (cursor < tagContent.length && /[a-z-]/.test(tagContent[cursor])) cursor += 1;
    if (nameStart === cursor) {
      return { ok: false, error: { message: "Invalid `<if-model>` attribute syntax." } };
    }

    const name = tagContent.slice(nameStart, cursor);
    while (cursor < tagContent.length && /\s/.test(tagContent[cursor])) cursor += 1;
    if (tagContent[cursor] !== "=") {
      return { ok: false, error: { message: `Attribute "${name}" in \`<if-model>\` must use =.` } };
    }
    cursor += 1;
    while (cursor < tagContent.length && /\s/.test(tagContent[cursor])) cursor += 1;
    if (tagContent[cursor] !== '"') {
      return {
        ok: false,
        error: { message: `Attribute "${name}" in \`<if-model>\` must use double quotes.` },
      };
    }
    cursor += 1;
    const valueStart = cursor;
    while (cursor < tagContent.length && tagContent[cursor] !== '"') cursor += 1;
    if (cursor >= tagContent.length) {
      return { ok: false, error: { message: "Unterminated quoted attribute in `<if-model>`." } };
    }
    const value = tagContent.slice(valueStart, cursor);
    cursor += 1;

    if (attributes.has(name)) {
      return { ok: false, error: { message: `Duplicate attribute "${name}" in \`<if-model>\`.` } };
    }
    attributes.set(name, value);
  }

  if (!attributes.has("is")) {
    return { ok: false, error: { message: "`<if-model>` requires an `is` attribute." } };
  }

  for (const name of attributes.keys()) {
    if (name !== "is") {
      return { ok: false, error: { message: `Unknown attribute "${name}" in \`<if-model>\`.` } };
    }
  }

  const specs = attributes
    .get("is")
    .split(",")
    .map((spec) => spec.trim())
    .filter(Boolean);

  if (specs.length === 0) {
    return { ok: false, error: { message: "`<if-model>` must declare at least one model spec." } };
  }

  for (const spec of specs) {
    if (!isValidSpec(spec)) {
      return {
        ok: false,
        error: { message: `Invalid model spec ${JSON.stringify(spec)} in \`<if-model>\`.` },
      };
    }
  }

  return { type: "open", specs };
}

function isDirectiveBoundaryChar(char) {
  return char === undefined || char === ">" || /\s/.test(char);
}

function readToken(input, index) {
  if (input.startsWith("</if-model>", index)) {
    return { token: { type: "close" }, length: "</if-model>".length };
  }

  if (
    input.startsWith("</if-model", index) &&
    isDirectiveBoundaryChar(input[index + "</if-model".length])
  ) {
    return {
      ok: false,
      error: { message: "`</if-model>` cannot have attributes or extra characters." },
    };
  }

  if (input.startsWith("<else>", index)) {
    return { token: { type: "else" }, length: "<else>".length };
  }

  if (input.startsWith("<else", index) && isDirectiveBoundaryChar(input[index + "<else".length])) {
    return {
      ok: false,
      error: { message: "`<else>` cannot have attributes or extra characters." },
    };
  }

  if (input.startsWith("</else>", index)) {
    return {
      ok: false,
      error: {
        message:
          "`</else>` is not valid. `<else>` is a separator, not a container - use `<else>content</if-model>` instead.",
      },
    };
  }

  if (
    input.startsWith("</else", index) &&
    isDirectiveBoundaryChar(input[index + "</else".length])
  ) {
    return {
      ok: false,
      error: {
        message:
          "`</else>` is not valid. `<else>` is a separator, not a container - use `<else>content</if-model>` instead.",
      },
    };
  }

  if (!input.startsWith("<if-model", index)) return undefined;

  const closeIndex = input.indexOf(">", index);
  if (closeIndex === -1) {
    return { ok: false, error: { message: "Missing closing `>` for `<if-model>`." } };
  }

  const nextChar = input[index + "<if-model".length];
  if (nextChar !== undefined && nextChar !== ">" && !/\s/.test(nextChar)) return undefined;

  const parsed = parseIfModelTag(input.slice(index + "<if-model".length, closeIndex));
  if ("ok" in parsed && !parsed.ok) return parsed;
  return { token: parsed, length: closeIndex - index + 1 };
}

function appendNode(stack, root, node) {
  const frame = stack[stack.length - 1];
  if (!frame) {
    root.push(node);
    return;
  }
  if (frame.inElse) frame.falsy.push(node);
  else frame.truthy.push(node);
}

function parseNodes(input) {
  const root = [];
  const stack = [];
  let cursor = 0;
  let textStart = 0;

  while (cursor < input.length) {
    if (input[cursor] !== "<") {
      cursor += 1;
      continue;
    }

    const tokenResult = readToken(input, cursor);
    if (!tokenResult) {
      cursor += 1;
      continue;
    }
    if ("ok" in tokenResult && !tokenResult.ok) return tokenResult;

    if (textStart < cursor) {
      appendNode(stack, root, { type: "text", value: input.slice(textStart, cursor) });
    }

    const { token, length } = tokenResult;
    if (token.type === "open") {
      stack.push({ specs: token.specs, truthy: [], falsy: [], inElse: false });
    } else if (token.type === "else") {
      const frame = stack[stack.length - 1];
      if (!frame)
        return { ok: false, error: { message: "Found orphan `<else>` outside `<if-model>`." } };
      if (frame.inElse) {
        return {
          ok: false,
          error: { message: "Found multiple `<else>` tags in one `<if-model>` block." },
        };
      }
      frame.inElse = true;
    } else {
      const frame = stack.pop();
      if (!frame) {
        return {
          ok: false,
          error: { message: "Found closing `</if-model>` without a matching `<if-model>`." },
        };
      }
      appendNode(stack, root, {
        type: "if",
        specs: frame.specs,
        truthy: frame.truthy,
        falsy: frame.falsy,
      });
    }

    cursor += length;
    textStart = cursor;
  }

  if (textStart < input.length)
    appendNode(stack, root, { type: "text", value: input.slice(textStart) });
  if (stack.length > 0) {
    return { ok: false, error: { message: "Missing closing `</if-model>` tag." } };
  }
  return { ok: true, nodes: root };
}

function renderNodes(nodes, model) {
  let output = "";
  for (const node of nodes) {
    if (node.type === "text") {
      output += node.value;
      continue;
    }
    const branch = node.specs.some((spec) => matchSpec(spec, model)) ? node.truthy : node.falsy;
    output += renderNodes(branch, model);
  }
  return output;
}

export function renderModelConditionals(content, model, commandName) {
  const input = String(content ?? "");
  if (
    !input.includes("<if-model") &&
    !input.includes("<else") &&
    !input.includes("</if-model") &&
    !input.includes("</else")
  ) {
    return { content: input };
  }

  const parsed = parseNodes(input);
  if (parsed.ok) return { content: renderNodes(parsed.nodes, model) };

  const label = commandName ? ` in prompt \`${commandName}\`` : "";
  return {
    content: input,
    error: `Invalid <if-model> markup${label}: ${parsed.error.message}`,
  };
}

export const modelConditionalInternals = {
  isValidSpec,
  matchSpec,
};
