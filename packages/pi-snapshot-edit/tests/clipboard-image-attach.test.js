// summary: "Tests clipboard-path allowlisting, still-image sniffing, and input-transform attachment."
// read_when:
//   - "Changing clipboard image lift allowlisting, sniffing, or attachment markers."

import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CLIPBOARD_IMAGE_LIFT_ENV,
  detectStillImageMimeType,
  findClipboardImagePaths,
  isPathInsideDir,
  liftClipboardImages,
} from "../src/clipboard-image-attach.js";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=",
  "base64",
);
const CLIPBOARD_NAME = "pi-clipboard-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png";

async function withTempDir(operation) {
  const directory = await mkdtemp(join(tmpdir(), "pi-clipboard-lift-"));
  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("findClipboardImagePaths extracts absolute clipboard placeholders", () => {
  const path = `/tmp/${CLIPBOARD_NAME}`;
  const found = findClipboardImagePaths(`look ${path} please`);
  assert.equal(found.length, 1);
  assert.equal(found[0].raw, path);
});

test("detectStillImageMimeType accepts PNG and rejects animated PNG", () => {
  assert.equal(detectStillImageMimeType(PNG_1X1), "image/png");
  const animated = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from([0, 0, 0, 13]),
    Buffer.from("IHDR"),
    Buffer.alloc(13),
    Buffer.alloc(4),
    Buffer.from([0, 0, 0, 8]),
    Buffer.from("acTL"),
    Buffer.alloc(8),
    Buffer.alloc(4),
  ]);
  assert.equal(detectStillImageMimeType(animated), null);
  assert.equal(detectStillImageMimeType(Buffer.from("not-an-image")), null);
});

test("isPathInsideDir requires a nested path", () => {
  assert.equal(isPathInsideDir("/tmp/pi/file.png", "/tmp/pi"), true);
  assert.equal(isPathInsideDir("/tmp/pi", "/tmp/pi"), false);
  assert.equal(isPathInsideDir("/tmp/other/file.png", "/tmp/pi"), false);
});

test("liftClipboardImages attaches tmpdir clipboard PNGs and rewrites a file marker", async () => {
  await withTempDir(async (directory) => {
    const filePath = join(directory, CLIPBOARD_NAME);
    await writeFile(filePath, PNG_1X1);
    const result = await liftClipboardImages(`how can we make this real? ${filePath}`, [], {
      tmpDir: directory,
    });
    assert.equal(result.changed, true);
    assert.equal(result.text, `how can we make this real? <file name="${filePath}"></file>`);
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].type, "image");
    assert.equal(result.images[0].mimeType, "image/png");
    assert.equal(result.images[0].data, PNG_1X1.toString("base64"));
  });
});

test("liftClipboardImages ignores files outside tmpdir and missing files", async () => {
  await withTempDir(async (tmpRoot) => {
    await withTempDir(async (outside) => {
      const outsidePath = join(outside, CLIPBOARD_NAME);
      await writeFile(outsidePath, PNG_1X1);
      const missing = join(tmpRoot, "pi-clipboard-ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee.png");
      const result = await liftClipboardImages(`${outsidePath} ${missing}`, [], {
        tmpDir: tmpRoot,
      });
      assert.equal(result.changed, false);
      assert.equal(result.images.length, 0);
    });
  });
});

test("liftClipboardImages refuses symlink escape and non-image bytes", async () => {
  await withTempDir(async (tmpRoot) => {
    await withTempDir(async (outside) => {
      const secret = join(outside, "secret.png");
      await writeFile(secret, PNG_1X1);
      const escapeLink = join(tmpRoot, CLIPBOARD_NAME);
      await symlink(secret, escapeLink);
      const fake = join(tmpRoot, "pi-clipboard-ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee.png");
      await writeFile(fake, "hello");
      const result = await liftClipboardImages(`${escapeLink} ${fake}`, [], { tmpDir: tmpRoot });
      assert.equal(result.changed, false);
    });
  });
});

test("liftClipboardImages honors opt-out and preserves existing images", async () => {
  await withTempDir(async (directory) => {
    const filePath = join(directory, CLIPBOARD_NAME);
    await writeFile(filePath, PNG_1X1);
    const existing = [{ type: "image", mimeType: "image/jpeg", data: "abc" }];
    const disabled = await liftClipboardImages(filePath, existing, {
      tmpDir: directory,
      env: { [CLIPBOARD_IMAGE_LIFT_ENV]: "off" },
    });
    assert.equal(disabled.changed, false);
    assert.deepEqual(disabled.images, existing);
    const enabled = await liftClipboardImages(`see ${filePath}`, existing, { tmpDir: directory });
    assert.equal(enabled.changed, true);
    assert.equal(enabled.images.length, 2);
    assert.equal(enabled.images[0].mimeType, "image/jpeg");
  });
});
