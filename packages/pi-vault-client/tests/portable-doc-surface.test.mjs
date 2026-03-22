import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { validatePortableDocSurface } from "../scripts/validate-portable-doc-surface.mjs";

function withTempDir(run) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pi-vault-doc-surface-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeFile(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

function packJson(files) {
  return [
    {
      files: files.map((filePath) => ({ path: filePath })),
    },
  ];
}

test("validatePortableDocSurface rejects absolute filesystem markdown links", () => {
  withTempDir((dir) => {
    writeFile(path.join(dir, "README.md"), "See [bad](/home/tryinget/private.md).\n");

    const result = validatePortableDocSurface({ rootDir: dir });

    assert.equal(result.ok, false);
    assert.match(result.issues[0], /absolute filesystem markdown link is not portable/);
  });
});

test("validatePortableDocSurface rejects reference-style absolute filesystem links", () => {
  withTempDir((dir) => {
    writeFile(path.join(dir, "README.md"), "See [bad][ref].\n\n[ref]: /home/tryinget/private.md\n");

    const result = validatePortableDocSurface({ rootDir: dir });

    assert.equal(result.ok, false);
    assert.match(result.issues[0], /absolute filesystem markdown link is not portable/);
  });
});

test("validatePortableDocSurface rejects angle-bracket destinations with spaces", () => {
  withTempDir((dir) => {
    writeFile(path.join(dir, "README.md"), "See [bad](<./docs/My Plan.md>).\n");

    const result = validatePortableDocSurface({
      rootDir: dir,
      packJson: packJson(["README.md"]),
    });

    assert.equal(result.ok, false);
    assert.match(result.issues[0], /local link is not present in the packed artifact/);
  });
});

test("validatePortableDocSurface rejects autolinked file URIs", () => {
  withTempDir((dir) => {
    writeFile(path.join(dir, "README.md"), "See <file:///home/tryinget/private.md>.\n");

    const result = validatePortableDocSurface({ rootDir: dir });

    assert.equal(result.ok, false);
    assert.match(result.issues[0], /absolute filesystem markdown link is not portable/);
  });
});

test("validatePortableDocSurface rejects README links absent from the packed artifact", () => {
  withTempDir((dir) => {
    writeFile(path.join(dir, "README.md"), "See [plan](docs/dev/plan.md).\n");
    writeFile(path.join(dir, "docs/dev/plan.md"), "# Plan\n");

    const result = validatePortableDocSurface({
      rootDir: dir,
      packJson: packJson(["README.md"]),
    });

    assert.equal(result.ok, false);
    assert.match(result.issues[0], /README\.md: local link is not present in the packed artifact/);
  });
});

test("validatePortableDocSurface rejects shipped prompt markdown with absolute filesystem links", () => {
  withTempDir((dir) => {
    writeFile(path.join(dir, "README.md"), "# Docs\n");
    writeFile(path.join(dir, "prompts/task.md"), "See [bad](/home/tryinget/private.md).\n");

    const result = validatePortableDocSurface({
      rootDir: dir,
      packJson: packJson(["README.md", "prompts/task.md"]),
    });

    assert.equal(result.ok, false);
    assert.match(
      result.issues[0],
      /prompts\/task\.md: absolute filesystem markdown link is not portable/,
    );
  });
});

test("validatePortableDocSurface rejects local links from shipped prompt markdown when the target is not packed", () => {
  withTempDir((dir) => {
    writeFile(path.join(dir, "README.md"), "# Docs\n");
    writeFile(path.join(dir, "prompts/task.md"), "See [plan](../docs/plan.md).\n");
    writeFile(path.join(dir, "docs/plan.md"), "# Plan\n");

    const result = validatePortableDocSurface({
      rootDir: dir,
      packJson: packJson(["README.md", "prompts/task.md"]),
    });

    assert.equal(result.ok, false);
    assert.match(
      result.issues[0],
      /prompts\/task\.md: local link is not present in the packed artifact/,
    );
  });
});

test("validatePortableDocSurface accepts README links that use stable web URLs", () => {
  withTempDir((dir) => {
    writeFile(
      path.join(dir, "README.md"),
      "See [plan](https://github.com/example/repo/blob/main/docs/dev/plan.md).\n",
    );

    const result = validatePortableDocSurface({
      rootDir: dir,
      packJson: packJson(["README.md"]),
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.issues, []);
  });
});

test("validatePortableDocSurface accepts README links that target packaged files", () => {
  withTempDir((dir) => {
    writeFile(path.join(dir, "README.md"), "See [prompt](prompts/task-worker-loop.md).\n");
    writeFile(path.join(dir, "prompts/task-worker-loop.md"), "# Prompt\n");

    const result = validatePortableDocSurface({
      rootDir: dir,
      packJson: packJson(["README.md", "prompts/task-worker-loop.md"]),
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.issues, []);
  });
});
