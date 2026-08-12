/**
summary: "Tests evalset dataset identifiers, numeric options, collision-safe reports, and retained outputs."
read_when:
  - "Changing evalset parsing, report persistence, or case output contracts."
*/
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { _test } from "../extensions/evalset.ts";

test("datasets reject empty and duplicate explicit case IDs", () => {
  assert.throws(
    () => _test.parseDataset(JSON.stringify({ cases: [{ id: " ", input: "one" }] })),
    /must not be empty/,
  );
  assert.throws(
    () =>
      _test.parseDataset(
        JSON.stringify({
          cases: [
            { id: "same", input: "one" },
            { id: " same ", input: "two" },
          ],
        }),
      ),
    /Duplicate case id: same/,
  );
  assert.throws(
    () =>
      _test.parseDataset(
        JSON.stringify({
          cases: [{ input: "generated case-1" }, { id: "case-1", input: "explicit" }],
        }),
      ),
    /Duplicate case id: case-1/,
  );
});

test("numeric options reject partial and non-finite values", () => {
  for (const value of ["1.5", "2oops", "1e3", "Infinity", "9007199254740992"]) {
    assert.throws(() => _test.parsePositiveInteger(value, "--max-cases"), /positive integer/);
  }
  for (const value of ["1oops", "NaN", "Infinity", "-0.1", "2.1"]) {
    assert.throws(() => _test.parseTemperature(value), /between 0 and 2/);
  }
  assert.equal(_test.parsePositiveInteger("12", "--max-cases"), 12);
  assert.equal(_test.parseTemperature(".5"), 0.5);
});

test("report writes are collision-safe and leave complete JSON", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evalset-report-"));
  const report = path.join(dir, "report.json");
  try {
    await _test.writeReportFile(report, { evidence: "full response" });
    assert.deepEqual(JSON.parse(fs.readFileSync(report, "utf8")), { evidence: "full response" });
    await assert.rejects(() => _test.writeReportFile(report, { evidence: "overwrite" }), /EEXIST/);
    assert.deepEqual(JSON.parse(fs.readFileSync(report, "utf8")), { evidence: "full response" });
    assert.deepEqual(fs.readdirSync(dir), ["report.json"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("report case contract retains full output alongside preview", () => {
  const source = fs.readFileSync(new URL("../extensions/evalset.ts", import.meta.url), "utf8");
  assert.match(source, /output: outputText/);
  assert.match(source, /outputPreview: clip\(outputText\)/);
});

test("request auth preserves Pi header deletion markers", async () => {
  const model = { provider: "gateway", id: "model" };
  const ctx = {
    modelRegistry: {
      async getApiKeyAndHeaders() {
        return {
          ok: true,
          apiKey: "resolved-key",
          headers: { authorization: null, "x-trace": "keep" },
        };
      },
    },
  };

  assert.deepEqual(await _test.resolveRequestAuth(ctx, model), {
    apiKey: "resolved-key",
    headers: { authorization: null, "x-trace": "keep" },
  });
});
