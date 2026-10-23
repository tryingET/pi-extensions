import { spawnSync } from "node:child_process";
import fs from "node:fs";

export const CHILD_TEST_TIMEOUT_MS = 120000;

export class ReplayMismatch extends Error {
  constructor(kind, cause) {
    super(`ownership oracle mismatch: ${kind}`, { cause });
    this.kind = kind;
  }
}

export async function minimizedFailure(trace, failureKind, replay) {
  let events = [...trace.events];
  for (let index = 0; index < events.length; ) {
    const candidate = events.filter((_, i) => i !== index);
    try {
      await replay({ ...trace, events: candidate });
      index += 1;
    } catch (error) {
      // A reduction is useful only if it reproduces the original failure class.
      // Fixture/classification errors are not new failures of the original trace.
      if (error instanceof ReplayMismatch && error.kind === failureKind) {
        events = candidate;
        index = 0;
      } else index += 1;
    }
  }
  return { ...trace, events };
}

// Recognize the flat Node TAP dialect emitted by our one-file worker, not arbitrary TAP.
// Nested suites, directives, duplicate names/ids, extra plans and partial diagnostics fail closed.
function completedTap(output, status) {
  if (!output.endsWith("\n") || /\r|\0|^\s*(?:#\s*)?Bail out!/im.test(output)) return null;
  const lines = output.split("\n");
  const duration = /^# duration_ms \d+(?:\.\d+)?$/;
  let index = 0;
  if (lines[index++] !== "TAP version 13") return null;
  const names = new Set();
  const failedNames = [];
  while (lines[index]?.startsWith("# Subtest: ")) {
    const name = lines[index++].slice("# Subtest: ".length);
    if (!name || name.includes(" #") || names.has(name)) return null;
    names.add(name);
    const point = lines[index++];
    if (point === `not ok ${names.size} - ${name}`) failedNames.push(name);
    else if (point !== `ok ${names.size} - ${name}`) return null;
    if (
      lines[index++] !== "  ---" ||
      !/^ {2}duration_ms: \d+(?:\.\d+)?$/.test(lines[index++]) ||
      lines[index++] !== "  type: 'test'"
    )
      return null;
    // Diagnostic YAML is opaque evidence, never a source of test points or summaries.
    while (lines[index]?.startsWith("  ") && lines[index] !== "  ...") {
      if (/^ {2}(?:---|duration_ms:|type:)/.test(lines[index])) return null;
      index += 1;
    }
    if (lines[index++] !== "  ...") return null;
    // Node emits t.diagnostic() comments after a point; reserved records aren't diagnostics.
    while (
      /^# (?!Subtest:|tests |suites |pass |fail |cancelled |skipped |todo |duration_ms )/.test(
        lines[index],
      )
    )
      index += 1;
  }
  const count = names.size;
  const failures = failedNames.length;
  const summary = [
    `1..${count}`,
    `# tests ${count}`,
    "# suites 0",
    `# pass ${count - failures}`,
    `# fail ${failures}`,
    "# cancelled 0",
    "# skipped 0",
    "# todo 0",
  ];
  if (!count || summary.some((line) => lines[index++] !== line)) return null;
  if (!duration.test(lines[index++]) || lines[index++] !== "" || index !== lines.length)
    return null;
  if (status !== (failures ? 1 : 0)) return null;
  return { failures, failedNames };
}

export function runOwnershipWorker({
  root,
  tapPath,
  timeout = CHILD_TEST_TIMEOUT_MS,
  execPath = process.execPath,
  // One file, one process: worker crashes remain visible as signals and the deadline
  // cannot leave a grandchild test process behind. Supported since Node 22.8.
  args = [
    "--test",
    "--experimental-test-isolation=none",
    "--test-reporter=tap",
    "tests/generated-ownership.test.mjs",
  ],
}) {
  const env = { ...process.env };
  delete env.PI_ACTIVITY_STRIP_REPLAY_SEED;
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(execPath, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout,
    killSignal: "SIGKILL",
  });
  const output = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const stderrPath = `${tapPath}.stderr`;
  fs.writeFileSync(tapPath, output);
  fs.writeFileSync(stderrPath, stderr);
  const tap =
    !result.error &&
    result.signal === null &&
    stderr === "" &&
    !/MODULE_NOT_FOUND|SyntaxError:|uncaughtException|unhandledRejection/.test(output)
      ? completedTap(output, result.status)
      : null;
  return {
    status: result.status,
    signal: result.signal,
    error: result.error
      ? {
          name: result.error.name,
          message: result.error.message,
          code: result.error.code,
          errno: result.error.errno,
          syscall: result.error.syscall,
        }
      : null,
    timeoutMs: timeout,
    tapPath,
    output,
    stderr,
    stderrPath,
    failures: tap?.failures ?? -1,
    failedNames: tap?.failedNames ?? [],
    completed: tap !== null,
  };
}

export function detectedNamedFailure(check, expected) {
  return (
    check.completed &&
    check.status === 1 &&
    check.failures > 0 &&
    check.failedNames.includes(expected)
  );
}
