import { appendFileSync } from "node:fs";

export async function resolve(specifier, context, nextResolve) {
  const resolution = await nextResolve(specifier, context);
  const tracePath = process.env.PI_AUTORESEARCH_IMPORT_TRACE;
  if (tracePath && resolution.url.startsWith("file:")) {
    appendFileSync(tracePath, `${resolution.url}\n`, "utf8");
  }
  return resolution;
}
