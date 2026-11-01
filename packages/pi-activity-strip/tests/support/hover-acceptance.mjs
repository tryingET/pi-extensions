// ---
// summary: "Strict source/request-bound trace guards; never a replacement for real GUI execution."
// read_when:
//   - "Checking active-before-non-agent and post-jump recapture acceptance evidence."
// ---
import assert from "node:assert/strict";

const identity = (n) => Number.isSafeInteger(n) && n > 0;
const fromPanel = (event, type) => event.direction === "from-panel" && event.message.type === type;

export function assertNoRecapture(events) {
  assert.equal(
    events.some(
      (event) =>
        event.message.type === "hover-request" ||
        (event.message.type === "keyboard-active" && event.message.active === true),
    ),
    false,
    "BEHAVIOR: no transient request/capture hidden by later release",
  );
}

export function bindHoverCapture(events, start, sourceWindowId) {
  assert.ok(
    Number.isSafeInteger(start) && start >= 0 && start < events.length && identity(sourceWindowId),
    "SETUP: exact interaction boundary/source required",
  );
  const attempts = events.slice(start).filter((event) => fromPanel(event, "hover-request"));
  assert.equal(attempts.length, 1, "SETUP: one current hover request, not a stale/extra attempt");
  const request = attempts[0];
  assert.ok(
    identity(request.message.token) && identity(request.message.epoch),
    "SETUP: valid token and epoch",
  );
  const requestIndex = events.indexOf(request);
  const view = events
    .slice(0, requestIndex)
    .findLast((event) => event.direction === "to-panel" && event.message.type === "view")?.message;
  assert.ok(
    view?.visible === true && view.interactionEpoch === request.message.epoch,
    "SETUP: current visible source view must bind the request epoch",
  );
  const source = view.sessions.find(
    (card) => card.cardId === view.focusedCardId && card.windowId === sourceWindowId,
  );
  assert.ok(source && typeof source.cardId === "string", "SETUP: exact focused source agent");
  const grantIndex = events.findIndex(
    (event, index) =>
      index > requestIndex &&
      event.direction === "to-panel" &&
      event.message.type === "hover-grant" &&
      event.message.token === request.message.token &&
      event.message.epoch === request.message.epoch,
  );
  assert.ok(
    grantIndex > requestIndex && identity(events[grantIndex].message.request),
    "SETUP: exact request needs a valid controller grant",
  );
  const revision = events[grantIndex].message.request;
  const capture = events
    .slice(grantIndex + 1)
    .find(
      (event) =>
        fromPanel(event, "keyboard-active") &&
        event.message.active === true &&
        event.message.revision === revision,
    );
  assert.ok(capture, "SETUP: exact granted request needs native capture acknowledgement");
  return {
    capture,
    revision,
    epoch: request.message.epoch,
    token: request.message.token,
    cardId: source.cardId,
    sourceWindowId,
  };
}

export function captureBeforeFocus(events, focusIssuedAt, binding) {
  assert.ok(binding && identity(binding.revision), "SETUP: current request binding required");
  const capture = events.findLast((event) => fromPanel(event, "keyboard-active"));
  assert.ok(
    capture?.message.active === true &&
      capture.message.revision === binding.revision &&
      capture.at === binding.capture.at,
    "SETUP: this hover must still own the keyboard",
  );
  const view = events.findLast(
    (event) => event.direction === "to-panel" && event.message.type === "view",
  )?.message;
  assert.ok(
    view?.visible === true &&
      view.interactionEpoch === binding.epoch &&
      (view.focusedCardId === null || view.focusedCardId === binding.cardId) &&
      view.sessions.some(
        (card) => card.cardId === binding.cardId && card.windowId === binding.sourceWindowId,
      ),
    "SETUP: source context remains current",
  );
  assert.ok(
    Number.isSafeInteger(focusIssuedAt) &&
      Number.isSafeInteger(capture.at) &&
      focusIssuedAt >= capture.at &&
      focusIssuedAt - capture.at < 2500,
    "SETUP: focus must be issued before the three-second idle boundary",
  );
  return capture;
}

export function assertRevocationBeforeIdle(events, capture, focusIssuedAt) {
  assert.ok(identity(capture?.message.revision), "SETUP: valid capture revision required");
  const revoked = events.find(
    (event) =>
      fromPanel(event, "keyboard-active") &&
      event.message.active === false &&
      event.message.revision === capture.message.revision,
  );
  assert.ok(revoked, "BEHAVIOR: this exact native ownership acknowledgement must revoke");
  assert.ok(
    Number.isSafeInteger(revoked.at) &&
      revoked.at >= focusIssuedAt &&
      revoked.at - capture.at < 3000,
    "BEHAVIOR: revocation must precede idle, not follow an already-expired lease",
  );
  // Wall timestamps are necessary ordering evidence, not direct GTK monotonic expiry/cause proof.
  return revoked;
}
