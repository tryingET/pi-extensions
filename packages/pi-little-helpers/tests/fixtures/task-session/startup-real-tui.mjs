import { readFileSync } from "node:fs";
import { join } from "node:path";
import { taskSessionView } from "../../../dist/task-session/ui.js";
import { runViewer } from "../../../dist/task-session/viewer.js";

const { locator } = JSON.parse(readFileSync(join(process.argv[2], "fixture.json"), "utf8"));
if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error("synthetic_pty_missing");
await runViewer(locator, process.argv[3], taskSessionView);
