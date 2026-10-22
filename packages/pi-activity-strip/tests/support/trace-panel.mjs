// Passive fixture-only transport observer. Never queues/rewrites messages or changes write results or
// binary selection; the real controller still launches the receipted native binary directly.
import childProcess from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const log = process.env.PI_ACTIVITY_STRIP_GUI_TRACE;
if (!log || process.env.PI_ACTIVITY_STRIP_ISOLATED_GUI !== "1")
  throw new Error("isolated trace only");
fs.writeFileSync(log, "");
const record = (direction, line) => {
  try {
    fs.appendFileSync(
      log,
      `${JSON.stringify({ at: Date.now(), direction, message: JSON.parse(line) })}\n`,
    );
  } catch {
    /* Partial chunks are buffered below; non-JSON stdout is not panel protocol. */
  }
};
const original = childProcess.spawn;
childProcess.spawn = function (command, ...args) {
  const child = original.call(this, command, ...args);
  if (!String(command).endsWith("/pi-activity-strip-panel")) return child;
  const write = child.stdin.write;
  child.stdin.write = function (chunk, ...rest) {
    for (const line of String(chunk).trim().split("\n")) record("to-panel", line);
    return write.call(this, chunk, ...rest);
  };
  child.stderr.on("data", (chunk) =>
    record("from-panel", JSON.stringify({ type: "panel-stderr", text: String(chunk) })),
  );
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let end = buffer.indexOf("\n");
    while (end >= 0) {
      record("from-panel", buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      end = buffer.indexOf("\n");
    }
  });
  return child;
};
syncBuiltinESMExports();
