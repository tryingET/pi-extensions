import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execute = (tool, callId, params, cwd) =>
  tool.execute(callId, params, undefined, undefined, { cwd });

export async function runPackedReleaseSmoke({
  phase,
  snapshotRead,
  snapshotEdit,
  installStandardOverrides,
  getTool,
  getAllToolNames,
  getActiveTools,
  clear,
}) {
  if (phase === "restricted") {
    assert.equal(getTool("read"), undefined);
    assert.equal(getTool("edit"), undefined);
    const expectedNamespacedTools = ["snapshot_read", "snapshot_edit"];
    const allToolNames = getAllToolNames();
    const activeTools = getActiveTools();
    for (const toolName of expectedNamespacedTools) {
      assert.ok(allToolNames.includes(toolName), `${toolName} is absent from Pi's tool registry`);
      assert.ok(activeTools.includes(toolName), `${toolName} is absent from Pi's active tools`);
    }
    const directory = await mkdtemp(join(tmpdir(), "pi-snapshot-edit-restricted-smoke-"));
    try {
      const path = join(directory, "restricted.txt");
      await writeFile(path, "before\n", "utf8");
      const readResult = await execute(
        snapshotRead,
        "restricted-read",
        { path: "restricted.txt" },
        directory,
      );
      await execute(
        snapshotEdit,
        "restricted-edit",
        {
          path: "restricted.txt",
          base: readResult.details.revision,
          edits: [{ op: "replace", oldText: "before", newText: "after" }],
        },
        directory,
      );
      assert.equal(await readFile(path, "utf8"), "after\n");
      return "restricted host tools kept namespaced-only Protocol B available";
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  if (phase === "restart") {
    await assert.rejects(
      execute(
        snapshotEdit,
        "restart-expiry",
        {
          path: "restart.txt",
          base: "amber",
          edits: [{ op: "replace", oldText: "before", newText: "after" }],
        },
        process.cwd(),
      ),
      /Unknown or expired revision 'amber'/,
    );
    return "restart expiry OK";
  }
  if (phase !== "fresh") throw new Error(`Unknown release smoke phase: ${phase}`);

  const directory = await mkdtemp(join(tmpdir(), "pi-snapshot-edit-packed-smoke-"));
  try {
    const namespacedPath = join(directory, "namespaced.txt");
    await writeFile(namespacedPath, "same\nsame\n", "utf8");
    const namespacedRead = await execute(
      snapshotRead,
      "namespaced-read",
      { path: "namespaced.txt" },
      directory,
    );
    assert.match(namespacedRead.content[0].text, /^revision:amber\nsame\nsame\n$/);
    await execute(
      snapshotEdit,
      "namespaced-edit",
      {
        path: "namespaced.txt",
        base: namespacedRead.details.revision,
        edits: [{ op: "replace", oldText: "same", occurrence: 2, newText: "selected" }],
      },
      directory,
    );
    assert.equal(await readFile(namespacedPath, "utf8"), "same\nselected\n");

    const installed = installStandardOverrides();
    assert.equal(
      installed.installed,
      false,
      "default session startup did not install standard tools",
    );
    const standardRead = getTool("read");
    const standardEdit = getTool("edit");
    assert.ok(standardRead && standardEdit, "standard Protocol B tools were not registered");

    const standardPath = join(directory, "standard.txt");
    await writeFile(
      standardPath,
      Buffer.from("\ufeffalpha\r\nrepeat\r\nrepeat\r\nomega\r\n", "utf8"),
    );
    const readResult = await execute(
      standardRead,
      "standard-read",
      { path: "standard.txt" },
      directory,
    );
    await execute(
      standardEdit,
      "standard-edit",
      {
        path: "standard.txt",
        base: readResult.details.revision,
        edits: [
          { op: "replace", oldText: "repeat", occurrence: 2, newText: "chosen" },
          { op: "insert_after", anchorText: "omega", newText: "\nend" },
        ],
      },
      directory,
    );
    assert.deepEqual(
      await readFile(standardPath),
      Buffer.from("\ufeffalpha\r\nrepeat\r\nchosen\r\nomega\r\nend\r\n", "utf8"),
      "standard Protocol B edit did not preserve exact expected bytes",
    );

    const legacy = standardEdit.prepareArguments({
      path: "standard.txt",
      base: readResult.details.revision,
      edits: [{ op: "replace", startLine: 2, endLine: 2, newText: "legacy" }],
    });
    await assert.rejects(
      execute(standardEdit, "legacy-lines", legacy, directory),
      /retired line coordinates.*Call read again/,
    );

    const expiringRead = await execute(
      snapshotRead,
      "expiry-read",
      { path: "namespaced.txt" },
      directory,
    );
    clear();
    await assert.rejects(
      execute(
        snapshotEdit,
        "clear-expiry",
        {
          path: "namespaced.txt",
          base: expiringRead.details.revision,
          edits: [{ op: "replace", oldText: "selected", newText: "expired" }],
        },
        directory,
      ),
      /Unknown or expired revision/,
    );
    return "namespaced + guarded standard Protocol B + duplicate occurrence + legacy rejection + exact bytes + clear expiry OK";
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
