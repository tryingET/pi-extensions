// Explicit real-ROCS regression lane: only disposable target repositories are mutated.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getBroker, resetBroker } from "@tryinget/pi-trigger-adapter";
import { createFilesystemPort } from "../src/adapters/filesystem.ts";
import { registerOntologyInteractionRuntime } from "../src/adapters/interaction.ts";
import { createRocsCliPort } from "../src/adapters/rocs-cli.ts";
import { runOntologyChange } from "../src/core/change.ts";
import { inspectOntology } from "../src/core/inspect.ts";
import { assessOntologyProposal } from "../src/core/proposal.ts";
import {
  createFakeWorkspacePort,
  createTempOntologyRepo,
  createTempRootLayoutOntologyRepo,
} from "./helpers.ts";

async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(dir: string) {
    for (const name of (await readdir(dir)).sort()) {
      const file = path.join(dir, name);
      const stat = await lstat(file, { bigint: true });
      result[path.relative(root, file)] = `${stat.mtimeNs}:${
        stat.isDirectory()
          ? "dir"
          : createHash("sha256")
              .update(await readFile(file))
              .digest("hex")
      }`;
      if (stat.isDirectory()) await visit(file);
    }
  }
  await visit(root);
  return result;
}

test("real ROCS inspection preserves source, projections and both authority receipts", async (t) => {
  const wrapperRoot = await mkdtemp(path.join(tmpdir(), "inspection-rocs-"));
  const wrapper = path.join(wrapperRoot, "rocs");
  const cacheRoot = path.join(wrapperRoot, "cache");
  const owner =
    process.env.PI_ONTOLOGY_TEST_ROCS_PROJECT ?? path.join(homedir(), "ai-society/core/rocs-cli");
  await writeFile(wrapper, `#!/bin/sh\nexec '${owner}/.venv/bin/python' -B -m rocs_cli "$@"\n`);
  await chmod(wrapper, 0o700);
  const previous = { ...process.env };
  process.env.PI_ONTOLOGY_ROCS_BIN = wrapper;
  process.env.PYTHONDONTWRITEBYTECODE = "1";
  process.env.ROCS_CACHE_DIR = cacheRoot;
  delete process.env.ROCS_OUTPUT_ROOT;
  t.after(async () => {
    process.env = previous;
    await rm(wrapperRoot, { recursive: true });
  });

  for (const layout of ["nested", "root"] as const) {
    await t.test(layout, async (t) => {
      const repo = await (layout === "nested"
        ? createTempOntologyRepo()
        : createTempRootLayoutOntologyRepo());
      t.after(() => rm(repo, { recursive: true }));
      const files = createFilesystemPort();
      const rocs = createRocsCliPort();
      const deps = { files, rocs, workspace: createFakeWorkspacePort(repo) };
      process.env.ROCS_AUTHORITY_AGGREGATE = "1";
      await runOntologyChange(
        {
          mode: "apply",
          artifactKind: "concept",
          operation: "create",
          targetId: "demo.Probe",
          title: "Probe",
          description: "A disposable ontology inspection regression fixture.",
          examples: ["testing"],
          antiExamples: ["production"],
          validateAfter: true,
          buildAfter: true,
        },
        { cwd: repo },
        deps,
      );
      delete process.env.ROCS_AUTHORITY_AGGREGATE;
      const dist = path.join(repo, layout === "nested" ? "ontology/dist" : "dist");
      for (const command of ["build", "validate"]) {
        const receipt = JSON.parse(
          await readFile(path.join(dist, `authority-receipt.${command}.json`), "utf8"),
        );
        assert.equal(receipt.command, command);
        assert.equal(receipt.ok, true);
      }
      const before = await snapshot(repo);
      const cacheBefore = await snapshot(cacheRoot);
      // Each check runs even when a preceding read operation damages the target (causal red evidence).
      for (const kind of ["search", "status", "pack", "empty-search", "proposal"] as const) {
        await t.test(kind, async () => {
          if (kind === "proposal") {
            const result = await assessOntologyProposal(
              {
                candidateKind: "concept",
                title: "Probe",
                description: "A disposable ontology inspection regression fixture.",
              },
              { cwd: repo },
              deps,
            );
            assert.equal(result.verdict, "likely_duplicate");
          } else {
            const result = await inspectOntology(
              {
                kind: kind === "empty-search" ? "search" : kind,
                query: kind === "empty-search" ? "" : "Probe",
                ontId: "demo.Probe",
              },
              { cwd: repo },
              deps,
            );
            if (kind === "search" || kind === "empty-search")
              assert.equal(result.search?.hits[0]?.ontId, "demo.Probe");
            if (kind === "status") assert.equal(result.status?.validation?.ok, true);
            if (kind === "pack") assert.match(result.pack?.text ?? "", /demo.Probe/);
          }
          assert.deepEqual(await snapshot(repo), before);
        });
      }
      await t.test("catalog consumption failure cleans private outputs", async () => {
        await assert.rejects(
          inspectOntology(
            { kind: "search", query: "Probe" },
            { cwd: repo },
            {
              ...deps,
              files: {
                ...files,
                readJson: async () => {
                  throw new Error("catalog unavailable");
                },
              },
            },
          ),
          /catalog unavailable/,
        );
        assert.deepEqual(await snapshot(repo), before);
      });
      await t.test("all registered picker searches, including picker cancellation", async () => {
        resetBroker();
        process.env.PI_ONTOLOGY_INTERACTION_ENABLED = "1";
        registerOntologyInteractionRuntime({ on() {} } as never, deps);
        for (const id of ["ontology-id-picker", "ontology-pack-picker", "ontology-change-picker"]) {
          const handler = getBroker().get(id)?.handler as (...args: unknown[]) => Promise<void>;
          assert.equal(typeof handler, "function");
          for (const cancel of [false, true]) {
            let inserted = "";
            await handler(
              { groups: ["Probe"] },
              {},
              {
                ctx: { cwd: repo },
                select: async (_title: string, choices: string[]) => (cancel ? null : choices[0]),
                setText: (text: string) => {
                  inserted = text;
                },
                notify: (message: string) => {
                  throw new Error(message);
                },
              },
            );
            if (cancel) assert.equal(inserted, "");
            else assert.match(inserted, /demo.Probe/);
            assert.deepEqual(await snapshot(repo), before);
          }
        }
        resetBroker();
      });
      assert.deepEqual(
        await snapshot(cacheRoot),
        cacheBefore,
        "inspection must not refresh the index cache",
      );
      // The explicitly mutable port must still publish, not silently use inspection isolation.
      const mutable = await rocs.build(repo, {
        workspaceRoot: repo,
        workspaceRefMode: "loose",
        resolveRefs: true,
      });
      assert.equal(mutable.dist.dir, dist);
      assert.equal(
        JSON.parse(await readFile(path.join(dist, "authority-receipt.build.json"), "utf8"))
          .workspace_ref_mode,
        "loose",
      );
      assert.notDeepEqual(await snapshot(repo), before);

      await t.test(
        "strict fails and loose stays non-authoritative for an unpinned local dependency",
        async (t) => {
          const dependency = await createTempRootLayoutOntologyRepo();
          t.after(() => rm(dependency, { recursive: true }));
          const manifest = path.join(
            repo,
            layout === "nested" ? "ontology/manifest.yaml" : "manifest.yaml",
          );
          await writeFile(
            manifest,
            `rocs:\n  layers:\n    - name: local\n      path: ${layout === "nested" ? "ontology/src" : "src"}\n    - name: dependency\n      ref: '<repo:${path.basename(dependency)}@missing-pin>'\n`,
          );
          const boundBefore = await snapshot(repo);
          const context = {
            workspaceRoot: path.dirname(dependency),
            workspaceRefMode: "loose" as const,
            resolveRefs: true,
          };
          assert.ok(rocs.withInspectionOutput);
          await rocs.withInspectionOutput(repo, async (scoped) => {
            const build = await scoped.build(repo, context);
            assert.ok(build.dist.files.authority_receipt_command);
            const receipt = JSON.parse(
              await readFile(build.dist.files.authority_receipt_command, "utf8"),
            );
            assert.equal(receipt.authority_mode, "best_effort_workspace_loose");
            assert.equal(receipt.authoritative, false);
            assert.equal(receipt.workspace_ref_mode, "loose");
          });
          await assert.rejects(
            rocs.withInspectionOutput(repo, (scoped) =>
              scoped.build(repo, { ...context, workspaceRefMode: "strict" }),
            ),
            {
              message: `local ref not available in workspace: <repo:${path.basename(dependency)}@missing-pin> (workspace ref mismatch in strict mode: 'missing-pin' is not in the local clone; fetch it, e.g. \`git -C <clone> fetch --tags\`, or use --workspace-ref-mode loose)`,
            },
          );
          assert.deepEqual(await snapshot(repo), boundBefore);
        },
      );
      await t.test("strict pinned reads succeed in-place and from private snapshots", async (t) => {
        const dependency = await createTempRootLayoutOntologyRepo();
        t.after(() => rm(dependency, { recursive: true }));
        const document = path.join(dependency, "src/reference/concepts/demo.Pinned.md");
        const ontology = path.join(repo, layout === "nested" ? "ontology" : "");
        const pinnedText = (
          await readFile(path.join(ontology, "src/reference/concepts/demo.Probe.md"), "utf8")
        )
          .replaceAll("demo.Probe", "demo.Pinned")
          .replaceAll("Probe", "Pinned")
          .concat(
            "\nLiteral body text (not a filename heading):\n",
            "/example/.pi-ontology-inspect-legitimate/cache/workspace-ref-snapshots/tree/src/example.md\n",
            "[bold]Keep markup[/bold] and  two spaces.\n",
            "A deliberately long body line that must never be wrapped: ",
            "preserve-exact-bytes ".repeat(12),
            "\n\n",
          );
        await writeFile(document, pinnedText);
        const git = (...args: string[]) =>
          execFileSync(
            "git",
            [
              "-C",
              dependency,
              "-c",
              "user.name=Disposable Fixture",
              "-c",
              "user.email=fixture@example.invalid",
              "-c",
              "commit.gpgsign=false",
              "-c",
              "core.hooksPath=/dev/null",
              "-c",
              "maintenance.auto=false",
              "-c",
              "gc.auto=0",
              ...args,
            ],
            {
              encoding: "utf8",
              env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
            },
          ).trim();
        git("init", "--quiet");
        git("add", "manifest.yaml", "src");
        git("commit", "--quiet", "-m", "Disposable pinned ontology");
        const commit = git("rev-parse", "HEAD");
        assert.match(commit, /^[a-f0-9]{40}$/);
        await writeFile(
          path.join(ontology, "manifest.yaml"),
          `rocs:\n  layers:\n    - name: local\n      path: ${layout === "nested" ? "ontology/src" : "src"}\n    - name: dependency\n      ref: '<repo:${path.basename(dependency)}@${commit}>'\n`,
        );
        const strictWorkspace = {
          ...deps.workspace,
          async resolveTarget() {
            return {
              ...(await deps.workspace.resolveTarget()),
              workspaceRoot: path.dirname(dependency),
              workspaceRefMode: "strict" as const,
            };
          },
        };
        assert.ok(rocs.withInspectionOutput);
        const scope = rocs.withInspectionOutput.bind(rocs);
        for (const dirty of [false, true]) {
          await t.test(
            dirty ? "dirty checkout uses pinned snapshot" : "clean checkout uses pinned source",
            async () => {
              if (dirty)
                await writeFile(
                  document,
                  pinnedText.replace(
                    "disposable ontology inspection",
                    "DIRTY WORKTREE MUST NOT BE READ",
                  ),
                );
              const repoBefore = await snapshot(repo);
              const dependencyBefore = await snapshot(dependency);
              const ambientBefore = await snapshot(cacheRoot);
              let receipts = 0;
              const assertReceipt = async (command: "build" | "validate") => {
                const roots = (await readdir(repo)).filter((name) =>
                  name.startsWith(".pi-ontology-inspect-"),
                );
                assert.equal(roots.length, 1);
                const receipt = JSON.parse(
                  await readFile(
                    path.join(repo, roots[0], "artifacts", `authority-receipt.${command}.json`),
                    "utf8",
                  ),
                );
                assert.equal(receipt.command, command);
                assert.equal(receipt.ok, true);
                assert.equal(receipt.workspace_ref_mode, "strict");
                assert.equal(receipt.authority_mode, "strict_ref_resolution");
                assert.equal(receipt.authoritative, true);
                assert.equal(
                  receipt.layer_sources.find(
                    (layer: { name: string }) => layer.name === "dependency",
                  ).source,
                  dirty ? "workspace_ref_snapshot" : "workspace",
                );
                if (dirty)
                  assert.ok(
                    (await readdir(path.join(repo, roots[0], "cache/workspace-ref-snapshots")))
                      .length > 0,
                  );
                receipts++;
              };
              const checked = {
                ...rocs,
                withInspectionOutput: <T>(
                  target: string,
                  operation: (port: typeof rocs) => Promise<T>,
                ) =>
                  scope(target, (scoped) =>
                    operation({
                      ...scoped,
                      async build(target, context) {
                        const result = await scoped.build(target, context);
                        await assertReceipt("build");
                        return result;
                      },
                      async validate(target, context) {
                        const result = await scoped.validate(target, context);
                        await assertReceipt("validate");
                        return result;
                      },
                    }),
                  ),
              };
              const strictDeps = { ...deps, workspace: strictWorkspace, rocs: checked };
              for (const kind of ["search", "status", "pack"] as const) {
                const result = await inspectOntology(
                  { kind, query: "demo.Pinned", ontId: "demo.Pinned" },
                  { cwd: repo },
                  strictDeps,
                );
                assert.equal(result.target.workspaceRefMode, "strict");
                if (kind === "search") {
                  assert.equal(result.search?.hits[0]?.ontId, "demo.Pinned");
                  assert.match(
                    result.search?.hits[0]?.definition ?? "",
                    /disposable ontology inspection/,
                  );
                  assert.equal(result.search?.hits[0]?.path, dirty ? "" : document);
                }
                if (kind === "status") assert.equal(result.status?.validation?.ok, true);
                if (kind === "pack") {
                  assert.match(result.pack?.text ?? "", /disposable ontology inspection/);
                  assert.doesNotMatch(result.pack?.text ?? "", /DIRTY WORKTREE/);
                  assert.equal(
                    result.pack?.text,
                    dirty ? pinnedText : `${document}\n${pinnedText}`,
                    "pack preserves exact pinned bytes and only advertises durable filenames",
                  );
                  assert.ok(document.length > 80, "legacy filename heading exceeds console width");
                }
                assert.deepEqual(await snapshot(repo), repoBefore);
                assert.deepEqual(await snapshot(dependency), dependencyBefore);
                assert.deepEqual(await snapshot(cacheRoot), ambientBefore);
              }
              assert.equal(
                receipts,
                2,
                "build and validate authority were inspected before cleanup",
              );
              await assert.rejects(
                inspectOntology(
                  { kind: "search", query: "demo.Pinned" },
                  { cwd: repo },
                  {
                    ...strictDeps,
                    files: {
                      ...files,
                      readJson: async () => {
                        throw new Error("strict catalog unavailable");
                      },
                    },
                  },
                ),
                /strict catalog unavailable/,
              );
              assert.deepEqual(await snapshot(repo), repoBefore);
              assert.deepEqual(await snapshot(dependency), dependencyBefore);
              assert.deepEqual(await snapshot(cacheRoot), ambientBefore);
            },
          );
        }
      });
      await t.test("invalid ontology status leaves canonical receipts untouched", async () => {
        const ontology = path.join(repo, layout === "nested" ? "ontology" : "");
        await writeFile(path.join(ontology, "manifest.yaml"), `rocs:\n  layer: repo\n`);
        await writeFile(
          path.join(ontology, "src/reference/concepts/demo.Probe.md"),
          "---\nont:\n  id: demo.Probe\n  type: invalid\n---\n",
        );
        const invalidBefore = await snapshot(repo);
        await assert.rejects(inspectOntology({ kind: "status" }, { cwd: repo }, deps));
        assert.deepEqual(await snapshot(repo), invalidBefore);
      });
    });
  }
});
