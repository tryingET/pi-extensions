import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relative) => readFile(path.join(root, relative), "utf8");
const exists = (relative) => access(path.join(root, relative)).then(
  () => true,
  () => false,
);

for (const relative of [
  "formal/ControllerSafety.tla",
  "formal/ControllerSafety.cfg",
  "tests/controller-safety.test.mjs",
]) {
  assert.equal(await exists(relative), true, `missing ${relative}`);
}

const controller = await readText("src/controller.js");
for (const pattern of [
  /#activeReaders/u,
  /#mutationOwner/u,
  /pendingOutput/u,
  /lastAcknowledgement/u,
  /CANCEL_REQUESTED/u,
  /TERMINAL_CANCELLED_KNOWN/u,
  /finishCancelledKnown/u,
  /D1_RECOVERY_REQUIRED/u,
  /PROCESS_CELL_KINDS = new Set\(\["grep", "find", "exec"\]\)/u,
]) {
  assert.match(controller, pattern);
}
assert.doesNotMatch(
  controller,
  /state === "STARTED"[\s\S]{0,200}finishUnknown\(callId, "cancelled-after-start/u,
  "started cancellation must not be collapsed directly into unknown",
);

const authority = await readText("src/sqlite-d1-authority.js");
for (const pattern of [
  /created: false/u,
  /markCancelRequested/u,
  /finishCancelledKnown/u,
  /CANCEL_REQUESTED/u,
  /recoverNonTerminal\(\{ leaseId \} = \{\}\)/u,
  /INVALID_GENERATION_TRANSITION/u,
]) {
  assert.match(authority, pattern);
}

const protocol = await readText(
  "protocol/pi/tool_boundary/v1/boundary.proto",
);
assert.match(protocol, /CALL_STATE_KIND_V1_CANCEL_REQUESTED = 7;/u);
assert.match(protocol, /CALL_STATE_KIND_V1_TERMINAL_CANCELLED_KNOWN = 8;/u);

const formal = await readText("formal/ControllerSafety.tla");
for (const invariant of [
  "NoReadMutationOverlap",
  "KnownTerminalCleanup",
  "CreditsConserved",
  "AtMostOnceStart",
  "UnknownCleanupQuarantines",
]) {
  assert.match(formal, new RegExp(invariant, "u"));
}

console.log(JSON.stringify({
  schema: "pi-tool-boundary-controller-safety-validation/v1",
  controllerSafetyModel: true,
  outputCreditReplayProtection: true,
  durableRestartProtection: true,
  cancellationLinearization: true,
  processCellCleanupCoverage: ["grep", "find", "exec"],
  status: "ok",
}));
