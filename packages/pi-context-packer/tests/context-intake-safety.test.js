import assert from "node:assert/strict";
import test from "node:test";
import { publicOmissionDetail } from "../src/context-intake-safety.js";

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
