import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNoPromptTemplateAvailabilityWarning,
  formatNoPromptTemplateSelectionWarning,
  isNoPromptTemplateAvailabilityReason,
} from "../src/ptxNoCandidateMessage.js";

test("known PTX no-candidate reasons are recognized", () => {
  assert.equal(isNoPromptTemplateAvailabilityReason("prompt-command-source-unavailable"), true);
  assert.equal(isNoPromptTemplateAvailabilityReason("no-prompt-templates"), true);
  assert.equal(isNoPromptTemplateAvailabilityReason("no-prefillable-prompt-templates"), true);
  assert.equal(isNoPromptTemplateAvailabilityReason("cancelled"), false);
});

test("availability warning for no-prompt-templates is actionable and UI-aware", () => {
  const message = formatNoPromptTemplateAvailabilityWarning("no-prompt-templates");

  assert.match(message, /^No prompt templates available \(no-prompt-templates\)\./);
  assert.match(message, /none are prompt-template commands in this session/);
  assert.match(message, /\/ptx-debug-commands \[query\]/);
  assert.match(message, /UI session/);
});

test("availability warning for no-prefillable-prompt-templates points to path drift", () => {
  const message = formatNoPromptTemplateAvailabilityWarning("no-prefillable-prompt-templates");

  assert.match(message, /^No prompt templates available \(no-prefillable-prompt-templates\)\./);
  assert.match(message, /none expose a usable template path/);
  assert.match(message, /path\/status drift/);
});

test("selection warning preserves cancellation-like reasons", () => {
  assert.equal(
    formatNoPromptTemplateSelectionWarning("cancelled"),
    "No prompt template selected (cancelled).",
  );
});

test("selection warning upgrades known no-candidate reasons to actionable guidance", () => {
  const message = formatNoPromptTemplateSelectionWarning("prompt-command-source-unavailable");

  assert.match(message, /^No prompt templates available \(prompt-command-source-unavailable\)\./);
  assert.match(message, /avoid '--no-prompt-templates'/);
  assert.match(message, /reload/);
});
