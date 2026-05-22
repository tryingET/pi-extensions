import assert from "node:assert/strict";
import test from "node:test";
import {
  markdownInlineLabel,
  publicOmissionDetail,
  repoRelativePathSafetyIssue,
} from "../src/context-intake-safety.js";

test("markdownInlineLabel collapses control characters and bounds labels", () => {
  assert.equal(
    markdownInlineLabel("objective\n## Forged section\r\n- <h2>fake</h2>"),
    "objective ## Forged section - ‹h2›fake‹/h2›",
  );
  assert.equal(markdownInlineLabel("", "fallback"), "fallback");
  assert.equal(markdownInlineLabel("x".repeat(300)).length, 240);
});

test("repoRelativePathSafetyIssue rejects DEL and C1 control characters", () => {
  assert.match(repoRelativePathSafetyIssue("docs/\u007fsecret.md"), /control characters/);
  assert.match(repoRelativePathSafetyIssue("docs/\u0085secret.md"), /control characters/);
});

test("publicOmissionDetail withholds POSIX, Windows, UNC, and secret-like raw details", () => {
  const fallback = "provider unavailable detail withheld";

  assert.match(
    publicOmissionDetail("failed at /tmp/customer-acme/tool.log", fallback),
    /withheld.*local path or secret-like text/,
  );
  assert.match(
    publicOmissionDetail("failed at C:\\Users\\alice\\tool.log", fallback),
    /withheld.*local path or secret-like text/,
  );
  assert.match(
    publicOmissionDetail("failed at \\\\server\\share\\tool.log", fallback),
    /withheld.*local path or secret-like text/,
  );
  assert.match(
    publicOmissionDetail("provider returned TOKEN=abc123", fallback),
    /withheld.*local path or secret-like text/,
  );
});

test("publicOmissionDetail preserves stable public omission classes", () => {
  assert.equal(
    publicOmissionDetail(
      "docs-list discovery failed (code=2); raw subprocess error output omitted",
    ),
    "docs-list discovery failed (code=2); raw subprocess error output omitted",
  );
});
