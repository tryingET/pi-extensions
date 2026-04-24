function shellSplit(value) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;

  const push = () => {
    if (current.length > 0) tokens.push(current);
    current = "";
  };

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      push();
      continue;
    }
    current += char;
  }
  push();
  return tokens;
}

export function parsePromptArgs(args) {
  if (Array.isArray(args)) return args.map((arg) => String(arg));
  return shellSplit(String(args ?? "").trim());
}

function sliceArgs(args, startRaw, lengthRaw) {
  const start = Number.parseInt(startRaw, 10);
  if (!Number.isInteger(start) || start < 1) return "";
  const zeroIndex = start - 1;
  if (lengthRaw === undefined) return args.slice(zeroIndex).join(" ");
  const length = Number.parseInt(lengthRaw, 10);
  if (!Number.isInteger(length) || length < 0) return "";
  return args.slice(zeroIndex, zeroIndex + length).join(" ");
}

export function substituteArgs(template, argsInput) {
  const args = parsePromptArgs(argsInput);
  const allArgs = args.join(" ");

  return String(template ?? "")
    .replace(/\$\{@:([1-9][0-9]*)(?::([0-9]+))?\}/g, (_match, start, length) =>
      sliceArgs(args, start, length),
    )
    .replace(/\$ARGUMENTS\b/g, allArgs)
    .replace(/\$@/g, allArgs)
    .replace(
      /\$([1-9][0-9]*)/g,
      (_match, indexRaw) => args[Number.parseInt(indexRaw, 10) - 1] ?? "",
    );
}
