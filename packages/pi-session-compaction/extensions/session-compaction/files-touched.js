/**
 * Files-touched recovery and manifest rendering for compaction summaries.
 *
 * Ported from dot314 grounded-compaction's shared files-touched core, with
 * package-local manifest helpers for pi-session-compaction.
 */
import * as fs from "node:fs";
import path from "node:path";

function uniqStrings(values) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
function normalizePathSeparators(value) {
  return value.replace(/\\/g, "/");
}
function normalizeSegments(value) {
  const normalized = normalizePathSeparators(value);
  const segments = [];
  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length > 0 && segments[segments.length - 1] !== "..") {
        segments.pop();
        continue;
      }
    }
    segments.push(segment);
  }
  return segments.join("/");
}
function normalizeRelativePath(value) {
  return normalizeSegments(value.trim());
}
function normalizeAbsolutePath(value) {
  const normalized = normalizePathSeparators(value.trim());
  const windowsMatch = normalized.match(/^([A-Za-z]:)(?:\/(.*))?$/);
  if (windowsMatch) {
    const segments2 = normalizeSegments(windowsMatch[2] ?? "");
    return segments2 ? `${windowsMatch[1]}/${segments2}` : `${windowsMatch[1]}/`;
  }
  const segments = normalizeSegments(normalized);
  return segments ? `/${segments}` : "/";
}
function isAbsolutePath(value) {
  const normalized = normalizePathSeparators(value.trim());
  return normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
}
function stripReadSliceSuffix(value) {
  return value.replace(/:(\d+)-(\d+)$/, "");
}
function firstDefinedString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return null;
}
function parseRootPrefixedPath(value) {
  const normalized = normalizePathSeparators(value.trim());
  if (!normalized || isAbsolutePath(normalized)) {
    return null;
  }
  const match = normalized.match(/^([^/:]+):(.*)$/);
  if (!match) {
    return null;
  }
  const relativePath = normalizeRelativePath(match[2] ?? "");
  if (!relativePath) {
    return null;
  }
  return {
    root: match[1],
    relativePath,
  };
}
function splitPathSegments(value) {
  return normalizePathSeparators(value).split("/").filter(Boolean);
}
function deriveRootFromAbsoluteAndRelative(absPath, relativePath) {
  const absSegments = splitPathSegments(normalizeAbsolutePath(absPath));
  const relSegments = splitPathSegments(normalizeRelativePath(relativePath));
  if (relSegments.length === 0 || absSegments.length <= relSegments.length) {
    return null;
  }
  for (let index = 1; index <= relSegments.length; index += 1) {
    if (absSegments[absSegments.length - index] !== relSegments[relSegments.length - index]) {
      return null;
    }
  }
  return `/${absSegments.slice(0, absSegments.length - relSegments.length).join("/")}`;
}
function inferRootMappings(paths) {
  const absolutePaths = uniqStrings(
    paths.filter((value) => isAbsolutePath(value)).map((value) => normalizeAbsolutePath(value)),
  );
  const rootRefs = paths
    .map((value) => parseRootPrefixedPath(value))
    .filter((value) => Boolean(value));
  const scoresByRoot = /* @__PURE__ */ new Map();
  for (const ref of rootRefs) {
    const rootScores = scoresByRoot.get(ref.root) ?? /* @__PURE__ */ new Map();
    for (const absolutePath of absolutePaths) {
      const candidateRoot = deriveRootFromAbsoluteAndRelative(absolutePath, ref.relativePath);
      if (!candidateRoot) {
        continue;
      }
      const bonus = path.basename(candidateRoot) === ref.root ? 2 : 1;
      rootScores.set(candidateRoot, (rootScores.get(candidateRoot) ?? 0) + bonus);
    }
    scoresByRoot.set(ref.root, rootScores);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [root, scores] of scoresByRoot) {
    const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
    if (ranked.length === 0) {
      continue;
    }
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
      continue;
    }
    out.set(root, ranked[0][0]);
  }
  return out;
}
function getCurrentRootInfo(cwd) {
  if (!cwd || !isAbsolutePath(cwd)) {
    return null;
  }
  const absolutePath = normalizeAbsolutePath(cwd);
  return {
    absolutePath,
    name: path.basename(absolutePath),
  };
}
function buildRootMappings(paths, cwd) {
  const mappings = inferRootMappings(paths);
  const currentRoot = getCurrentRootInfo(cwd);
  if (currentRoot) {
    mappings.set(currentRoot.name, currentRoot.absolutePath);
  }
  return mappings;
}
function isWithinPath(filePath, rootPath) {
  return filePath === rootPath || filePath.startsWith(`${rootPath}/`);
}
function findRootForAbsolutePath(absolutePath, rootMappings) {
  const normalizedAbsolutePath = normalizeAbsolutePath(absolutePath);
  let bestMatch = null;
  for (const [root, rootPath] of rootMappings) {
    if (!isWithinPath(normalizedAbsolutePath, rootPath) || normalizedAbsolutePath === rootPath) {
      continue;
    }
    const relativePath = normalizedAbsolutePath.slice(rootPath.length + 1);
    if (!relativePath) {
      continue;
    }
    if (!bestMatch || rootPath.length > bestMatch.rootPathLength) {
      bestMatch = { root, relativePath, rootPathLength: rootPath.length };
    }
  }
  return bestMatch ? { root: bestMatch.root, relativePath: bestMatch.relativePath } : null;
}
function normalizeTrackedPath(pathValue, rootMappings, cwd) {
  const strippedPath = stripReadSliceSuffix(pathValue.trim());
  if (!strippedPath) {
    return "";
  }
  const rootPrefixed = parseRootPrefixedPath(strippedPath);
  if (rootPrefixed) {
    return `${rootPrefixed.root}:${rootPrefixed.relativePath}`;
  }
  if (isAbsolutePath(strippedPath)) {
    const rooted = findRootForAbsolutePath(strippedPath, rootMappings);
    return rooted ? `${rooted.root}:${rooted.relativePath}` : normalizeAbsolutePath(strippedPath);
  }
  const currentRoot = getCurrentRootInfo(cwd);
  let relativePath = strippedPath;
  if (
    currentRoot &&
    (relativePath === currentRoot.name || relativePath.startsWith(`${currentRoot.name}/`))
  ) {
    relativePath =
      relativePath === currentRoot.name ? "" : relativePath.slice(currentRoot.name.length + 1);
  }
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) {
    return currentRoot?.absolutePath ?? "";
  }
  const rootedRelative = [...rootMappings.keys()]
    .sort((left, right) => right.length - left.length)
    .find((root) => normalizedRelativePath.startsWith(`${root}/`));
  if (rootedRelative) {
    return `${rootedRelative}:${normalizedRelativePath.slice(rootedRelative.length + 1)}`;
  }
  return currentRoot ? `${currentRoot.name}:${normalizedRelativePath}` : normalizedRelativePath;
}
function resolveCanonicalPath(canonicalPath, rootMappings, cwd) {
  if (!canonicalPath) {
    return canonicalPath;
  }
  if (isAbsolutePath(canonicalPath)) {
    return normalizeAbsolutePath(canonicalPath);
  }
  const rootPrefixed = parseRootPrefixedPath(canonicalPath);
  if (rootPrefixed) {
    const currentRoot2 = getCurrentRootInfo(cwd);
    const rootPath =
      rootMappings.get(rootPrefixed.root) ??
      (currentRoot2?.name === rootPrefixed.root ? currentRoot2.absolutePath : null);
    if (!rootPath) {
      return canonicalPath;
    }
    return `${rootPath}/${rootPrefixed.relativePath}`;
  }
  const normalizedRelativePath = normalizeRelativePath(canonicalPath);
  if (!normalizedRelativePath) {
    return getCurrentRootInfo(cwd)?.absolutePath ?? canonicalPath;
  }
  const currentRoot = getCurrentRootInfo(cwd);
  return currentRoot
    ? `${currentRoot.absolutePath}/${normalizedRelativePath}`
    : normalizedRelativePath;
}
function fallbackDisplayPath(canonicalPath) {
  const rootPrefixed = parseRootPrefixedPath(canonicalPath);
  if (!rootPrefixed) {
    return canonicalPath;
  }
  return `${rootPrefixed.root}/${rootPrefixed.relativePath}`;
}
function findRepoRootForDisplay(absolutePath, currentRoot) {
  const normalizedAbsolutePath = normalizeAbsolutePath(absolutePath);
  if (currentRoot && isWithinPath(normalizedAbsolutePath, currentRoot)) {
    return currentRoot;
  }
  let candidate = normalizedAbsolutePath;
  try {
    const stats = fs.existsSync(candidate) ? fs.statSync(candidate) : null;
    if (stats?.isFile()) {
      candidate = normalizeAbsolutePath(path.dirname(candidate));
    }
  } catch {}
  while (true) {
    if (fs.existsSync(path.join(candidate, ".git"))) {
      return candidate;
    }
    const parent = normalizeAbsolutePath(path.dirname(candidate));
    if (parent === candidate) {
      return null;
    }
    candidate = parent;
  }
}
function displayPathForTrackedPath(canonicalPath, resolvedPath, cwd) {
  if (!resolvedPath || !isAbsolutePath(resolvedPath)) {
    return fallbackDisplayPath(canonicalPath);
  }
  const currentRoot = getCurrentRootInfo(cwd);
  if (currentRoot && isWithinPath(resolvedPath, currentRoot.absolutePath)) {
    return resolvedPath.slice(currentRoot.absolutePath.length + 1);
  }
  const repoRoot = findRepoRootForDisplay(resolvedPath, currentRoot?.absolutePath ?? null);
  if (!repoRoot || !isWithinPath(resolvedPath, repoRoot)) {
    return fallbackDisplayPath(canonicalPath) || resolvedPath;
  }
  const relativePath = resolvedPath.slice(repoRoot.length + 1);
  return relativePath ? `${path.basename(repoRoot)}/${relativePath}` : path.basename(repoRoot);
}
function resolveMoveRedirect(pathValue, redirects) {
  let current = pathValue;
  const seen = /* @__PURE__ */ new Set();
  while (redirects.has(current) && !seen.has(current)) {
    seen.add(current);
    current = redirects.get(current) ?? current;
  }
  return current;
}
function extractJsonObject(text, prefix) {
  const trimmed = text.trim();
  if (!trimmed.startsWith(prefix)) {
    return null;
  }
  const jsonText = trimmed.slice(prefix.length).trim();
  if (!jsonText.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function extractCliNamedArg(cmd, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cmd.match(new RegExp(`(?:^|\\s)${escapedKey}=(?:"([^"]+)"|'([^']+)'|(\\S+))`));
  return firstDefinedString(...(match?.slice(1) ?? []));
}
function commandStartsWith(cmd, name) {
  const trimmed = cmd.trim();
  return trimmed === name || trimmed.startsWith(`${name} `);
}
function extractReadPathFromCliCommand(cmd) {
  const readFileMatch = cmd.match(/(?:^|\s)read_file\s+.*?\bpath=(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (readFileMatch) {
    return stripReadSliceSuffix(firstDefinedString(...readFileMatch.slice(1)) ?? "");
  }
  const simpleReadMatch = cmd.match(/^(?:read|cat)\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (simpleReadMatch) {
    return stripReadSliceSuffix(firstDefinedString(...simpleReadMatch.slice(1)) ?? "");
  }
  return null;
}
function tokenizeShellCommand(cmd) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  const flush = () => {
    if (current) {
      tokens.push(current);
      current = "";
    }
  };
  for (let index = 0; index < cmd.length; index += 1) {
    const char = cmd[index];
    const next = cmd[index + 1] ?? "";
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (quote) {
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
        continue;
      }
      current += char;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (char === ";") {
      flush();
      tokens.push(char);
      continue;
    }
    if ((char === "&" || char === "|") && next === char) {
      flush();
      tokens.push(char + next);
      index += 1;
      continue;
    }
    if (char === "&" || char === "|") {
      flush();
      tokens.push(char);
      continue;
    }
    current += char;
  }
  flush();
  return tokens;
}
function splitShellCommands(cmd) {
  const commands = [];
  let current = [];
  for (const token of tokenizeShellCommand(cmd)) {
    if (token === ";" || token === "&&" || token === "||" || token === "|" || token === "&") {
      if (current.length > 0) {
        commands.push(current);
        current = [];
      }
      continue;
    }
    current.push(token);
  }
  if (current.length > 0) {
    commands.push(current);
  }
  return commands;
}
function stripShellCommandWrappers(tokens) {
  let current = [...tokens];
  while (current.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(current[0])) {
    current = current.slice(1);
  }
  for (const wrapper of ["command", "env", "noglob", "sudo"]) {
    if (current[0] !== wrapper) {
      continue;
    }
    current = current.slice(1);
    while (current.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(current[0])) {
      current = current.slice(1);
    }
  }
  return current;
}
function extractShellOperands(tokens) {
  const operands = [];
  let allowFlags = true;
  for (const token of tokens) {
    if (allowFlags && token === "--") {
      allowFlags = false;
      continue;
    }
    if (allowFlags && token.startsWith("-")) {
      continue;
    }
    operands.push(token);
  }
  return operands;
}
function isIgnoredRedirectTarget(value) {
  return value === "/dev/null" || value === "/dev/stderr" || value === "/dev/stdout";
}
function extractRedirectWriteTargets(tokens, actions) {
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === ">" || token === ">>") {
      if (i + 1 < tokens.length && !isIgnoredRedirectTarget(tokens[i + 1])) {
        actions.push({ kind: "touch", path: tokens[i + 1], operation: "write" });
      }
      i += 1;
      continue;
    }
    if (token.startsWith(">>") && token.length > 2) {
      const target = token.slice(2);
      if (!isIgnoredRedirectTarget(target)) {
        actions.push({ kind: "touch", path: target, operation: "write" });
      }
      continue;
    }
    if (token.startsWith(">") && token.length > 1) {
      const target = token.slice(1);
      if (!isIgnoredRedirectTarget(target)) {
        actions.push({ kind: "touch", path: target, operation: "write" });
      }
    }
  }
}
function looksLikeSedExpression(value) {
  return /^[sy]?\/.+\//.test(value) || /^\d+[,\d]*[acdipqs]?$/.test(value);
}
function stripRedirectTokens(tokens) {
  const result = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === ">" || token === ">>" || token === ">|" || token === "<") {
      i += 1;
      continue;
    }
    if (token === "<<" || token === "<<-" || token === "<<~") {
      i += 1;
      continue;
    }
    if (
      token.startsWith(">>") ||
      token.startsWith(">") ||
      token.startsWith("<<") ||
      token.startsWith("<")
    ) {
      continue;
    }
    result.push(token);
  }
  return result;
}
function stripHeredocBodies(cmd) {
  const lines = cmd.split("\n");
  const result = [];
  let terminator = null;
  let justClosedHeredoc = false;
  for (const line of lines) {
    if (terminator !== null) {
      if (line.trim() === terminator) {
        terminator = null;
        justClosedHeredoc = true;
      }
      continue;
    }
    const match = line.match(/<<-?\s*(?:['"]([\w]+)['"]|([\w]+))/);
    if (match) {
      terminator = match[1] ?? match[2];
    }
    if (justClosedHeredoc) {
      result.push(`; ${line}`);
      justClosedHeredoc = false;
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}
function parseBashActions(cmd) {
  const actions = [];
  for (const tokens of splitShellCommands(stripHeredocBodies(cmd))) {
    extractRedirectWriteTargets(tokens, actions);
    const command = stripShellCommandWrappers(stripRedirectTokens(tokens));
    if (command.length === 0) {
      continue;
    }
    if (command[0] === "git" && command[1] === "mv") {
      const operands = extractShellOperands(command.slice(2));
      if (operands.length === 2) {
        actions.push({ kind: "move", from: operands[0], to: operands[1] });
      }
      continue;
    }
    if (command[0] === "git" && command[1] === "rm") {
      for (const operand of extractShellOperands(command.slice(2))) {
        actions.push({ kind: "touch", path: operand, operation: "delete" });
      }
      continue;
    }
    if (command[0] === "mv") {
      const operands = extractShellOperands(command.slice(1));
      if (operands.length === 2) {
        actions.push({ kind: "move", from: operands[0], to: operands[1] });
      }
      continue;
    }
    if (
      command[0] === "rm" ||
      command[0] === "trash" ||
      command[0] === "trash-put" ||
      command[0] === "unlink"
    ) {
      for (const operand of extractShellOperands(command.slice(1))) {
        actions.push({ kind: "touch", path: operand, operation: "delete" });
      }
      continue;
    }
    if (command[0] === "sed") {
      if (command.some((t) => /^-[a-z]*i/.test(t))) {
        const hasExplicitExpr = command.some((t) => t === "-e" || t === "-f");
        const operands = extractShellOperands(command.slice(1));
        const fileOperands = hasExplicitExpr ? operands : operands.slice(1);
        for (const operand of fileOperands) {
          if (!looksLikeSedExpression(operand)) {
            actions.push({ kind: "touch", path: operand, operation: "edit" });
          }
        }
      }
      continue;
    }
    if (command[0] === "cp" || command[0] === "rsync") {
      const operands = extractShellOperands(command.slice(1));
      if (operands.length >= 2) {
        actions.push({ kind: "touch", path: operands[operands.length - 1], operation: "write" });
      }
      continue;
    }
    if (command[0] === "tee") {
      for (const operand of extractShellOperands(command.slice(1))) {
        actions.push({ kind: "touch", path: operand, operation: "write" });
      }
      continue;
    }
    if (command[0] === "touch") {
      for (const operand of extractShellOperands(command.slice(1))) {
        actions.push({ kind: "touch", path: operand, operation: "write" });
      }
      continue;
    }
    if (command[0] === "patch") {
      const operands = extractShellOperands(command.slice(1));
      if (operands.length >= 1) {
        actions.push({ kind: "touch", path: operands[0], operation: "edit" });
      }
      continue;
    }
    if (command[0] === "curl") {
      for (let i = 1; i < command.length; i++) {
        if ((command[i] === "-o" || command[i] === "--output") && i + 1 < command.length) {
          actions.push({ kind: "touch", path: command[i + 1], operation: "write" });
          break;
        }
      }
      continue;
    }
    if (command[0] === "wget") {
      for (let i = 1; i < command.length; i++) {
        if ((command[i] === "-O" || command[i] === "--output-document") && i + 1 < command.length) {
          actions.push({ kind: "touch", path: command[i + 1], operation: "write" });
          break;
        }
      }
      continue;
    }
    if (command[0] === "cat" || command[0] === "head" || command[0] === "tail") {
      for (const operand of extractShellOperands(command.slice(1))) {
        actions.push({ kind: "touch", path: operand, operation: "read" });
      }
    }
  }
  return actions;
}
function parseRpExecActions(cmd) {
  const normalized = cmd.trim();
  if (!normalized) {
    return [];
  }
  const actions = [];
  const readFileArgs = extractJsonObject(normalized, "call read_file");
  if (readFileArgs && typeof readFileArgs.path === "string") {
    actions.push({
      kind: "touch",
      path: stripReadSliceSuffix(readFileArgs.path),
      operation: "read",
    });
  }
  const applyEditsArgs = extractJsonObject(normalized, "call apply_edits");
  if (applyEditsArgs && typeof applyEditsArgs.path === "string") {
    actions.push({ kind: "touch", path: applyEditsArgs.path, operation: "edit" });
  }
  const fileActionsArgs = extractJsonObject(normalized, "call file_actions");
  if (fileActionsArgs) {
    const action = typeof fileActionsArgs.action === "string" ? fileActionsArgs.action : "";
    const targetPath = typeof fileActionsArgs.path === "string" ? fileActionsArgs.path : null;
    const newPath = typeof fileActionsArgs.new_path === "string" ? fileActionsArgs.new_path : null;
    if (action === "create" && targetPath) {
      actions.push({ kind: "touch", path: targetPath, operation: "write" });
    }
    if (action === "delete" && targetPath) {
      actions.push({ kind: "touch", path: targetPath, operation: "delete" });
    }
    if (action === "move" && targetPath && newPath) {
      actions.push({ kind: "move", from: targetPath, to: newPath });
    }
  }
  if (commandStartsWith(normalized, "apply_edits")) {
    const targetPath = extractCliNamedArg(normalized, "path");
    if (targetPath) {
      actions.push({ kind: "touch", path: targetPath, operation: "edit" });
    }
  }
  if (commandStartsWith(normalized, "file_actions")) {
    const action = extractCliNamedArg(normalized, "action");
    const targetPath = extractCliNamedArg(normalized, "path");
    const newPath = extractCliNamedArg(normalized, "new_path");
    if (action === "create" && targetPath) {
      actions.push({ kind: "touch", path: targetPath, operation: "write" });
    }
    if (action === "delete" && targetPath) {
      actions.push({ kind: "touch", path: targetPath, operation: "delete" });
    }
    if (action === "move" && targetPath && newPath) {
      actions.push({ kind: "move", from: targetPath, to: newPath });
    }
  }
  for (const command of splitShellCommands(normalized)) {
    if (command[0] !== "file") {
      continue;
    }
    if (command[1] === "delete") {
      for (const operand of extractShellOperands(command.slice(2))) {
        actions.push({ kind: "touch", path: operand, operation: "delete" });
      }
      continue;
    }
    if (command[1] === "move") {
      const operands = extractShellOperands(command.slice(2));
      if (operands.length === 2) {
        actions.push({ kind: "move", from: operands[0], to: operands[1] });
      }
    }
  }
  const readPath = extractReadPathFromCliCommand(normalized);
  if (readPath) {
    actions.push({ kind: "touch", path: readPath, operation: "read" });
  }
  return actions;
}
function getTrackedToolActions(name, args) {
  if ((name === "read" || name === "write" || name === "edit") && typeof args.path === "string") {
    return [{ kind: "touch", path: args.path, operation: name }];
  }
  if (name === "rp") {
    const rpCall = typeof args.call === "string" ? args.call : null;
    const rpArgs =
      args.args && typeof args.args === "object" && !Array.isArray(args.args) ? args.args : null;
    if (!rpCall || !rpArgs) {
      return [];
    }
    if (rpCall === "read_file" && typeof rpArgs.path === "string") {
      return [{ kind: "touch", path: rpArgs.path, operation: "read" }];
    }
    if (rpCall === "apply_edits" && typeof rpArgs.path === "string") {
      return [{ kind: "touch", path: rpArgs.path, operation: "edit" }];
    }
    if (rpCall === "file_actions") {
      const action = typeof rpArgs.action === "string" ? rpArgs.action : "";
      if (action === "create" && typeof rpArgs.path === "string") {
        return [{ kind: "touch", path: rpArgs.path, operation: "write" }];
      }
      if (action === "delete" && typeof rpArgs.path === "string") {
        return [{ kind: "touch", path: rpArgs.path, operation: "delete" }];
      }
      if (
        action === "move" &&
        typeof rpArgs.path === "string" &&
        typeof rpArgs.new_path === "string"
      ) {
        return [{ kind: "move", from: rpArgs.path, to: rpArgs.new_path }];
      }
    }
  }
  if (name === "rp_exec") {
    const cmd = typeof args.cmd === "string" ? args.cmd : "";
    return parseRpExecActions(cmd);
  }
  if (name === "bash") {
    const command = typeof args.command === "string" ? args.command : "";
    return parseBashActions(command);
  }
  return [];
}
function extractTextFromContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      return typeof block.text === "string" ? block.text : "";
    })
    .filter(Boolean)
    .join("\n");
}
function getToolCallId(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return firstDefinedString(value.id, value.toolCallId, value.tool_call_id, value.tool_use_id);
}
function collectFilesTouched(entries, cwd) {
  const toolCalls = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (entry.type !== "message") {
      continue;
    }
    const msg = entry.message;
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) {
      continue;
    }
    for (const block of msg.content) {
      if (!block || typeof block !== "object" || block.type !== "toolCall") {
        continue;
      }
      const toolCallId = getToolCallId(block);
      const toolName = typeof block.name === "string" ? block.name : "";
      const args = block.arguments;
      const argObject = args && typeof args === "object" && !Array.isArray(args) ? args : {};
      if (!toolCallId || !toolName) {
        continue;
      }
      const actions = getTrackedToolActions(toolName, argObject);
      if (actions.length > 0) {
        toolCalls.set(toolCallId, actions);
      }
    }
  }
  const touches = [];
  const moves = [];
  for (const entry of entries) {
    if (entry.type !== "message") {
      continue;
    }
    const msg = entry.message;
    if (msg.role !== "toolResult" || msg.isError) {
      continue;
    }
    const toolCallId = firstDefinedString(msg.toolCallId, msg.tool_call_id, msg.tool_use_id);
    if (!toolCallId) {
      continue;
    }
    const actions = toolCalls.get(toolCallId);
    if (!actions || actions.length === 0) {
      continue;
    }
    const toolResultText = extractTextFromContent(msg.content);
    const isNoOpEdit = /applied:\s*0|no changes applied|nothing to (?:do|change)/i.test(
      toolResultText,
    );
    for (const action of actions) {
      if (action.kind === "move") {
        moves.push({ from: action.from, to: action.to });
        touches.push({
          path: action.to,
          operation: "move",
          timestamp: msg.timestamp,
        });
        continue;
      }
      if (isNoOpEdit && action.operation === "edit") {
        continue;
      }
      touches.push({
        path: action.path,
        operation: action.operation,
        timestamp: msg.timestamp,
      });
    }
  }
  const rootMappings = buildRootMappings(
    [...touches.map((touch) => touch.path), ...moves.flatMap((move) => [move.from, move.to])],
    cwd,
  );
  const redirects = /* @__PURE__ */ new Map();
  for (const move of moves) {
    const fromPath = normalizeTrackedPath(move.from, rootMappings, cwd);
    const toPath = normalizeTrackedPath(move.to, rootMappings, cwd);
    if (fromPath && toPath && fromPath !== toPath) {
      redirects.set(fromPath, toPath);
    }
  }
  const merged = /* @__PURE__ */ new Map();
  for (const touch of touches) {
    const normalizedPath = normalizeTrackedPath(touch.path, rootMappings, cwd);
    const canonicalPath = resolveMoveRedirect(normalizedPath, redirects);
    if (!canonicalPath) {
      continue;
    }
    const existing = merged.get(canonicalPath);
    if (existing) {
      existing.operations.add(touch.operation);
      if (touch.timestamp > existing.lastTimestamp) {
        existing.lastTimestamp = touch.timestamp;
      }
      continue;
    }
    merged.set(canonicalPath, {
      operations: /* @__PURE__ */ new Set([touch.operation]),
      lastTimestamp: touch.timestamp,
    });
  }
  const prepared = [...merged.entries()]
    .map(([canonicalPath, value]) => {
      const resolvedPath = resolveCanonicalPath(canonicalPath, rootMappings, cwd);
      return {
        canonicalPath,
        path: resolvedPath,
        displayPath: displayPathForTrackedPath(canonicalPath, resolvedPath, cwd),
        operations: value.operations,
        lastTimestamp: value.lastTimestamp,
      };
    })
    .sort((left, right) => right.lastTimestamp - left.lastTimestamp);
  const displayCounts = /* @__PURE__ */ new Map();
  for (const file of prepared) {
    displayCounts.set(file.displayPath, (displayCounts.get(file.displayPath) ?? 0) + 1);
  }
  return prepared.map((file) => ({
    path: file.path,
    displayPath: (displayCounts.get(file.displayPath) ?? 0) > 1 ? file.path : file.displayPath,
    operations: file.operations,
    lastTimestamp: file.lastTimestamp,
  }));
}
export { collectFilesTouched };

const FILES_TOUCHED_LEGEND = "R=read, W=write, E=edit, M=move/rename, D=delete";

export function formatManifestOperations(file) {
  const operations = [];
  if (file.operations.has("read")) operations.push("R");
  if (file.operations.has("write")) operations.push("W");
  if (file.operations.has("edit")) operations.push("E");
  if (file.operations.has("move")) operations.push("M");
  if (file.operations.has("delete")) operations.push("D");
  return operations.join("").padEnd(2, " ");
}

export function renderFilesTouchedManifestBlock(files, heading = "## Files touched") {
  const lines = [heading, FILES_TOUCHED_LEGEND, "", "```text"];

  if (files.length === 0) {
    lines.push("(no tracked files)");
  } else {
    for (const file of files) {
      lines.push(`${formatManifestOperations(file)} ${file.displayPath}`);
    }
  }

  lines.push("```");
  return lines.join("\n");
}
