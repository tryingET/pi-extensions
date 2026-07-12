import assert from "node:assert/strict";
import test from "node:test";
import { inspectOntology } from "../src/core/inspect.ts";
import type { RocsPort } from "../src/ports/rocs-port.ts";
import {
  createFakeWorkspacePort,
  createTempOntologyRepo,
  createTestDevelopmentDescriptor,
} from "./helpers.ts";

const digest = `sha256:${"1".repeat(64)}`;

test("verified development gate delegates search without build and maps structural candidates", async () => {
  const repo = await createTempOntologyRepo();
  const descriptor = await createTestDevelopmentDescriptor();
  let builds = 0;
  let discoveries = 0;
  const rocs: RocsPort = {
    developmentDescriptor: descriptor,
    async summary() {
      return { layers: [], counts: { concepts: 0, relations: 0 } };
    },
    async validate() {
      return { ok: true, findings: [] };
    },
    async build() {
      builds++;
      throw new Error("build must not run");
    },
    async pack() {
      return { text: "legacy" };
    },
    async boundPack() {
      throw new Error("not called");
    },
    async discover(_repo, _query) {
      discoveries++;
      return {
        invocation: "ok",
        result: {
          schema: "semantic-discovery-result.v0",
          caller_request_digest: digest,
          corpus_snapshot_digest: digest,
          tool_identity: {},
          effective_execution_digest: digest,
          algorithm: {},
          retrieval: "unique_candidate",
          candidates: [
            {
              rank: 1,
              ont_id: "core.Agent",
              kind: "concept",
              layer: "core",
              score: 500,
              matched_query_tokens: ["agent"],
              evidence: [{ field: "label", rule: "token_exact", query_term: "agent" }],
              document_digest: digest,
            },
          ],
          effective_limits: {},
          truncated: false,
          result_digest: digest,
        },
      };
    },
  };
  const result = await inspectOntology(
    { kind: "search", query: "agent" },
    { cwd: repo, developmentGate: { descriptor, profile: "review" } },
    { files: {} as never, rocs, workspace: createFakeWorkspacePort(repo) },
  );
  assert.equal(builds, 0);
  assert.equal(discoveries, 1);
  assert.deepEqual(result.search?.hits[0], {
    ontId: "core.Agent",
    kind: "concept",
    layer: "core",
    labels: [],
    title: "",
    definition: "",
    path: "",
    score: 500,
  });
});

test("gated inspect rejects an unverified or mismatched descriptor", async () => {
  const repo = await createTempOntologyRepo();
  const descriptor = await createTestDevelopmentDescriptor();
  const other = await createTestDevelopmentDescriptor();
  const rocs = {
    developmentDescriptor: descriptor,
    discover: async () => {
      throw new Error("not called");
    },
    build: async () => {
      throw new Error("not called");
    },
  } as unknown as RocsPort;
  await assert.rejects(
    () =>
      inspectOntology(
        { kind: "search", query: "agent" },
        { cwd: repo, developmentGate: { descriptor: other, profile: "review" } },
        { files: {} as never, rocs, workspace: createFakeWorkspacePort(repo) },
      ),
    /verified development ROCS descriptor required/,
  );
});

test("explicit gate fails closed when the development port is incomplete", async () => {
  const repo = await createTempOntologyRepo();
  const descriptor = await createTestDevelopmentDescriptor();
  for (const missing of ["discover", "boundPack"] as const) {
    const rocs = {
      developmentDescriptor: descriptor,
      discover: async () => {
        throw new Error("not called");
      },
      boundPack: async () => {
        throw new Error("not called");
      },
    } as unknown as RocsPort;
    delete (rocs as unknown as Record<string, unknown>)[missing];
    await assert.rejects(
      () =>
        inspectOntology(
          { kind: "search", query: "agent" },
          { cwd: repo, developmentGate: { descriptor, profile: "review" } },
          { files: {} as never, rocs, workspace: createFakeWorkspacePort(repo) },
        ),
      /verified development ROCS descriptor required/,
      missing,
    );
  }
});

test("verified bound pack delegates only with matching discovery snapshot and document identity", async () => {
  const repo = await createTempOntologyRepo();
  const descriptor = await createTestDevelopmentDescriptor();
  let bound = 0;
  let legacy = 0;
  const rocs = {
    developmentDescriptor: descriptor,
    async discover() {
      throw new Error("not called");
    },
    async boundPack(
      _repo: string,
      ontId: string,
      _profile: string,
      snapshot: string,
      document: string,
    ) {
      bound++;
      assert.equal(snapshot, digest);
      assert.equal(document, digest);
      return {
        invocation: "ok" as const,
        result: {
          schema: "semantic-pack-result.v0" as const,
          corpus_snapshot_digest: digest,
          root_id: ontId,
          root_document_digest: digest,
          config: {},
          documents: [
            {
              ont_id: ontId,
              kind: "concept",
              logical_path: "x",
              document_digest: digest,
              text: "trusted bytes, untrusted prose",
            },
          ],
          pack_digest: digest,
        },
      };
    },
    async pack() {
      legacy++;
      return { text: "legacy" };
    },
  } as unknown as RocsPort;
  const result = await inspectOntology(
    { kind: "pack", ontId: "core.Agent" },
    {
      cwd: repo,
      developmentGate: {
        descriptor,
        profile: "review",
        boundSelection: {
          ontId: "core.Agent",
          corpusSnapshotDigest: digest,
          documentDigest: digest,
        },
      },
    },
    { files: {} as never, rocs, workspace: createFakeWorkspacePort(repo) },
  );
  assert.equal(bound, 1);
  assert.equal(legacy, 0);
  assert.equal(result.pack?.text, "trusted bytes, untrusted prose");
});
