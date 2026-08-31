// ---
// summary: trusted byte-for-byte reconstruction of the ratified tpl-agent-repo v2 system-prompt compiler contract.
// read_when:
//   - changing fleet prompt freshness, canonical persona inputs, or compiler provenance.
// ---

import { createHash } from "node:crypto";

export const FLEET_PERSONA_FILES = [
  "README.md",
  "identity.md",
  "reason.md",
  "main_task.md",
  "dream_goal.md",
  "behavior_rules.md",
] as const;
export const FLEET_PERSONA_DIR = "docs/person";
export const FLEET_COMPILED_PROMPT_PATH = "docs/person/system-prompt.md";
export const FLEET_PROMPT_COMPILER_CONTRACT = "ai-society.agent-prompt-compiler/1";

export interface FleetPromptCompileResult {
  expected: Buffer;
  expectedSha256: string;
  inputSha256: string;
  inputPaths: string[];
}

export class FleetPromptCompilerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FleetPromptCompilerError";
  }
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function decodeUtf8(bytes: Buffer, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new FleetPromptCompilerError(`canonical prompt input is not UTF-8: ${path}`);
  }
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = [...left].map((value) => value.codePointAt(0) ?? -1);
  const rightPoints = [...right].map((value) => value.codePointAt(0) ?? -1);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function assertPortableJson(value: unknown, path = "$manifest"): void {
  if (typeof value === "string" && hasUnpairedSurrogate(value)) {
    throw new FleetPromptCompilerError(
      `unpaired surrogate cannot be encoded by the Python compiler: ${path}`,
    );
  }
  if (typeof value === "number") {
    throw new FleetPromptCompilerError(
      `numeric additive manifest value cannot be proven byte-identical to the Python compiler: ${path}`,
    );
  }
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      assertPortableJson(entry, `${path}[${index}]`);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (hasUnpairedSurrogate(key)) {
        throw new FleetPromptCompilerError(
          `unpaired surrogate cannot be encoded by the Python compiler: ${path} key`,
        );
      }
      assertPortableJson(entry, `${path}.${key}`);
    }
  }
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  );
}

function canonicalInputDigest(entries: Array<{ path: string; sha256: string }>): string {
  return sha256(JSON.stringify(entries.sort((a, b) => compareCodePoints(a.path, b.path))));
}

export async function compileFleetSystemPrompt(params: {
  manifestBytes: Buffer;
  readFile(path: string): Promise<Buffer | undefined>;
}): Promise<FleetPromptCompileResult> {
  const manifestText = decodeUtf8(params.manifestBytes, "agent.json");
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    throw new FleetPromptCompilerError(
      `agent.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    throw new FleetPromptCompilerError("agent.json root must be an object");
  }
  assertPortableJson(manifest);

  const parts: string[] = [
    "<!-- compiled: do not edit -->\n",
    "# Agent system prompt\n\n",
    "## Manifest\n\n",
    "```json\n",
    JSON.stringify(sortJson(manifest), null, 2),
    "\n```\n",
  ];
  const inputs = [{ path: "agent.json", sha256: sha256(params.manifestBytes) }];
  const inputPaths = ["agent.json"];
  for (const name of FLEET_PERSONA_FILES) {
    const path = `${FLEET_PERSONA_DIR}/${name}`;
    const bytes = await params.readFile(path);
    if (!bytes) throw new FleetPromptCompilerError(`missing canonical prompt input: ${path}`);
    const text = decodeUtf8(bytes, path).replace(/\r\n?/gu, "\n").replace(/\n+$/u, "");
    parts.push(`\n## Persona source: ${name}\n\n`, text, "\n");
    inputs.push({ path, sha256: sha256(bytes) });
    inputPaths.push(path);
  }
  const expected = Buffer.from(parts.join(""), "utf8");
  return {
    expected,
    expectedSha256: sha256(expected),
    inputSha256: canonicalInputDigest(inputs),
    inputPaths,
  };
}
