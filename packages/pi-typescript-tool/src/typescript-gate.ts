// In-memory TypeScript contract gate and transpiler for the `typescript` tool.
//
// Derived from cv/pic v0.2.37 `src/typescript/compiler.ts` (Copyright Carlos
// Villela, Apache-2.0): the in-memory `ts.createProgram` over a contract .d.ts
// plus a `(snippet) satisfies ToolProgram` wrapper is Pic's mechanism. Dropped
// here: saved functions, dependency ordering and Chrome execution. Modified for
// normalized expressions, library-only checking and bounded diagnostics.
// Checking is a correctness aid, NOT a security boundary. See NOTICE.
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const CONTRACT_FILE = "/tool/capability-contract.d.ts";
const PROGRAM_FILE = "/tool/program.ts";
const MAX_DIAGNOSTICS = 8;
export const MAX_CODE_BYTES = 65_536;

const CAPABILITY_CONTRACT = readFileSync(
  fileURLToPath(new URL("capability-contract.d.ts", import.meta.url)),
  "utf8",
);

export type SnippetKind = "program" | "expression";
export type GateResult = { ok: true; kind: SnippetKind } | { ok: false; diagnostics: string[] };

export function contractSource(): string {
  return CAPABILITY_CONTRACT;
}

/** Accept exactly one top-level expression statement; imports/declarations are rejected. */
export function analyzeSnippet(source: string): { kind: SnippetKind; source: string } {
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > MAX_CODE_BYTES) {
    throw new Error(`Code must be a string of at most ${MAX_CODE_BYTES} UTF-8 bytes`);
  }
  const file = ts.createSourceFile(
    PROGRAM_FILE,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const parseErrors = (file as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
    .parseDiagnostics;
  if (parseErrors && parseErrors.length > 0) {
    throw new Error(formatDiagnostics(parseErrors));
  }
  if (file.statements.length !== 1) {
    throw new Error("Submission must contain exactly one top-level function or expression");
  }
  const [statement] = file.statements;
  if (!statement || !ts.isExpressionStatement(statement)) {
    throw new Error("Imports, exports, and top-level declarations are not supported");
  }
  let expression = statement.expression;
  // Peel syntax only to classify the runtime value. Keep the original expression
  // for checking: stripping assertions/satisfies here would silently discard typing.
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  )
    expression = expression.expression;
  const kind =
    ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)
      ? "program"
      : "expression";
  return { kind, source: statement.expression.getText(file) };
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
  const options: ts.CompilerOptions = {
    lib: ["lib.es2022.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: [],
  };
  const baseHost = ts.createCompilerHost(options, true);
  const sources = new Map<string, string>([
    [CONTRACT_FILE, CAPABILITY_CONTRACT],
    [PROGRAM_FILE, wrapForCheck(source, kind)],
  ]);
  const libDir = dirname(ts.getDefaultLibFilePath(options));
  const isLibrary = (name: string) =>
    dirname(name) === libDir && /^lib\.[a-z0-9.]+\.d\.ts$/.test(basename(name));
  const readSource = (name: string) =>
    sources.get(name) ?? (isLibrary(name) ? baseHost.readFile(name) : undefined);
  const host: ts.CompilerHost = {
    ...baseHost,
    fileExists: (name) => sources.has(name) || (isLibrary(name) && baseHost.fileExists(name)),
    getSourceFile: (name, languageVersion) => {
      const contents = readSource(name);
      return contents === undefined
        ? undefined
        : ts.createSourceFile(name, contents, languageVersion, true);
    },
    readFile: readSource,
    getDefaultLibLocation: () => libDir,
    getDefaultLibFileName: () => join(libDir, "lib.es2022.d.ts"),
  };
  const program = ts.createProgram([CONTRACT_FILE, PROGRAM_FILE], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    return { ok: false, diagnostics: formatDiagnostics(diagnostics).split("\n") };
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
  // emitted script instead of assuming outputText is a single function expression.
  return ts.transpileModule(runtime, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  const shown = diagnostics.slice(0, MAX_DIAGNOSTICS).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    if (!diagnostic.file || diagnostic.start === undefined) {
      return message;
    }
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    // Coordinates refer to normalized/wrapped code, not original whitespace or comments.
    return `${position.line + 1}:${position.character + 1} ${message}`;
  });
  const omitted = diagnostics.length - shown.length;
  return `${shown.join("\n")}${omitted > 0 ? `\n... ${omitted} more omitted` : ""}`.slice(0, 8000);
}
