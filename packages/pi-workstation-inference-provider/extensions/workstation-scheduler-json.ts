// summary: strictly scans scheduler handoff JSON and canonicalizes exact owner revision integers.
// read_when:
//   - changing scheduler handoff parsing, duplicate-key rejection, or digest reconstruction.

const MAX_JSON_DEPTH = 64;
const NUMBER_PATTERN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const INTEGER_PATTERN = /^-?(?:0|[1-9]\d*)$/;
const REVISION_PATHS = [
  ["owner_authority", "profile_policy_revision"],
  ["owner_authority", "lifecycle_revision"],
] as const;

type RecordValue = Record<string, unknown>;

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

class UniqueJsonScanner {
  readonly #text: string;
  readonly #targetPaths: ReadonlySet<string>;
  readonly #numberLexemes = new Map<string, string>();
  #index = 0;

  constructor(text: string, targetPaths: readonly (readonly string[])[]) {
    this.#text = text;
    this.#targetPaths = new Set(targetPaths.map(pathKey));
  }

  scan(): ReadonlyMap<string, string> {
    this.#skipWhitespace();
    this.#scanValue([], 0);
    this.#skipWhitespace();
    if (this.#index !== this.#text.length) throw new Error("JSON has trailing content");
    return this.#numberLexemes;
  }

  #scanValue(path: string[], depth: number): void {
    if (depth > MAX_JSON_DEPTH) throw new Error("JSON nesting is too deep");
    switch (this.#text[this.#index]) {
      case "{":
        this.#scanObject(path, depth);
        return;
      case "[":
        this.#scanArray(path, depth);
        return;
      case '"':
        this.#scanString();
        return;
      case "t":
        this.#scanLiteral("true");
        return;
      case "f":
        this.#scanLiteral("false");
        return;
      case "n":
        this.#scanLiteral("null");
        return;
      default:
        this.#scanNumber(path);
    }
  }

  #scanObject(path: string[], depth: number): void {
    this.#index += 1;
    this.#skipWhitespace();
    const keys = new Set<string>();
    if (this.#consume("}")) return;
    while (true) {
      if (this.#text[this.#index] !== '"') throw new Error("JSON object key is invalid");
      const key = this.#scanString();
      if (keys.has(key)) throw new Error("JSON object has a duplicate key");
      keys.add(key);
      this.#skipWhitespace();
      if (!this.#consume(":")) throw new Error("JSON object separator is invalid");
      this.#skipWhitespace();
      this.#scanValue([...path, key], depth + 1);
      this.#skipWhitespace();
      if (this.#consume("}")) return;
      if (!this.#consume(",")) throw new Error("JSON object terminator is invalid");
      this.#skipWhitespace();
    }
  }

  #scanArray(path: string[], depth: number): void {
    this.#index += 1;
    this.#skipWhitespace();
    if (this.#consume("]")) return;
    let index = 0;
    while (true) {
      this.#scanValue([...path, String(index)], depth + 1);
      index += 1;
      this.#skipWhitespace();
      if (this.#consume("]")) return;
      if (!this.#consume(",")) throw new Error("JSON array terminator is invalid");
      this.#skipWhitespace();
    }
  }

  #scanString(): string {
    const start = this.#index;
    this.#index += 1;
    while (this.#index < this.#text.length) {
      const character = this.#text[this.#index];
      if (character === '"') {
        this.#index += 1;
        return JSON.parse(this.#text.slice(start, this.#index));
      }
      this.#index += character === "\\" ? 2 : 1;
    }
    throw new Error("JSON string is unterminated");
  }

  #scanLiteral(literal: string): void {
    if (!this.#text.startsWith(literal, this.#index)) throw new Error("JSON literal is invalid");
    this.#index += literal.length;
  }

  #scanNumber(path: string[]): void {
    NUMBER_PATTERN.lastIndex = this.#index;
    const match = NUMBER_PATTERN.exec(this.#text);
    if (!match) throw new Error("JSON number is invalid");
    this.#index = NUMBER_PATTERN.lastIndex;
    const key = pathKey(path);
    if (this.#targetPaths.has(key)) this.#numberLexemes.set(key, match[0]);
  }

  #skipWhitespace(): void {
    while (/[\t\n\r ]/.test(this.#text[this.#index] ?? "")) this.#index += 1;
  }

  #consume(expected: string): boolean {
    if (this.#text[this.#index] !== expected) return false;
    this.#index += 1;
    return true;
  }
}

export function canonicalJson(
  value: unknown,
  numberLexemes: ReadonlyMap<string, string> = new Map(),
  path: string[] = [],
): string {
  const numberLexeme = numberLexemes.get(pathKey(path));
  if (numberLexeme !== undefined) return numberLexeme;
  if (Array.isArray(value)) {
    return `[${value
      .map((item, index) => canonicalJson(item, numberLexemes, [...path, String(index)]))
      .join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as RecordValue;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson(record[key], numberLexemes, [...path, key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function canonicalSchedulerHandoffJson(
  value: unknown,
  rawText: string,
  authority: RecordValue,
): string {
  const numberLexemes = new UniqueJsonScanner(rawText, REVISION_PATHS).scan();
  for (const path of REVISION_PATHS) {
    const key = pathKey(path);
    const lexeme = numberLexemes.get(key);
    const parsed = authority[path[1]];
    if (
      lexeme === undefined ||
      !INTEGER_PATTERN.test(lexeme) ||
      typeof parsed !== "number" ||
      !Number.isFinite(parsed) ||
      Number(lexeme) !== parsed
    ) {
      throw new Error("scheduler handoff digest is invalid");
    }
  }
  return canonicalJson(value, numberLexemes);
}
