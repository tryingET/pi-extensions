// In-memory TypeScript contract gate and transpiler for the `typescript` tool.
//
// Derived from cv/pic v0.2.37 `src/typescript/compiler.ts` (Copyright Carlos
// Villela, Apache-2.0): checking the snippet inside a program over a contract .d.ts
// plus a `(snippet) satisfies ToolProgram` wrapper is Pic's mechanism. Dropped
// here: saved functions, dependency ordering and Chrome execution. Modified for
// normalized expressions, library-only checking and bounded diagnostics.
// Checking is a correctness aid, NOT a security boundary. See NOTICE.
//
// TypeScript 7 has no classic compiler API (`import ts from "typescript"` exposes only
// `version`). Parsing and checking use `typescript/unstable/sync` over a virtual file
// system holding only the snippet, the contract and the standard library; that API has
// no JavaScript emit, so the runtime script is emitted by TypeScript 7's own `tsc`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Expression,
  isArrowFunction,
  isAsExpression,
  isExpressionStatement,
  isFunctionExpression,
  isNonNullExpression,
  isParenthesizedExpression,
  isSatisfiesExpression,
  isTypeAssertion,
} from "typescript/unstable/ast";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import { API, type Diagnostic, type Program } from "typescript/unstable/sync";

const TOOL_DIR = "/tool";
const CONFIG_FILE = `${TOOL_DIR}/tsconfig.json`;
const CONTRACT_FILE = `${TOOL_DIR}/capability-contract.d.ts`;
const PROGRAM_FILE = `${TOOL_DIR}/program.ts`;
const MAX_DIAGNOSTICS = 8;
export const MAX_CODE_BYTES = 65_536;

const CAPABILITY_CONTRACT = readFileSync(
  fileURLToPath(new URL("capability-contract.d.ts", import.meta.url)),
  "utf8",
);
const TSC = join(
  dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
  "bin",
  "tsc",
);

const CHECK_OPTIONS = {
  lib: ["es2022"],
  module: "esnext",
  moduleResolution: "bundler",
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  target: "es2022",
  types: [],
};

export type SnippetKind = "program" | "expression";
export type GateResult = { ok: true; kind: SnippetKind } | { ok: false; diagnostics: string[] };

export function contractSource(): string {
  return CAPABILITY_CONTRACT;
}

/** Open a TypeScript 7 project over exactly these in-memory files, then close it. */
function withProgram<T>(
  sources: Record<string, string>,
  compilerOptions: Record<string, unknown>,
  use: (program: Program) => T,
): T {
  const config = JSON.stringify({
    compilerOptions,
    files: Object.keys(sources).map((name) => basename(name)),
  });
  const api = new API({
    cwd: TOOL_DIR,
    fs: createVirtualFileSystem({ ...sources, [CONFIG_FILE]: config }),
  });
  try {
    const project = api.updateSnapshot({ openProject: CONFIG_FILE }).getProject(CONFIG_FILE);
    if (!project) {
      throw new Error("TypeScript could not open the in-memory project");
    }
    return use(project.program);
  } finally {
    api.close();
  }
}

/** Accept exactly one top-level expression statement; imports/declarations are rejected. */
export function analyzeSnippet(source: string): { kind: SnippetKind; source: string } {
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > MAX_CODE_BYTES) {
    throw new Error(`Code must be a string of at most ${MAX_CODE_BYTES} UTF-8 bytes`);
  }
  const sources = { [PROGRAM_FILE]: source };
  return withProgram(sources, { noLib: true, noEmit: true, types: [] }, (program) => {
    const parseErrors = program.getSyntacticDiagnostics(PROGRAM_FILE);
    if (parseErrors.length > 0) {
      throw new Error(formatDiagnostics(parseErrors, sources));
    }
    const file = program.getSourceFile(PROGRAM_FILE);
    if (!file || file.statements.length !== 1) {
      throw new Error("Submission must contain exactly one top-level function or expression");
    }
    const [statement] = file.statements;
    if (!statement || !isExpressionStatement(statement)) {
      throw new Error("Imports, exports, and top-level declarations are not supported");
    }
    let expression: Expression = statement.expression;
    // Peel syntax only to classify the runtime value. Keep the original expression
    // for checking: stripping assertions/satisfies here would silently discard typing.
    while (
      isParenthesizedExpression(expression) ||
      isAsExpression(expression) ||
      isTypeAssertion(expression) ||
      isSatisfiesExpression(expression) ||
      isNonNullExpression(expression)
    )
      expression = expression.expression;
    const kind =
      isArrowFunction(expression) || isFunctionExpression(expression) ? "program" : "expression";
    return { kind, source: statement.expression.getText(file) };
  });
}

function wrapForCheck(source: string, kind: SnippetKind): string {
  return kind === "expression"
    ? `const __tool_program: ToolProgram = async () => await (${source});\nvoid __tool_program;`
    : `const __tool_program = (${source}) satisfies ToolProgram;\nvoid __tool_program;`;
}

/** Type-check the snippet against the capability contract; never executes it. */
export function checkSnippet(source: string): GateResult {
  let kind: SnippetKind;
  try {
    const analyzed = analyzeSnippet(source);
    kind = analyzed.kind;
    source = analyzed.source;
  } catch (error) {
    return { ok: false, diagnostics: [error instanceof Error ? error.message : String(error)] };
  }
  const sources = {
    [CONTRACT_FILE]: CAPABILITY_CONTRACT,
    [PROGRAM_FILE]: wrapForCheck(source, kind),
  };
  const diagnostics = withProgram(sources, CHECK_OPTIONS, (program) => [
    ...program.getConfigFileParsingDiagnostics(),
    ...program.getProgramDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ]);
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: formatDiagnostics(diagnostics, sources).split("\n") };
  }
  return { ok: true, kind };
}

/** Emit a complete script whose completion value is the invocation promise. */
export function compileSnippet(source: string, kind: SnippetKind): string {
  source = analyzeSnippet(source).source;
  const body =
    kind === "expression"
      ? `return await (${source});`
      : `const __tool_submission = (${source});\nreturn await __tool_submission(capabilities);`;
  const runtime = `(async (capabilities) => {\n${body}\n})(capabilities);`;
  // Transforms such as decorators prepend helper declarations. Preserve the whole
  // emitted script instead of assuming the output is a single function expression.
  const dir = mkdtempSync(join(tmpdir(), "pi-typescript-tool-"));
  try {
    writeFileSync(join(dir, "snippet.ts"), runtime);
    execFileSync(
      process.execPath,
      [
        TSC,
        "snippet.ts",
        "--ignoreConfig",
        "--noCheck",
        "--target",
        "es2022",
        "--module",
        "preserve",
        "--outDir",
        "out",
        "--pretty",
        "false",
      ],
      { cwd: dir, stdio: ["ignore", "pipe", "pipe"] },
    );
    return readFileSync(join(dir, "out", "snippet.js"), "utf8");
  } catch (error) {
    const output = error instanceof Error && "stdout" in error ? String(error.stdout ?? "") : "";
    throw new Error(`TypeScript emit failed: ${output || String(error)}`.slice(0, 8000));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function messageOf(diagnostic: Diagnostic, depth = 0): string {
  const chain = (diagnostic.messageChain ?? []).map((next) => messageOf(next, depth + 1));
  return [`${"  ".repeat(depth)}${diagnostic.text}`, ...chain].join("\n");
}

function formatDiagnostics(
  diagnostics: readonly Diagnostic[],
  sources: Record<string, string>,
): string {
  const shown = diagnostics.slice(0, MAX_DIAGNOSTICS).map((diagnostic) => {
    const message = messageOf(diagnostic);
    const text = diagnostic.fileName === undefined ? undefined : sources[diagnostic.fileName];
    if (text === undefined) {
      return message;
    }
    const before = text.slice(0, diagnostic.pos);
    const line = before.split("\n").length;
    const column = diagnostic.pos - before.lastIndexOf("\n");
    // Coordinates refer to normalized/wrapped code, not original whitespace or comments.
    return `${line}:${column} ${message}`;
  });
  const omitted = diagnostics.length - shown.length;
  return `${shown.join("\n")}${omitted > 0 ? `\n... ${omitted} more omitted` : ""}`.slice(0, 8000);
}
