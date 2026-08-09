const MAX_EVENT_IDENTITY_BYTES = 256;
const MAX_EVENT_PRIMITIVE_BYTES = 256;
const MAX_EVENT_NESTING_DEPTH = 256;

const isWhitespace = (byte: number): boolean =>
  byte === 0x20 || byte === 0x09 || byte === 0x0d || byte === 0x0a;
const isHex = (byte: number): boolean =>
  (byte >= 0x30 && byte <= 0x39) ||
  (byte >= 0x41 && byte <= 0x46) ||
  (byte >= 0x61 && byte <= 0x66);

type ObjectState = "key_or_end" | "key" | "colon" | "value" | "comma_or_end";
type ArrayState = "value_or_end" | "value" | "comma_or_end";
type JsonFrame =
  | { kind: "object"; state: ObjectState; root: boolean; currentKey?: string }
  | { kind: "array"; state: ArrayState };
type StringToken = {
  kind: "string";
  role: "key" | "value";
  capture: boolean;
  bytes: number[];
  escaped: boolean;
  unicodeRemaining: number;
};
type PrimitiveToken = { kind: "primitive"; bytes: number[] };

export type CleanupEventJsonScanner = {
  frames: JsonFrame[];
  token?: StringToken | PrimitiveToken;
  rootStarted: boolean;
  rootComplete: boolean;
  event?: string;
  eventSeen: boolean;
  malformed: boolean;
  utf8: TextDecoder;
};

export function newCleanupEventJsonScanner(): CleanupEventJsonScanner {
  return {
    frames: [],
    rootStarted: false,
    rootComplete: false,
    eventSeen: false,
    malformed: false,
    utf8: new TextDecoder("utf-8", { fatal: true }),
  };
}

function decodeCapturedString(scanner: CleanupEventJsonScanner, token: StringToken): string {
  try {
    const value = JSON.parse(`"${Buffer.from(token.bytes).toString("utf8")}"`) as unknown;
    if (typeof value !== "string") throw new Error("decoded JSON string is not a string");
    return value;
  } catch {
    scanner.malformed = true;
    return "";
  }
}

function completeValue(scanner: CleanupEventJsonScanner): void {
  const frame = scanner.frames.at(-1);
  if (!frame) {
    scanner.rootComplete = true;
    return;
  }
  frame.state = "comma_or_end";
}

function completeContainer(scanner: CleanupEventJsonScanner): void {
  scanner.frames.pop();
  if (scanner.frames.length === 0) scanner.rootComplete = true;
  else completeValue(scanner);
}

function startContainer(
  scanner: CleanupEventJsonScanner,
  kind: "object" | "array",
  root: boolean,
): void {
  if (scanner.frames.length >= MAX_EVENT_NESTING_DEPTH) {
    scanner.malformed = true;
    return;
  }
  scanner.frames.push(
    kind === "object" ? { kind, state: "key_or_end", root } : { kind, state: "value_or_end" },
  );
}

function startValue(scanner: CleanupEventJsonScanner, byte: number): boolean {
  const frame = scanner.frames.at(-1);
  const eventValue = frame?.kind === "object" && frame.root && frame.currentKey === "event";
  if (byte === 0x22) {
    scanner.token = {
      kind: "string",
      role: "value",
      capture: eventValue,
      bytes: [],
      escaped: false,
      unicodeRemaining: 0,
    };
    return true;
  }
  if (eventValue) {
    scanner.malformed = true;
    return true;
  }
  if (byte === 0x7b || byte === 0x5b) {
    startContainer(scanner, byte === 0x7b ? "object" : "array", false);
    return true;
  }
  scanner.token = { kind: "primitive", bytes: [byte] };
  return true;
}

function finishString(scanner: CleanupEventJsonScanner, token: StringToken): void {
  const frame = scanner.frames.at(-1);
  if (!frame) {
    scanner.malformed = true;
    return;
  }
  const value = token.capture ? decodeCapturedString(scanner, token) : undefined;
  if (scanner.malformed) return;
  if (token.role === "key") {
    if (frame.kind !== "object") {
      scanner.malformed = true;
      return;
    }
    frame.currentKey = value;
    frame.state = "colon";
    return;
  }
  if (frame.kind === "object" && frame.root && frame.currentKey === "event") {
    if (scanner.eventSeen || value === undefined) {
      scanner.malformed = true;
      return;
    }
    scanner.eventSeen = true;
    scanner.event = value;
  }
  completeValue(scanner);
}

function appendCapturedStringByte(
  scanner: CleanupEventJsonScanner,
  token: StringToken,
  byte: number,
): boolean {
  if (!token.capture) return true;
  if (token.bytes.length >= MAX_EVENT_IDENTITY_BYTES) {
    scanner.malformed = true;
    return false;
  }
  token.bytes.push(byte);
  return true;
}

function scanStringByte(scanner: CleanupEventJsonScanner, token: StringToken, byte: number): void {
  if (token.unicodeRemaining > 0) {
    if (!isHex(byte) || !appendCapturedStringByte(scanner, token, byte)) {
      scanner.malformed = true;
      return;
    }
    token.unicodeRemaining -= 1;
    return;
  }
  if (token.escaped) {
    token.escaped = false;
    if (!appendCapturedStringByte(scanner, token, byte)) return;
    if (byte === 0x75) token.unicodeRemaining = 4;
    else if (![0x22, 0x5c, 0x2f, 0x62, 0x66, 0x6e, 0x72, 0x74].includes(byte)) {
      scanner.malformed = true;
    }
    return;
  }
  if (byte === 0x5c) {
    token.escaped = true;
    appendCapturedStringByte(scanner, token, byte);
    return;
  }
  if (byte === 0x22) {
    scanner.token = undefined;
    finishString(scanner, token);
    return;
  }
  if (byte < 0x20) {
    scanner.malformed = true;
    return;
  }
  appendCapturedStringByte(scanner, token, byte);
}

function finishPrimitive(scanner: CleanupEventJsonScanner, token: PrimitiveToken): void {
  try {
    const value = JSON.parse(Buffer.from(token.bytes).toString("utf8")) as unknown;
    if (value !== null && typeof value !== "boolean" && typeof value !== "number") {
      scanner.malformed = true;
      return;
    }
  } catch {
    scanner.malformed = true;
    return;
  }
  scanner.token = undefined;
  completeValue(scanner);
}

function scanStructuralByte(scanner: CleanupEventJsonScanner, byte: number): boolean {
  if (scanner.rootComplete) {
    if (!isWhitespace(byte)) scanner.malformed = true;
    return true;
  }
  if (!scanner.rootStarted) {
    if (isWhitespace(byte)) return true;
    scanner.rootStarted = true;
    if (byte !== 0x7b) scanner.malformed = true;
    else startContainer(scanner, "object", true);
    return true;
  }
  const frame = scanner.frames.at(-1);
  if (!frame) {
    scanner.malformed = true;
    return true;
  }
  if (frame.kind === "object") {
    if (frame.state === "key_or_end") {
      if (isWhitespace(byte)) return true;
      if (byte === 0x7d) completeContainer(scanner);
      else if (byte === 0x22) {
        scanner.token = {
          kind: "string",
          role: "key",
          capture: frame.root,
          bytes: [],
          escaped: false,
          unicodeRemaining: 0,
        };
      } else scanner.malformed = true;
      return true;
    }
    if (frame.state === "key") {
      if (isWhitespace(byte)) return true;
      if (byte !== 0x22) scanner.malformed = true;
      else {
        scanner.token = {
          kind: "string",
          role: "key",
          capture: frame.root,
          bytes: [],
          escaped: false,
          unicodeRemaining: 0,
        };
      }
      return true;
    }
    if (frame.state === "colon") {
      if (isWhitespace(byte)) return true;
      if (byte !== 0x3a) scanner.malformed = true;
      else frame.state = "value";
      return true;
    }
    if (frame.state === "value") {
      if (isWhitespace(byte)) return true;
      return startValue(scanner, byte);
    }
    if (isWhitespace(byte)) return true;
    if (byte === 0x2c) frame.state = "key";
    else if (byte === 0x7d) completeContainer(scanner);
    else scanner.malformed = true;
    return true;
  }
  if (frame.state === "value_or_end") {
    if (isWhitespace(byte)) return true;
    if (byte === 0x5d) completeContainer(scanner);
    else startValue(scanner, byte);
    return true;
  }
  if (frame.state === "value") {
    if (isWhitespace(byte)) return true;
    return startValue(scanner, byte);
  }
  if (isWhitespace(byte)) return true;
  if (byte === 0x2c) frame.state = "value";
  else if (byte === 0x5d) completeContainer(scanner);
  else scanner.malformed = true;
  return true;
}

export function scanCleanupEventJson(scanner: CleanupEventJsonScanner, bytes: Buffer): void {
  if (scanner.malformed) return;
  try {
    scanner.utf8.decode(bytes, { stream: true });
  } catch {
    scanner.malformed = true;
    return;
  }
  let index = 0;
  while (index < bytes.length && !scanner.malformed) {
    const token = scanner.token;
    const byte = bytes[index];
    if (token?.kind === "string") {
      scanStringByte(scanner, token, byte);
      index += 1;
      continue;
    }
    if (token?.kind === "primitive") {
      if (isWhitespace(byte) || byte === 0x2c || byte === 0x7d || byte === 0x5d) {
        finishPrimitive(scanner, token);
        continue;
      }
      if (token.bytes.length >= MAX_EVENT_PRIMITIVE_BYTES) scanner.malformed = true;
      else token.bytes.push(byte);
      index += 1;
      continue;
    }
    scanStructuralByte(scanner, byte);
    index += 1;
  }
}

export function completeCleanupEventJson(
  scanner: CleanupEventJsonScanner,
): scanner is CleanupEventJsonScanner & { event: string } {
  try {
    scanner.utf8.decode();
  } catch {
    scanner.malformed = true;
  }
  return (
    !scanner.malformed &&
    scanner.token === undefined &&
    scanner.rootStarted &&
    scanner.rootComplete &&
    scanner.frames.length === 0 &&
    scanner.eventSeen &&
    scanner.event !== undefined
  );
}
