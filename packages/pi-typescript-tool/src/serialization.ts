// Never expose raw vm values in Pi details. Reject non-JSON data without calling toJSON/getters.
export const MAX_RESULT_BYTES = 16_384;
export const MAX_RESULT_LINES = 2000;
const MAX_NODES = 4096;
const MAX_DEPTH = 32;

export function renderResult(value: unknown): string {
  let bytes = 0;
  let nodes = 0;
  const ancestors = new Set<object>();
  const add = (text: string) => {
    bytes += Buffer.byteLength(text, "utf8");
    if (bytes > MAX_RESULT_BYTES)
      throw new Error(`Result exceeds ${MAX_RESULT_BYTES} UTF-8 bytes; return a smaller summary`);
    return text;
  };
  const string = (text: string) => {
    // Bound before JSON.stringify allocates escaped output.
    if (text.length > MAX_RESULT_BYTES) throw new Error("Result string exceeds output limit");
    return add(JSON.stringify(text));
  };
  const visit = (item: unknown, depth: number): string => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH)
      throw new Error("Result exceeds structural limits (4096 nodes / 32 levels)");
    if (item === null) return add("null");
    if (typeof item === "string") return string(item);
    if (typeof item === "boolean") return add(String(item));
    if (typeof item === "number" && Number.isFinite(item)) return add(JSON.stringify(item));
    if (typeof item !== "object")
      throw new Error(
        "Result must contain only JSON data (no bigint, functions, symbols, undefined or non-finite numbers)",
      );
    if (ancestors.has(item)) throw new Error("Result contains a cycle");
    const array = Array.isArray(item);
    const proto: object | null = Object.getPrototypeOf(item);
    // Recognize ordinary cross-realm prototypes without invoking constructors.
    if (proto !== null) {
      const constructorProperty = Object.getOwnPropertyDescriptor(proto, "constructor");
      const ordinaryObject =
        Object.getPrototypeOf(proto) === null &&
        constructorProperty &&
        "value" in constructorProperty &&
        typeof constructorProperty.value === "function" &&
        Object.getOwnPropertyDescriptor(constructorProperty.value, "name")?.value === "Object";
      if (array ? !Array.isArray(proto) : !ordinaryObject) {
        throw new Error("Result must contain only plain objects and arrays");
      }
    }
    ancestors.add(item);
    try {
      const keys = Reflect.ownKeys(item);
      if (keys.length > MAX_NODES) throw new Error("Result has too many properties");
      const parts: string[] = [];
      add(array ? "[" : "{");
      for (const key of keys) {
        if (array && key === "length") continue;
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !("value" in descriptor))
          throw new Error("Result accessors are not supported");
        if (typeof key !== "string") throw new Error("Result symbol keys are not supported");
        if (!descriptor.enumerable)
          throw new Error("Result non-enumerable properties are not supported");
        if (array && key !== String(parts.length))
          throw new Error("Result arrays must be dense without extra properties");
        if (parts.length) add(",");
        const prefix = array ? "" : string(key) + add(":");
        parts.push(prefix + visit(descriptor.value, depth + 1));
      }
      if (array && (item as unknown[]).length !== parts.length)
        throw new Error("Result arrays must be dense");
      return (array ? "[" : "{") + parts.join(",") + add(array ? "]" : "}");
    } finally {
      ancestors.delete(item);
    }
  };
  const output =
    value === undefined ? "undefined" : typeof value === "string" ? add(value) : visit(value, 0);
  if (output.split("\n").length > MAX_RESULT_LINES)
    throw new Error(`Result exceeds ${MAX_RESULT_LINES} lines`);
  return output;
}

/** Bounded messages only. Never stringify arbitrary thrown objects from the vm. */
export function executionError(error: unknown): Error {
  let message = "TypeScript execution failed (non-string error)";
  if (typeof error === "string") message = error;
  else if (error && typeof error === "object") {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(error, "message");
      if (descriptor && "value" in descriptor && typeof descriptor.value === "string")
        message = descriptor.value;
    } catch {
      /* A Proxy may reject inspection. Trusted code only. */
    }
  }
  return new Error(message.slice(0, 2000));
}
