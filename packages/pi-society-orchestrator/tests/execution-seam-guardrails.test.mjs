import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const packageRoot = path.resolve(import.meta.dirname, "..");
const allowedAscConsumer = {
  file: "src/runtime/subagent.ts",
  specifier: "pi-autonomous-session-control/execution",
};
const allowedVaultConsumers = [
  {
    file: "src/loops/engine.ts",
    specifier: "pi-vault-client/dispatch-runtime",
  },
  {
    file: "src/runtime/cognitive-tools.ts",
    specifier: "pi-vault-client/prompt-plane",
  },
];
const allowedAutoresearchConsumers = [
  {
    file: "src/runtime/autoresearch-ak-lifecycle.ts",
    specifier: "@tryinget/pi-autoresearch/src/runtime.ts",
  },
  {
    file: "src/runtime/autoresearch-manifest-campaign-supervision.ts",
    specifier: "@tryinget/pi-autoresearch/src/runtime.ts",
  },
  {
    file: "src/runtime/autoresearch-self-hosting-supervision.ts",
    specifier: "@tryinget/pi-autoresearch/src/runtime.ts",
  },
  {
    file: "src/runtime/autoresearch-supervisor-runner.ts",
    specifier: "@tryinget/pi-autoresearch/src/runtime.ts",
  },
];
const sourceRoots = ["src", "extensions"];

function listSourceFiles() {
  const files = [];

  for (const root of sourceRoots) {
    const absoluteRoot = path.join(packageRoot, root);
    walk(absoluteRoot);
  }

  return files.sort();

  function walk(currentPath) {
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!fullPath.endsWith(".ts") && !fullPath.endsWith(".mts")) {
        continue;
      }
      files.push(path.relative(packageRoot, fullPath));
    }
  }
}

function collectImportSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?[\s\S]*?from\s*["']([^"']+)["']/g,
    /import\s*["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) {
        specifiers.add(match[1]);
      }
    }
  }

  return [...specifiers].sort();
}

test("orchestrator source consumes ASC only through the public execution seam", () => {
  const ascImports = [];

  for (const file of listSourceFiles()) {
    const source = fs.readFileSync(path.join(packageRoot, file), "utf8");
    for (const specifier of collectImportSpecifiers(source)) {
      if (specifier.includes("pi-autonomous-session-control")) {
        ascImports.push({ file, specifier });
      }
    }
  }

  assert.deepEqual(ascImports, [allowedAscConsumer]);
});

test("orchestrator source consumes pi-vault-client only through public package seams", () => {
  const vaultImports = [];

  for (const file of listSourceFiles()) {
    const source = fs.readFileSync(path.join(packageRoot, file), "utf8");
    for (const specifier of collectImportSpecifiers(source)) {
      if (specifier.includes("pi-vault-client")) {
        vaultImports.push({ file, specifier });
      }
    }
  }

  assert.deepEqual(vaultImports, allowedVaultConsumers);
});

test("subagent adapter does not revive orchestrator-local runtime internals", () => {
  const adapterSource = fs.readFileSync(path.join(packageRoot, allowedAscConsumer.file), "utf8");

  assert.match(adapterSource, /createAscExecutionRuntime\s*\(/);

  const forbiddenTokens = [
    "node:child_process",
    "spawn(",
    "spawnSync(",
    "execFile(",
    "execFileSync(",
    "fork(",
    "pi-autonomous-session-control/extensions/self",
    "../pi-autonomous-session-control/extensions/self",
    "subagent-spawn.ts",
    "subagent-session.ts",
    "subagent-session-name.ts",
    "subagent-runtime.ts",
  ];

  for (const token of forbiddenTokens) {
    assert.equal(
      adapterSource.includes(token),
      false,
      `expected ${allowedAscConsumer.file} to stay free of ${token}`,
    );
  }
});

test("vault adapters do not drift back to private pi-vault-client imports", () => {
  const forbiddenTokens = [
    "pi-vault-client/src/",
    "../pi-vault-client/src/",
    "../../pi-vault-client/src/",
    "../pi-vault-client/",
    "../../pi-vault-client/",
  ];

  for (const consumer of allowedVaultConsumers) {
    const adapterSource = fs.readFileSync(path.join(packageRoot, consumer.file), "utf8");
    for (const token of forbiddenTokens) {
      assert.equal(
        adapterSource.includes(token),
        false,
        `expected ${consumer.file} to stay free of ${token}`,
      );
    }
  }
});

test("orchestrator consumes pi-autoresearch only through the package runtime seam", () => {
  const autoresearchImports = [];

  for (const file of listSourceFiles()) {
    const source = fs.readFileSync(path.join(packageRoot, file), "utf8");
    for (const specifier of collectImportSpecifiers(source)) {
      if (specifier.includes("pi-autoresearch")) {
        autoresearchImports.push({ file, specifier });
      }
    }
  }

  assert.deepEqual(autoresearchImports, allowedAutoresearchConsumers);
});
