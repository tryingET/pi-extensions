/**
summary: "Tests runtime-health intent matching, doctor execution paths, and response shaping."
read_when:
  - "Changing resolvers/runtime-health.ts or runtime-health routing in query-resolver.ts."
*/
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { classifyIntent } from "../../extensions/self/query-resolver.ts";
import {
  isRuntimeHealthQuery,
  resolveRuntimeHealthQuery,
} from "../../extensions/self/resolvers/runtime-health.ts";

function okReport() {
  return {
    ok: true,
    failures: [],
    warnings: ["session storage has 9000 files (4.0GB); consider a retention policy"],
    info: {
      broker: { pid: 1234, alive: true, socketPresent: true },
      sessions: { files: 9000, bytes: "4.0GB" },
      npmGate: "ok",
    },
  };
}

function failingReport() {
  return {
    ok: false,
    failures: ["install provenance drift detected (see drift output)"],
    warnings: [],
    info: {
      broker: { pid: 99, alive: false, socketPresent: false },
      sessions: { files: 100, bytes: "10MB" },
      npmGate: "stale",
    },
  };
}

describe("isRuntimeHealthQuery", () => {
  it("matches explicit health phrasings", () => {
    assert.equal(isRuntimeHealthQuery("what is my runtime health?"), true);
    assert.equal(isRuntimeHealthQuery("run agent doctor"), true);
    assert.equal(isRuntimeHealthQuery("any install drift?"), true);
    assert.equal(isRuntimeHealthQuery("broker health check"), true);
  });

  it("does not match unrelated queries", () => {
    assert.equal(isRuntimeHealthQuery("what files did I touch?"), false);
    assert.equal(isRuntimeHealthQuery("autonomy level"), false);
  });
});

describe("resolveRuntimeHealthQuery", () => {
  it("summarizes a healthy report", () => {
    const response = resolveRuntimeHealthQuery(
      { query: "runtime health" },
      {
        doctorPath: "/nonexistent-but-bypassed",
        runDoctor: () => ({ status: 0, stdout: JSON.stringify(okReport()), stderr: "" }),
      },
    );
    assert.equal(response.understood, true);
    assert.equal(response.data?.kind, "self.runtime_health.v1");
    assert.match(response.answer ?? "", /Runtime health: OK/);
    assert.match(response.answer ?? "", /pid 1234 alive/);
    assert.equal(response.data?.ok, true);
  });

  it("summarizes failures and surfaces the drift guidance", () => {
    const response = resolveRuntimeHealthQuery(
      { query: "runtime health" },
      {
        doctorPath: "/nonexistent-but-bypassed",
        runDoctor: () => ({ status: 1, stdout: JSON.stringify(failingReport()), stderr: "" }),
      },
    );
    assert.equal(response.data?.ok, false);
    assert.match(response.answer ?? "", /FAILING/);
    assert.match(response.answer ?? "", /install provenance drift/);
    assert.match(response.answer ?? "", /pid 99 DEAD/);
    assert.match(String(response.data?.guidance ?? ""), /uncommitted or out-of-tree code/);
  });

  it("handles doctor tool failure", () => {
    const response = resolveRuntimeHealthQuery(
      { query: "runtime health" },
      {
        doctorPath: "/nonexistent-but-bypassed",
        runDoctor: () => ({ status: 2, stdout: "", stderr: "boom" }),
      },
    );
    assert.equal(response.understood, true);
    assert.equal(response.data?.available, false);
    assert.match(response.answer ?? "", /failed to run/);
  });

  it("handles a missing doctor script", () => {
    const response = resolveRuntimeHealthQuery(undefined, {
      doctorPath: "/definitely/missing.mjs",
    });
    assert.equal(response.understood, true);
    assert.equal(response.data?.available, false);
    assert.match(response.answer ?? "", /not found/);
  });

  it("runs the real doctor when present", () => {
    const fixture = mkdtempSync(join(tmpdir(), "runtime-health-fixture-"));
    const response = resolveRuntimeHealthQuery(undefined, {
      doctorPath: join(fixture, "agent-doctor.mjs"),
      runDoctor: () => ({ status: 0, stdout: JSON.stringify(okReport()), stderr: "" }),
    });
    assert.equal(response.data?.kind, "self.runtime_health.v1");
  });
});

describe("classifyIntent routing", () => {
  it("routes runtime-health phrasings to the meta/runtime_health intent", () => {
    assert.deepEqual(classifyIntent("runtime health"), {
      domain: "meta",
      intent: "runtime_health",
    });
    assert.deepEqual(classifyIntent("check install drift"), {
      domain: "meta",
      intent: "runtime_health",
    });
  });
});
