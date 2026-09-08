/**
summary: "Refuse source-local temporary storage before creating a ripwire snapshot."
read_when:
  - "Changing private snapshot placement or source non-mutation guarantees."
*/
import { mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { canonicalCorpusRoot } from "./ripwire-corpus.js";

export async function createRipwireScratch(root) {
  const sourceRoot = await canonicalCorpusRoot(root);
  const temporaryRoot = await realpath(tmpdir());
  const rel = relative(sourceRoot, temporaryRoot);
  if (!rel || (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel)))
    throw new Error("unsafe_temporary_directory");
  // Resolve the configured temp parent before creation; source-local aliases are also refused.
  return mkdtemp(join(temporaryRoot, "pi-ripwire-"));
}
