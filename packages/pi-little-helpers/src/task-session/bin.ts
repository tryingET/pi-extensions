#!/usr/bin/env node
import {
  classifyInstalledTaskSessionRequest,
  classifyTaskSessionRequest,
  inspectTaskSession,
  launchTaskSession,
  planTaskSession,
  taskSessionCapability,
  taskSessionInstalledIdentity,
  watchTaskSession,
} from "./core.js";
import { parseJson, refuse } from "./json.js";

const help =
  "pi-task-session: capability | identity | classify-installed | classify | plan | launch | inspect [request-id] | watch request-id\nclassify/plan/launch read one strict JSON object on stdin. No runtime/FD/account/namespace overrides.\nLaunch is blocked pending the AK producer implementation and independent integration. Inspection is DB-free.\n";
async function input() {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of process.stdin) {
    const b = Buffer.from(c);
    size += b.length;
    if (size > 65536) refuse("input_too_large");
    chunks.push(b);
  }
  return parseJson(Buffer.concat(chunks), 65536);
}
const output = (v: unknown) => process.stdout.write(`${JSON.stringify(v)}\n`);
try {
  const [op, ...args] = process.argv.slice(2);
  if ((op === "--help" || op === "help" || !op) && !args.length) process.stdout.write(help);
  else if (op === "capability" && !args.length) output(taskSessionCapability());
  else if (op === "identity" && !args.length) output(taskSessionInstalledIdentity());
  else if (op === "classify-installed" && !args.length)
    output(classifyInstalledTaskSessionRequest(await input()));
  else if (op === "classify" && !args.length) output(classifyTaskSessionRequest(await input()));
  else if (op === "plan" && !args.length) output(planTaskSession(await input()));
  else if (op === "launch" && !args.length) output(await launchTaskSession(await input()));
  else if (op === "inspect" && args.length <= 1) output(inspectTaskSession(args[0]));
  else if (op === "watch" && args.length === 1) {
    const controller = new AbortController();
    process.once("SIGINT", () => controller.abort());
    for await (const v of watchTaskSession(args[0], controller.signal)) output(v);
  } else refuse("unsupported_or_duplicate_options");
} catch (e) {
  // Error codes only: no raw objective, credentials, env, provider body, or filesystem exception paths.
  const message =
    e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : "task_session_unavailable";
  output({ schema: "pi.task-session.error.v1", reason: message });
  process.exitCode = 2;
}
