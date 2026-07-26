import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const NativeError = Error;
const captureStackTrace = NativeError.captureStackTrace.bind(NativeError);
const expectedOwnerPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "governed-deep-review-preflight.ts",
);
const expectedOwnerUrl = pathToFileURL(expectedOwnerPath).href;
let currentRuntime = null;

function requireOwnerCaller() {
  const previousPrepareStackTrace = NativeError.prepareStackTrace;
  try {
    NativeError.prepareStackTrace = (_error, callsites) => callsites;
    const error = new NativeError();
    captureStackTrace(error, createOwnedRuntime);
    const callsites = error.stack;
    const caller = Array.isArray(callsites) ? callsites[0] : null;
    const callerFile = caller?.getFileName?.() || caller?.getScriptNameOrSourceURL?.();
    if (callerFile !== expectedOwnerPath && callerFile !== expectedOwnerUrl) {
      throw new Error("Only the governed deep-review preflight owner module may mint a runtime.");
    }
  } finally {
    NativeError.prepareStackTrace = previousPrepareStackTrace;
  }
}

export function createOwnedRuntime(factory) {
  requireOwnerCaller();
  if (typeof factory !== "function") {
    throw new TypeError("Governed deep-review preflight runtime factory is required.");
  }
  const runtime = factory();
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("Governed deep-review preflight owner returned no runtime object.");
  }
  currentRuntime = runtime;
  return runtime;
}

export function isOwnedRuntime(value) {
  return Boolean(value && typeof value === "object" && value === currentRuntime);
}
