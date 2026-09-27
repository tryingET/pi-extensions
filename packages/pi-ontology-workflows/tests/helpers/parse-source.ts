// Parse a test fixture through TypeScript 7's unstable synchronous API.
// The project is no-lib and no-emit: AST assertions need syntax, not a typecheck.
import type { SourceFile } from "typescript/unstable/ast";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import { API } from "typescript/unstable/sync";

export function parseSource(name: string, source: string): SourceFile {
  const root = "/source";
  const file = `${root}/${name}`;
  const config = `${root}/tsconfig.json`;
  const api = new API({
    cwd: root,
    fs: createVirtualFileSystem({
      [file]: source,
      [config]: JSON.stringify({ compilerOptions: { noLib: true, noEmit: true }, files: [name] }),
    }),
  });
  try {
    const program = api.updateSnapshot({ openProject: config }).getProject(config)?.program;
    const parsed = program?.getSourceFile(file);
    if (!parsed) throw new Error(`TypeScript 7 could not parse ${name}`);
    return parsed;
  } finally {
    api.close();
  }
}
