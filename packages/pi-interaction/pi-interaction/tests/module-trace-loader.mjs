// summary: Records fresh-process ESM load URLs for activation-boundary tests.
// read_when:
//   - Verifying the narrow interaction registration module graph.

import { appendFileSync } from "node:fs";

const tracePath = process.env.PI_INTERACTION_MODULE_TRACE;
if (!tracePath) throw new Error("PI_INTERACTION_MODULE_TRACE is required");

export async function load(url, context, nextLoad) {
  appendFileSync(tracePath, `${url}\n`);
  return nextLoad(url, context);
}
