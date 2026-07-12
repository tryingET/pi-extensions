import assert from "node:assert/strict";
import {
  appendFileSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readEvidenceReviewFile } from "../src/reader.ts";
import { RESOURCE_CAPS, ReviewRejection } from "../src/validation.ts";

const validBytes = Buffer.from(
  await import("node:fs/promises").then(({ readFile }) =>
    readFile(join(import.meta.dirname, "fixtures", "valid.json")),
  ),
);

function workspace(): string {
  mkdirSync(join(import.meta.dirname, ".tmp"), { recursive: true });
  return mkdtempSync(join(import.meta.dirname, ".tmp", "reader-"));
}

async function expectRejected(workspacePath: string, namedPath: string): Promise<void> {
  await assert.rejects(
    () => readEvidenceReviewFile(workspacePath, namedPath),
    (error: unknown) => error instanceof ReviewRejection,
  );
}

test("reads only an explicitly named workspace-relative regular JSON file", async (t) => {
  const root = workspace();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "review.json"), validBytes);
  assert.equal(
    (await readEvidenceReviewFile(root, "review.json")).schema,
    "semantic-code-intelligence.evidence_review.v1",
  );
  await expectRejected(root, "");
  await expectRejected(root, "review.json ");
  await expectRejected(root, "review.txt");
  await expectRejected(root, join(root, "review.json"));
  await expectRejected(root, "../review.json");
  await expectRejected(root, "missing.json");
});

test("rejects symlinks and non-regular targets", async (t) => {
  const root = workspace();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "real.json"), validBytes);
  symlinkSync("real.json", join(root, "link.json"));
  mkdirSync(join(root, "directory.json"));
  await expectRejected(root, "link.json");
  await expectRejected(root, "directory.json");
});

test("rejects every observed symlink path component even when it resolves inside workspace", async (t) => {
  const root = workspace();
  mkdirSync(join(root, "real-directory"));
  writeFileSync(join(root, "real-directory", "review.json"), validBytes);
  symlinkSync("real-directory", join(root, "linked-directory"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  await assert.rejects(
    () => readEvidenceReviewFile(root, "linked-directory/review.json"),
    (error: unknown) => error instanceof ReviewRejection && error.code === "symlink_component",
  );
});

test("rejects an intermediate-directory symlink race even when inode identity matches", async (t) => {
  const base = workspace();
  const root = join(base, "workspace");
  const outside = join(base, "outside");
  mkdirSync(join(root, "safe"), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(root, "safe", "review.json"), validBytes);
  linkSync(join(root, "safe", "review.json"), join(outside, "review.json"));
  t.after(() => rmSync(base, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      readEvidenceReviewFile(root, "safe/review.json", {
        beforeOpen: () => {
          renameSync(join(root, "safe"), join(root, "checked-safe"));
          symlinkSync(outside, join(root, "safe"));
        },
      }),
    (error: unknown) => error instanceof ReviewRejection && error.code === "symlink_component",
  );
});

test("rejects same-size in-place overwrite during a potentially torn read", async (t) => {
  const root = workspace();
  const target = join(root, "overwritten.json");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(target, validBytes);
  await assert.rejects(
    () =>
      readEvidenceReviewFile(root, "overwritten.json", {
        afterFirstRead: () => writeFileSync(target, Buffer.alloc(validBytes.length, 0x20)),
      }),
    (error: unknown) => error instanceof ReviewRejection && error.code === "changed_during_read",
  );
});

test("one-byte overflow read catches growth after the descriptor is checked", async (t) => {
  const root = workspace();
  const target = join(root, "growing.json");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(target, validBytes);
  await assert.rejects(
    () =>
      readEvidenceReviewFile(root, "growing.json", {
        afterOpen: () => appendFileSync(target, Buffer.alloc(RESOURCE_CAPS.encodedBytes, 0x20)),
      }),
    (error: unknown) => error instanceof ReviewRejection && error.code === "encoded_bytes",
  );
});

test("rejects one-byte-over-cap growth boundary before JSON parsing", async (t) => {
  const root = workspace();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "maximum.json"), Buffer.alloc(RESOURCE_CAPS.encodedBytes, 0x20));
  writeFileSync(join(root, "oversize.json"), Buffer.alloc(RESOURCE_CAPS.encodedBytes + 1, 0x20));
  await expectRejected(root, "maximum.json");
  await expectRejected(root, "oversize.json");
});

test("strict UTF-8 decoder rejects malformed sequences", async (t) => {
  const root = workspace();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "invalid.json"),
    Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d]),
  );
  await expectRejected(root, "invalid.json");
});

test("reader source maintains no-follow, identity, post-read size, and overflow checks", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(join(import.meta.dirname, "..", "src", "reader.ts"), "utf8"),
  );
  assert.match(source, /O_NOFOLLOW/);
  assert.match(source, /openedDescriptorTarget/);
  assert.match(source, /no_follow_unavailable/);
  assert.match(source, /sameStableMetadata\(before, opened\)/);
  assert.match(source, /mtimeNs/);
  assert.match(source, /ctimeNs/);
  assert.match(source, /after\.size !== BigInt\(offset\)/);
  assert.match(source, /encodedBytes \+ 1/);
});
