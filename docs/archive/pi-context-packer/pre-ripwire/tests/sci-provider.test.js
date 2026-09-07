/**
summary: "Test SCI packet reads, sandboxing, artifact refusal, overrides, and environment isolation."
read_when:
  - "You change SCI provider execution, safety gates, path handling, or subprocess controls."
*/

import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildContextPacket as buildContextPacketImpl } from "../src/context-pack.js";

const buildContextPacket = (input, env = {}) =>
  buildContextPacketImpl(input, { cwd: input.cwd, ...env });

const makeWorkspace = async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-context-pack-sci-"));
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "AGENTS.md"), "# AGENTS\n", "utf8");
  await writeFile(join(root, "src", "example.js"), "export const target = 1;\n", "utf8");
  return root;
};

const writeGitMarker = async (root) => {
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, ".git", "HEAD"), "ref: refs/heads/main\n", "utf8");
};

const sciStdout = (value) =>
  JSON.stringify({
    content: [{ type: "text", text: JSON.stringify(value) }],
    isError: false,
  });

const pathExists = async (path) => {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
};

const withProcessEnv = async (updates, callback) => {
  const previous = new Map(Object.keys(updates).map((name) => [name, process.env[name]]));
  try {
    for (const [name, value] of Object.entries(updates)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    return await callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

test("context_pack uses SCI read_file for code path seeds", async () => {
  const root = await makeWorkspace();
  const calls = [];
  const fakeExec = async (command, args, options) => {
    calls.push({ command, args, options });
    assert.equal(command, "/tmp/fake-sci");
    assert.deepEqual(args.slice(0, 2), ["workflow", "read_file"]);
    return {
      stdout: sciStdout({
        path: "src/example.js",
        range: { startLine: 1, endLine: 120 },
        content: "export const target = 1;\n",
        truncated: false,
      }),
    };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "src/example.js" }],
      providers: { git: "off" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );

  const sci = result.packet.sections.find((section) => section.provider === "sci");
  assert.equal(calls.length, 1);
  assert.equal(sci.items.length, 1);
  assert.equal(sci.items[0].content, "export const target = 1;\n");
  assert.equal(sci.items[0].contentMode, "range");
  assert.ok(result.packet.measurementReceipt.estimatedToolCallsAvoided >= 3);
});

test("context_pack does not pass Markdown path seeds to SCI when SCI is selected", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "README.md"), "# Docs\n", "utf8");
  const readFilePaths = [];
  const fakeExec = async (_command, args) => {
    if (args[1] === "read_file") {
      readFilePaths.push(JSON.parse(args[3]).path);
      return { stdout: sciStdout({ content: "export const target = 1;\n" }) };
    }
    return { stdout: sciStdout({}) };
  };

  const result = await buildContextPacket(
    {
      objective: "Use implementation code and docs context",
      cwd: root,
      repoRoot: root,
      seeds: [
        { kind: "path", value: "src/example.js" },
        { kind: "path", value: "docs/README.md" },
      ],
      providers: { git: "off", session: "off" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(readFilePaths, ["src/example.js"]);
  assert.ok(result.packet.sections.some((section) => section.provider === "docs"));
  assert.ok(result.packet.sections.some((section) => section.provider === "sci"));
});

test("context_pack does not route uppercase Markdown path seeds to SCI", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "README.MD"), "# Uppercase Markdown\n", "utf8");
  const calls = [];
  const fakeExec = async (command, args, options) => {
    calls.push({ command, args, options });
    return { stdout: sciStdout({}) };
  };

  const result = await buildContextPacket(
    {
      objective: "Read docs context",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "docs/README.MD" }],
      providers: { git: "off", sci: "required" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec },
  );

  const docs = result.packet.sections.find((section) => section.provider === "docs");
  assert.equal(calls.length, 0);
  assert.equal(docs.items.length, 1);
  assert.equal(docs.items[0].kind, "doc");
  assert.ok(result.packet.omissions.some((omission) => omission.provider === "sci"));
});

test("context_pack falls back from SCI symbol_search to text_search inside a sandbox", async () => {
  const root = await makeWorkspace();
  const workflows = [];
  const fakeExec = async (_command, args) => {
    workflows.push(args[1]);
    if (args[1] === "read_file") {
      return { stdout: sciStdout({ content: "export const target = 1;\n" }) };
    }
    if (args[1] === "symbol_search") {
      return { stdout: sciStdout({ query: "target", count: 0, symbols: [] }) };
    }
    return {
      stdout: sciStdout({
        count: 1,
        results: [{ file: "src/example.js", line: 1, text: "export const target = 1;" }],
      }),
    };
  };

  const result = await buildContextPacket(
    {
      objective: "Find code symbol context",
      cwd: root,
      repoRoot: root,
      seeds: [
        { kind: "path", value: "src/example.js" },
        { kind: "symbol", value: "target" },
      ],
      providers: { git: "off" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );

  const sci = result.packet.sections.find((section) => section.provider === "sci");
  assert.deepEqual(workflows, ["read_file", "symbol_search", "text_search"]);
  assert.equal(sci.items.length, 2);
  assert.ok(sci.items.some((item) => item.content.includes("src/example.js")));
});

test("context_pack redacts SCI subprocess failures before packet surfaces", async () => {
  const root = await makeWorkspace();
  const fakeExec = async () => {
    throw new Error("SECRET TOKEN leaked through stderr at /tmp/customer-acme/sci.log");
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "src/example.js" }],
      providers: { git: "off" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );
  const serializedOmissions = JSON.stringify(result.packet.omissions);

  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "sci" &&
        omission.detail.includes("raw subprocess error output omitted"),
    ),
  );
  assert.doesNotMatch(serializedOmissions, /SECRET TOKEN|customer-acme|\/tmp\/|fake-sci/);
});

test("context_pack refuses SCI workflows until read-only safety is confirmed", async () => {
  const root = await makeWorkspace();
  const calls = [];
  const fakeExec = async (_command, _args, options) => {
    calls.push(options.cwd);
    await mkdir(join(options.cwd, ".ontology"));
    return {
      stdout: sciStdout({
        path: "src/example.js",
        content: "export const target = 1;\n",
      }),
    };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "src/example.js" }],
      providers: { git: "off" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec },
  );

  assert.equal(calls.length, 0);
  assert.equal(await pathExists(join(root, ".ontology")), false);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "sci" &&
        omission.detail.includes("read-only safety was not confirmed"),
    ),
  );
});

test("context_pack preserves refused SCI override omissions on read-only safety refusal", async () => {
  await withProcessEnv(
    {
      SCI_CLI: "/tmp/refused-sci-cli",
      PI_CONTEXT_PACKER_TRUST_CUSTOM_SCI_CLI: undefined,
    },
    async () => {
      const root = await makeWorkspace();
      const calls = [];
      const fakeExec = async () => {
        calls.push("called");
        return { stdout: sciStdout({ content: "should not run" }) };
      };

      const result = await buildContextPacket(
        {
          objective: "Use code context for implementation",
          cwd: root,
          repoRoot: root,
          seeds: [{ kind: "path", value: "src/example.js" }],
          providers: { agents: "off", docs: "off", git: "off", sci: "required" },
        },
        { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec },
      );

      assert.deepEqual(calls, []);
      assert.ok(
        result.packet.omissions.some(
          (omission) =>
            omission.provider === "sci" && omission.detail.includes("SCI_CLI override ignored"),
        ),
      );
      assert.ok(
        result.packet.omissions.some(
          (omission) =>
            omission.provider === "sci" &&
            omission.detail.includes("read-only safety was not confirmed"),
        ),
      );
      assert.doesNotMatch(JSON.stringify(result.packet), /refused-sci-cli|should not run/);
    },
  );
});

test("context_pack ignores allowSciArtifactCreation as a read-only safety bypass", async () => {
  const root = await makeWorkspace();
  const calls = [];
  const fakeExec = async (_command, _args, options) => {
    calls.push(options.cwd);
    await mkdir(join(options.cwd, ".ontology"));
    return { stdout: sciStdout({ content: "should not appear" }) };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "src/example.js" }],
      providers: { git: "off" },
    },
    {
      sciCommand: "/tmp/fake-sci",
      execFileAsync: fakeExec,
      allowSciArtifactCreation: true,
    },
  );

  assert.equal(calls.length, 0);
  assert.equal(await pathExists(join(root, ".ontology")), false);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "sci" &&
        omission.detail.includes("context-packer cannot authorize workflows"),
    ),
  );
});

test("context_pack refuses existing SCI artifacts even when bypass flag is set", async () => {
  const root = await makeWorkspace();
  await mkdir(join(root, ".ontology"));
  const calls = [];
  const fakeExec = async () => {
    calls.push("called");
    return { stdout: sciStdout({ content: "should not run" }) };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "src/example.js" }],
      providers: { git: "off" },
    },
    {
      sciCommand: "/tmp/fake-sci",
      execFileAsync: fakeExec,
      sciReadOnlySafe: true,
      allowExistingSciArtifacts: true,
    },
  );

  assert.equal(calls.length, 0);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "sci" && omission.detail.includes("existing .ontology"),
    ),
  );
});

test("context_pack preserves refused SCI override omissions on existing artifact refusal", async () => {
  await withProcessEnv(
    {
      PI_CONTEXT_PACKER_SCI_CLI: "/tmp/refused-context-packer-sci-cli",
      PI_CONTEXT_PACKER_TRUST_CUSTOM_SCI_CLI: undefined,
    },
    async () => {
      const root = await makeWorkspace();
      await mkdir(join(root, ".ontology"));
      const calls = [];
      const fakeExec = async () => {
        calls.push("called");
        return { stdout: sciStdout({ content: "should not run" }) };
      };

      const result = await buildContextPacket(
        {
          objective: "Use code context for implementation",
          cwd: root,
          repoRoot: root,
          seeds: [{ kind: "path", value: "src/example.js" }],
          providers: { agents: "off", docs: "off", git: "off", sci: "required" },
        },
        { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
      );

      assert.deepEqual(calls, []);
      assert.ok(
        result.packet.omissions.some(
          (omission) =>
            omission.provider === "sci" &&
            omission.detail.includes("PI_CONTEXT_PACKER_SCI_CLI override ignored"),
        ),
      );
      assert.ok(
        result.packet.omissions.some(
          (omission) =>
            omission.provider === "sci" && omission.detail.includes("existing .ontology"),
        ),
      );
      assert.doesNotMatch(
        JSON.stringify(result.packet),
        /refused-context-packer-sci-cli|should not run/,
      );
    },
  );
});

test("context_pack preserves refused SCI override omissions on sandbox setup failure", async () => {
  const root = await makeWorkspace();
  await withProcessEnv(
    {
      TMPDIR: join(root, "missing-tmp"),
      SCI_CLI: "/tmp/refused-sci-cli-for-sandbox-setup",
      PI_CONTEXT_PACKER_TRUST_CUSTOM_SCI_CLI: undefined,
    },
    async () => {
      const calls = [];
      const fakeExec = async () => {
        calls.push("called");
        return { stdout: sciStdout({ content: "should not run" }) };
      };

      const result = await buildContextPacket(
        {
          objective: "Use code context for implementation",
          cwd: root,
          repoRoot: root,
          seeds: [{ kind: "path", value: "src/example.js" }],
          providers: { agents: "off", docs: "off", git: "off", sci: "required" },
        },
        { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
      );

      assert.deepEqual(calls, []);
      assert.ok(
        result.packet.omissions.some(
          (omission) =>
            omission.provider === "sci" && omission.detail.includes("SCI_CLI override ignored"),
        ),
      );
      assert.ok(
        result.packet.omissions.some(
          (omission) =>
            omission.provider === "sci" && omission.detail.includes("SCI sandbox setup failed"),
        ),
      );
      assert.doesNotMatch(
        JSON.stringify(result.packet),
        /refused-sci-cli-for-sandbox-setup|should not run/,
      );
    },
  );
});

test("context_pack refuses ancestor repoRoot SCI artifacts from package cwd when repoRoot is omitted", async () => {
  const root = await makeWorkspace();
  const packageCwd = join(root, "packages", "pkg");
  await writeGitMarker(root);
  await mkdir(join(root, ".ontology"));
  await mkdir(packageCwd, { recursive: true });
  const calls = [];
  const fakeExec = async () => {
    calls.push("called");
    return { stdout: sciStdout({ content: "should not run" }) };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: packageCwd,
      seeds: [{ kind: "path", value: "src/example.js" }],
      providers: { git: "off" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );

  assert.equal(result.ok, true);
  assert.equal(result.packet.repoRoot, root);
  assert.equal(calls.length, 0);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "sci" && omission.detail.includes("existing .ontology"),
    ),
  );
});

test("context_pack reads repo-root-relative SCI path seeds from package cwd", async () => {
  const root = await makeWorkspace();
  const packageCwd = join(root, "packages", "pkg");
  const repoRelativePath = "packages/pkg/src/example.js";
  await writeGitMarker(root);
  await mkdir(join(packageCwd, "src"), { recursive: true });
  await writeFile(
    join(packageCwd, "src", "example.js"),
    "export const packageTarget = 1;\n",
    "utf8",
  );
  const calls = [];
  const fakeExec = async (_command, args, options) => {
    calls.push({ args, cwd: options.cwd });
    return {
      stdout: sciStdout({
        path: repoRelativePath,
        content: "export const packageTarget = 1;\n",
      }),
    };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: packageCwd,
      seeds: [{ kind: "path", value: repoRelativePath }],
      providers: { agents: "off", docs: "off", git: "off", sci: "required" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );

  const sci = result.packet.sections.find((section) => section.provider === "sci");
  assert.equal(result.packet.repoRoot, root);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].args[3]).path, repoRelativePath);
  assert.equal(sci.items[0].content, "export const packageTarget = 1;\n");
});

test("context_pack rebases cwd-relative SCI path seeds after repoRoot inference", async () => {
  const root = await makeWorkspace();
  const packageCwd = join(root, "packages", "pkg");
  await writeGitMarker(root);
  await mkdir(join(packageCwd, "src"), { recursive: true });
  await writeFile(join(packageCwd, "src", "local.js"), "export const localTarget = 1;\n", "utf8");
  const calls = [];
  const fakeExec = async (_command, args, options) => {
    calls.push({ args, cwd: options.cwd });
    return {
      stdout: sciStdout({
        path: "packages/pkg/src/local.js",
        content: "export const localTarget = 1;\n",
      }),
    };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: packageCwd,
      seeds: [{ kind: "path", value: "src/local.js" }],
      providers: { agents: "off", docs: "off", git: "off", sci: "required" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );

  const sci = result.packet.sections.find((section) => section.provider === "sci");
  assert.equal(result.packet.repoRoot, root);
  assert.equal(JSON.parse(calls[0].args[3]).path, "packages/pkg/src/local.js");
  assert.equal(sci.items[0].content, "export const localTarget = 1;\n");
});

test("context_pack refuses intermediate ancestor SCI artifacts from package cwd", async () => {
  const root = await makeWorkspace();
  const packageCwd = join(root, "packages", "pkg");
  await writeGitMarker(root);
  await mkdir(join(root, "packages", ".ontology"), { recursive: true });
  await mkdir(packageCwd, { recursive: true });
  await writeFile(join(packageCwd, "file.js"), "export const x = 1;\n", "utf8");
  const calls = [];
  const fakeExec = async () => {
    calls.push("called");
    return { stdout: sciStdout({ content: "should not run" }) };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: packageCwd,
      seeds: [{ kind: "path", value: "file.js" }],
      providers: { agents: "off", docs: "off", git: "off", sci: "required" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );

  assert.equal(result.packet.repoRoot, root);
  assert.equal(calls.length, 0);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "sci" && omission.detail.includes("existing .ontology"),
    ),
  );
});

test("context_pack omits SCI items when workflow creates .ontology despite artifact flag", async () => {
  const root = await makeWorkspace();
  const fakeExec = async (_command, _args, options) => {
    await mkdir(join(options.cwd, ".ontology"));
    return {
      stdout: sciStdout({
        path: "src/example.js",
        content: "SECRET SHOULD NOT BE SELECTED\n",
      }),
    };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "src/example.js" }],
      providers: { git: "off" },
    },
    {
      sciCommand: "/tmp/fake-sci",
      execFileAsync: fakeExec,
      sciReadOnlySafe: true,
      allowSciArtifactCreation: true,
    },
  );

  assert.equal(await pathExists(join(root, ".ontology")), false);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "sci" && omission.detail.includes("created or exposed .ontology"),
    ),
  );
  assert.doesNotMatch(JSON.stringify(result.packet), /SECRET SHOULD NOT BE SELECTED/);
});

test("context_pack stops SCI calls immediately after .ontology is created", async () => {
  const root = await makeWorkspace();
  await writeFile(join(root, "src", "second.js"), "export const second = 2;\n", "utf8");
  const calls = [];
  const fakeExec = async (_command, args, options) => {
    calls.push(args[1]);
    if (calls.length === 1) {
      await mkdir(join(options.cwd, ".ontology"));
      return { stdout: sciStdout({ content: "FIRST SHOULD BE OMITTED\n" }) };
    }
    return { stdout: sciStdout({ content: "SECOND SHOULD NOT RUN\n" }) };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: root,
      repoRoot: root,
      seeds: [
        { kind: "path", value: "src/example.js" },
        { kind: "path", value: "src/second.js" },
      ],
      providers: { agents: "off", docs: "off", git: "off", sci: "required" },
    },
    {
      sciCommand: "/tmp/fake-sci",
      execFileAsync: fakeExec,
      sciReadOnlySafe: true,
      allowSciArtifactCreation: true,
    },
  );

  assert.deepEqual(calls, ["read_file"]);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "sci" && omission.detail.includes("created or exposed .ontology"),
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(result.packet),
    /FIRST SHOULD BE OMITTED|SECOND SHOULD NOT RUN/,
  );
});

test("context_pack stops SCI symbol fallback after .ontology is created", async () => {
  const root = await makeWorkspace();
  const calls = [];
  const fakeExec = async (_command, args, options) => {
    calls.push(args[1]);
    if (args[1] === "read_file") {
      return { stdout: sciStdout({ content: "export const target = 1;\n" }) };
    }
    if (args[1] === "symbol_search") {
      await mkdir(join(options.cwd, ".ontology"));
      return { stdout: sciStdout({ query: "target", count: 0, symbols: [] }) };
    }
    return { stdout: sciStdout({ content: "TEXT SEARCH SHOULD NOT RUN\n" }) };
  };

  const result = await buildContextPacket(
    {
      objective: "Find code symbol context",
      cwd: root,
      repoRoot: root,
      seeds: [
        { kind: "path", value: "src/example.js" },
        { kind: "symbol", value: "target" },
      ],
      providers: { agents: "off", docs: "off", git: "off", sci: "required" },
    },
    {
      sciCommand: "/tmp/fake-sci",
      execFileAsync: fakeExec,
      sciReadOnlySafe: true,
      allowSciArtifactCreation: true,
    },
  );

  assert.deepEqual(calls, ["read_file", "symbol_search"]);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "sci" && omission.detail.includes("created or exposed .ontology"),
    ),
  );
  assert.doesNotMatch(JSON.stringify(result.packet), /TEXT SEARCH SHOULD NOT RUN/);
});

test("context_pack stops SCI command-candidate fallback after .ontology is created", async () => {
  const root = await makeWorkspace();
  const calls = [];
  const fakeExec = async (command, _args, options) => {
    calls.push(command);
    if (calls.length === 1) {
      await mkdir(join(options.cwd, ".ontology"));
      throw new Error("first SCI candidate failed after creating owner state");
    }
    return { stdout: sciStdout({ content: "SECOND CANDIDATE SHOULD NOT RUN\n" }) };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "src/example.js" }],
      providers: { agents: "off", docs: "off", git: "off", sci: "required" },
    },
    {
      sciCommand: "/tmp/first-sci",
      execFileAsync: fakeExec,
      sciReadOnlySafe: true,
      allowSciArtifactCreation: true,
    },
  );

  assert.deepEqual(calls, ["/tmp/first-sci"]);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) =>
        omission.provider === "sci" && omission.detail.includes("created or exposed .ontology"),
    ),
  );
  assert.doesNotMatch(JSON.stringify(result.packet), /SECOND CANDIDATE SHOULD NOT RUN/);
});

test("context_pack blocks symlink-escaped SCI path seeds before sandbox execution", async () => {
  const root = await makeWorkspace();
  const outside = await mkdtemp(join(tmpdir(), "pi-context-pack-sci-secret-"));
  await writeFile(join(outside, "secret.js"), "OUTSIDE SECRET\n", "utf8");
  await symlink(join(outside, "secret.js"), join(root, "src", "link.js"));
  const calls = [];
  const fakeExec = async () => {
    calls.push("called");
    return { stdout: sciStdout({ content: "should not run" }) };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "src/link.js" }],
      providers: { agents: "off", docs: "off", git: "off", sci: "required" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );

  assert.deepEqual(calls, []);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "sci" && omission.detail.includes("symlink"),
    ),
  );
  assert.doesNotMatch(JSON.stringify(result.packet), /OUTSIDE SECRET|should not run/);
});

test("context_pack refuses repoRoot SCI artifacts from package cwd", async () => {
  const root = await makeWorkspace();
  const packageCwd = join(root, "packages", "pkg");
  await writeGitMarker(root);
  await mkdir(join(root, ".ontology"), { recursive: true });
  await mkdir(join(packageCwd, "src"), { recursive: true });
  await writeFile(
    join(packageCwd, "src", "example.js"),
    "export const packageTarget = 1;\n",
    "utf8",
  );
  const calls = [];
  const fakeExec = async () => {
    calls.push("called");
    return { stdout: sciStdout({ content: "should not run" }) };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: packageCwd,
      repoRoot: root,
      seeds: [{ kind: "path", value: "src/example.js" }],
      providers: { agents: "off", docs: "off", git: "off", sci: "required" },
    },
    {
      cwd: packageCwd,
      sciCommand: "/tmp/fake-sci",
      execFileAsync: fakeExec,
      sciReadOnlySafe: true,
    },
  );

  assert.deepEqual(calls, []);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "sci" && omission.detail.includes("existing .ontology"),
    ),
  );
});

test("context_pack treats dangling .ontology symlinks as existing SCI artifacts", async () => {
  const root = await makeWorkspace();
  await symlink(join(root, "missing-ontology-target"), join(root, ".ontology"));
  const calls = [];
  const fakeExec = async () => {
    calls.push("called");
    return { stdout: sciStdout({ content: "should not run" }) };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "src/example.js" }],
      providers: { agents: "off", docs: "off", git: "off", sci: "required" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );

  assert.deepEqual(calls, []);
  assert.equal(
    result.packet.sections.some((section) => section.provider === "sci"),
    false,
  );
  assert.ok(
    result.packet.omissions.some(
      (omission) => omission.provider === "sci" && omission.detail.includes("existing .ontology"),
    ),
  );
});

test("context_pack runs SCI in a temporary sandbox rather than source cwd", async () => {
  const root = await makeWorkspace();
  const execCwds = [];
  const execPwds = [];
  const fakeExec = async (_command, _args, options) => {
    execCwds.push(options.cwd);
    execPwds.push(options.env.PWD);
    await mkdir(join(options.cwd, ".ontology"));
    await rm(join(options.cwd, ".ontology"), { recursive: true, force: true });
    return { stdout: sciStdout({ content: "sandbox-derived context\n" }) };
  };

  const result = await buildContextPacket(
    {
      objective: "Use code context for implementation",
      cwd: root,
      repoRoot: root,
      seeds: [{ kind: "path", value: "src/example.js" }],
      providers: { agents: "off", docs: "off", git: "off", sci: "required" },
    },
    { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
  );

  assert.equal(execCwds.length, 1);
  assert.notEqual(execCwds[0], root);
  assert.equal(execPwds[0], execCwds[0]);
  assert.equal(await pathExists(join(root, ".ontology")), false);
  const sci = result.packet.sections.find((section) => section.provider === "sci");
  assert.match(sci.items[0].content, /sandbox-derived context/);
});

test("context_pack does not resolve default SCI commands through ambient PATH", async () => {
  const root = await makeWorkspace();
  const bin = await mkdtemp(join(tmpdir(), "pi-context-pack-sci-path-hijack-"));
  const maliciousSci = join(bin, "sci");
  const marker = join(root, "MUTATED_BY_PATH_HIJACK.txt");
  await writeFile(maliciousSci, "#!/bin/sh\necho malicious\n", "utf8");
  await chmod(maliciousSci, 0o755);

  await withProcessEnv(
    {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      SCI_CLI: undefined,
      PI_CONTEXT_PACKER_SCI_CLI: undefined,
      PI_CONTEXT_PACKER_TRUST_CUSTOM_SCI_CLI: undefined,
    },
    async () => {
      const calls = [];
      const fakeExec = async (command) => {
        calls.push(command);
        if (command === "sci" || command === maliciousSci) {
          await writeFile(marker, "mutation\n", "utf8");
          return { stdout: sciStdout({ content: "PATH HIJACK CONTENT\n" }) };
        }
        throw new Error(`default SCI unavailable at ${command}`);
      };

      const result = await buildContextPacket(
        {
          objective: "Use code context for implementation",
          cwd: root,
          repoRoot: root,
          seeds: [{ kind: "path", value: "src/example.js" }],
          providers: { agents: "off", docs: "off", git: "off", sci: "required" },
        },
        { execFileAsync: fakeExec, sciReadOnlySafe: true },
      );

      assert.equal(calls.includes("sci"), false);
      assert.equal(calls.includes(maliciousSci), false);
      assert.equal(await pathExists(marker), false);
      assert.equal(
        result.packet.sections.some((section) => section.provider === "sci"),
        false,
      );
      assert.doesNotMatch(JSON.stringify(result.packet), /PATH HIJACK CONTENT|MUTATED_BY_PATH/);
    },
  );
});

test("context_pack ignores untrusted process-level SCI_CLI overrides without leaking paths", async () => {
  await withProcessEnv(
    {
      SCI_CLI: "/tmp/malicious-sci-cli",
      PI_CONTEXT_PACKER_TRUST_CUSTOM_SCI_CLI: undefined,
    },
    async () => {
      const root = await makeWorkspace();
      const marker = join(root, "MUTATED.txt");
      const calls = [];
      const fakeExec = async (command) => {
        calls.push(command);
        if (command === "/tmp/malicious-sci-cli") {
          await writeFile(marker, "mutation\n", "utf8");
          return { stdout: sciStdout({ content: "MALICIOUS CONTENT\n" }) };
        }
        throw new Error(`missing default SCI command ${command}`);
      };

      const result = await buildContextPacket(
        {
          objective: "Use code context for implementation",
          cwd: root,
          repoRoot: root,
          seeds: [{ kind: "path", value: "src/example.js" }],
          providers: { agents: "off", docs: "off", git: "off", sci: "required" },
        },
        { execFileAsync: fakeExec, sciReadOnlySafe: true },
      );

      assert.equal(calls.includes("/tmp/malicious-sci-cli"), false);
      assert.equal(await pathExists(marker), false);
      assert.equal(
        result.packet.sections.some((section) => section.provider === "sci"),
        false,
      );
      assert.ok(
        result.packet.omissions.some(
          (omission) =>
            omission.provider === "sci" && omission.detail.includes("SCI_CLI override ignored"),
        ),
      );
      assert.doesNotMatch(JSON.stringify(result.packet), /malicious-sci-cli|MALICIOUS CONTENT/);
    },
  );
});

test("context_pack ignores untrusted process-level PI_CONTEXT_PACKER_SCI_CLI overrides", async () => {
  await withProcessEnv(
    {
      PI_CONTEXT_PACKER_SCI_CLI: "/tmp/malicious-context-packer-sci-cli",
      PI_CONTEXT_PACKER_TRUST_CUSTOM_SCI_CLI: undefined,
    },
    async () => {
      const root = await makeWorkspace();
      const calls = [];
      const fakeExec = async (command) => {
        calls.push(command);
        if (command === "/tmp/malicious-context-packer-sci-cli") {
          throw new Error("override should not run");
        }
        throw new Error("default SCI unavailable");
      };

      const result = await buildContextPacket(
        {
          objective: "Use code context for implementation",
          cwd: root,
          repoRoot: root,
          seeds: [{ kind: "path", value: "src/example.js" }],
          providers: { agents: "off", docs: "off", git: "off", sci: "required" },
        },
        { execFileAsync: fakeExec, sciReadOnlySafe: true },
      );

      assert.equal(calls.includes("/tmp/malicious-context-packer-sci-cli"), false);
      assert.ok(
        result.packet.omissions.some(
          (omission) =>
            omission.provider === "sci" &&
            omission.detail.includes("PI_CONTEXT_PACKER_SCI_CLI override ignored"),
        ),
      );
      assert.doesNotMatch(JSON.stringify(result.packet), /malicious-context-packer-sci-cli/);
    },
  );
});

test("context_pack allows explicitly trusted process-level SCI CLI override", async () => {
  await withProcessEnv(
    {
      SCI_CLI: "/tmp/trusted-sci-cli",
      PI_CONTEXT_PACKER_SCI_CLI: undefined,
      PI_CONTEXT_PACKER_TRUST_CUSTOM_SCI_CLI: "1",
    },
    async () => {
      const root = await makeWorkspace();
      const calls = [];
      const fakeExec = async (command) => {
        calls.push(command);
        assert.equal(command, "/tmp/trusted-sci-cli");
        return { stdout: sciStdout({ content: "trusted override context\n" }) };
      };

      const result = await buildContextPacket(
        {
          objective: "Use code context for implementation",
          cwd: root,
          repoRoot: root,
          seeds: [{ kind: "path", value: "src/example.js" }],
          providers: { agents: "off", docs: "off", git: "off", sci: "required" },
        },
        { execFileAsync: fakeExec, sciReadOnlySafe: true },
      );

      assert.deepEqual(calls, ["/tmp/trusted-sci-cli"]);
      const sci = result.packet.sections.find((section) => section.provider === "sci");
      assert.match(sci.items[0].content, /trusted override context/);
      assert.equal(
        result.packet.omissions.some((omission) => omission.detail.includes("override ignored")),
        false,
      );
    },
  );
});

test("context_pack scrubs SCI subprocess environment", async () => {
  await withProcessEnv(
    {
      SECRET_TOKEN: "super-secret",
      API_KEY: "secret-api-key",
      SCI_ALLOW_ARTIFACTS: "1",
      SCI_CLI: "/tmp/untrusted-sci-cli",
      PI_CONTEXT_PACKER_SCI_ARTIFACT_BYPASS: "1",
      PI_CONTEXT_PACKER_TRUST_CUSTOM_SCI_CLI: undefined,
    },
    async () => {
      const root = await makeWorkspace();
      const seenEnvs = [];
      const fakeExec = async (_command, _args, options) => {
        seenEnvs.push(options.env);
        return { stdout: sciStdout({ content: "env-safe context\n" }) };
      };

      const result = await buildContextPacket(
        {
          objective: "Use code context for implementation",
          cwd: root,
          repoRoot: root,
          seeds: [{ kind: "path", value: "src/example.js" }],
          providers: { agents: "off", docs: "off", git: "off", sci: "required" },
        },
        { sciCommand: "/tmp/fake-sci", execFileAsync: fakeExec, sciReadOnlySafe: true },
      );

      assert.equal(seenEnvs.length, 1);
      assert.equal(seenEnvs[0].PWD, seenEnvs[0].INIT_CWD);
      assert.notEqual(seenEnvs[0].PWD, root);
      assert.equal(seenEnvs[0].PATH, "/usr/local/bin:/usr/bin:/bin");
      assert.equal(seenEnvs[0].SILENT_MODE, "true");
      assert.equal(seenEnvs[0].STDIO_MODE, "true");
      assert.equal(seenEnvs[0].SECRET_TOKEN, undefined);
      assert.equal(seenEnvs[0].API_KEY, undefined);
      assert.equal(seenEnvs[0].SCI_ALLOW_ARTIFACTS, undefined);
      assert.equal(seenEnvs[0].SCI_CLI, undefined);
      assert.equal(seenEnvs[0].PI_CONTEXT_PACKER_SCI_ARTIFACT_BYPASS, undefined);
      assert.doesNotMatch(seenEnvs[0].PATH, /untrusted-sci-cli/);
      const sci = result.packet.sections.find((section) => section.provider === "sci");
      assert.match(sci.items[0].content, /env-safe context/);
      assert.doesNotMatch(JSON.stringify(result.packet), /super-secret|secret-api-key/);
    },
  );
});
