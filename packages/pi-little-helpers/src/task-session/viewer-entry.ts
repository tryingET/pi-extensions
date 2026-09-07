#!/usr/bin/env node
import { assertSdkIdentity } from "./identity.js";
import { id, refuse } from "./json.js";
import { accountLocator } from "./state.js";
import { runViewer } from "./viewer.js";

try {
  if (process.argv.length !== 3) refuse("invalid_view_arguments");
  if (!process.stdin.isTTY || !process.stdout.isTTY) refuse("viewer_terminal_required");
  const attempt = id(process.argv[2]),
    locator = accountLocator();
  assertSdkIdentity();
  const { taskSessionView } = await import("./ui.js");
  await runViewer(locator, attempt, taskSessionView);
} catch {
  process.stderr.write("task_session_view_unavailable\n");
  process.exitCode = 2;
}
