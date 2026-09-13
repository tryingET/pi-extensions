#!/usr/bin/env node
/** Offline read-only retrieval instrument; never claims paired model-task evidence. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contextPacketToolResult } from "../src/context-pack.js";
import { copyApprovedCorpus, digest, stableRead } from "../src/ripwire-corpus.js";
import { literalReference, summarizeStudy, validateStudy } from "../src/ripwire-evaluation.js";

const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const [key, value] = process.argv.slice(i, i + 2);
  assert.ok(
    ["--manifest", "--manifest-sha256", "--roots", "--output-dir"].includes(key) &&
      value &&
      !flags.has(key),
  );
  flags.set(key, value);
}
assert.equal(
  flags.size,
  4,
  "--manifest FILE --manifest-sha256 SHA --roots JSON --output-dir NEW_EXTERNAL_DIR",
);
const manifestBytes = await stableRead(resolve(flags.get("--manifest")), 1024 * 1024);
const manifestSha256 = digest(manifestBytes);
assert.equal(manifestSha256, flags.get("--manifest-sha256"), "frozen manifest mismatch");
const study = validateStudy(JSON.parse(manifestBytes));
const roots = JSON.parse(await stableRead(resolve(flags.get("--roots")), 65536));
assert.deepEqual(Object.keys(roots).sort(), study.repositories.map((repo) => repo.id).sort());
const output = resolve(flags.get("--output-dir"));
assert.equal(await realpath(dirname(output)), dirname(output), "output parent must be canonical");
const inside = (parent, child) => {
  const rel = relative(parent, child);
  return !rel || (!rel.startsWith("../") && !isAbsolute(rel));
};
for (const repo of study.repositories) {
  const entry = roots[repo.id];
  assert.equal(entry.revision, repo.revision, "revision declaration mismatch");
  assert.equal(await realpath(entry.root), entry.root, "target must be canonical");
  assert.ok((await stat(entry.root)).isDirectory() && !inside(entry.root, output));
}
assert.ok(!inside(resolve(dirname(fileURLToPath(import.meta.url)), ".."), output));
await mkdir(output, { mode: 0o700 }); // must be a new directory; never overwrite evidence
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let candidateSha = null;
try {
  candidateSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: packageRoot,
    encoding: "utf8",
  }).trim();
} catch {
  /* artifact may not include Git metadata */
}
const protocolSha256 = digest(await readFile(join(packageRoot, "src/ripwire-evaluation.js")));
await writeFile(
  join(output, "preregistration.json"),
  JSON.stringify({
    manifestSha256,
    protocolSha256,
    candidateSha,
    startedAt: new Date().toISOString(),
  }),
  { mode: 0o600, flag: "wx" },
);
const records = [];
for (const repo of study.repositories) {
  const root = roots[repo.id].root;
  const temp = await mkdtemp(join(tmpdir(), "ripwire-study-"));
  try {
    const corpusRoot = join(temp, "corpus");
    await mkdir(corpusRoot);
    const before = await copyApprovedCorpus(root, corpusRoot);
    const files = [];
    for (const path of before.files.keys())
      files.push({ path, content: await readFile(join(corpusRoot, path), "utf8") });
    for (const item of study.cases.filter((entry) => entry.repository === repo.id)) {
      for (const target of item.gold)
        assert.equal(
          digest(await stableRead(join(root, target.path), 512 * 1024)),
          target.sha256,
          "gold source changed",
        );
      let start = performance.now();
      const baseline = literalReference(files, item.question);
      const literal = { ok: true, paths: baseline, durationMs: performance.now() - start };
      start = performance.now();
      const result = await contextPacketToolResult(
        {
          objective: item.question,
          cwd: root,
          repoRoot: root,
          providers: {
            agents: "off",
            docs: "off",
            git: "off",
            session: "off",
            ripwire: "required",
          },
          budget: { maxBytes: 24000, maxTokens: 12000, reserveTokens: 1 },
        },
        {
          cwd: root,
          ripwire: {
            binaryPath: process.env.PI_CONTEXT_PACKER_RIPWIRE_BIN,
            binarySha256: process.env.PI_CONTEXT_PACKER_RIPWIRE_SHA256,
          },
        },
      );
      const durationMs = performance.now() - start;
      const text = result.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
      // Paths are deliberately taken from rendered content, not hidden pre-budget candidates.
      const paths = [...new Set([...text.matchAll(/^- path: (.+)$/gmu)].map((match) => match[1]))];
      assert.ok(
        paths.every((path) => before.files.has(path)),
        "result escaped shared corpus",
      );
      const raw = JSON.stringify({
        request: { question: item.question, repository: repo.id },
        result,
      });
      const rawFile = `${item.id}.json`;
      await writeFile(join(output, rawFile), raw, { flag: "wx", mode: 0o600 });
      records.push({
        id: item.id,
        literal_reference: literal,
        ripwire: {
          ok: result.details?.ok === true && result.isError !== true,
          paths,
          durationMs,
          renderedBytes: Buffer.byteLength(text),
          outputSha256: digest(raw),
          rawFile,
        },
        snapshotId: before.snapshotId,
        analyzedFiles: before.files.size,
        goldInApprovedCorpus: item.gold.every((target) => before.files.has(target.path)),
      });
    }
    const afterRoot = join(temp, "after");
    await mkdir(afterRoot);
    assert.equal(
      (await copyApprovedCorpus(root, afterRoot)).snapshotId,
      before.snapshotId,
      "target changed during evaluation",
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
const summary = summarizeStudy(study, records);
const result = {
  ...summary,
  manifestSha256,
  protocolSha256,
  candidateSha,
  sourceIdentity:
    "declared revision plus verified gold and observed approved-corpus SHA-256; not independent whole-tree Git attestation",
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cache: "disabled",
    byteBudget: 24000,
  },
  records,
};
await writeFile(join(output, "results.json"), `${JSON.stringify(result, null, 2)}\n`, {
  mode: 0o600,
  flag: "wx",
});
console.log(
  JSON.stringify({
    experimentValid: true,
    adoptionEligible: false,
    summary: result.aggregate,
    outputSha256: digest(JSON.stringify(result)),
  }),
);
