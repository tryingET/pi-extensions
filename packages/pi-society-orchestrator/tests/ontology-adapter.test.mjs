import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { formatOntologyConcepts, lookupOntologyConcepts } from "../src/runtime/ontology.ts";

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content);
  fs.chmodSync(filePath, 0o755);
}

function writeConceptDoc(filePath, { id, label, description }) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `---
ont:
  id: ${JSON.stringify(id)}
  type: concept
  labels: [${JSON.stringify(label)}]
  description: ${JSON.stringify(description)}
---

# ${label} (${id})

## Definition
${description}
`,
  );
}

test("lookupOntologyConcepts resolves concept ids, labels, and definitions through rocs build artifacts", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ontology-"));
  const rocsPath = path.join(tempDir, "rocs-mock.sh");
  const argsLog = path.join(tempDir, "rocs-args.log");
  const resolvePath = path.join(tempDir, "resolve.json");
  const idIndexPath = path.join(tempDir, "id_index.json");
  const companyRoot = path.join(tempDir, "company-layer");
  const coreRoot = path.join(tempDir, "core-layer");

  writeConceptDoc(path.join(companyRoot, "reference/concepts/co.software.Service.md"), {
    id: "co.software.Service",
    label: "Service",
    description: "Deployable software system component.",
  });
  writeConceptDoc(path.join(companyRoot, "reference/concepts/co.software.Incident.md"), {
    id: "co.software.Incident",
    label: "Incident",
    description: "Operational disruption with customer impact.",
  });
  writeConceptDoc(path.join(coreRoot, "reference/concepts/core.Capability.md"), {
    id: "core.Capability",
    label: "Capability",
    description: "Reusable business or technical ability.",
  });

  fs.writeFileSync(
    resolvePath,
    JSON.stringify(
      {
        layers: [
          { name: "core", src_root: coreRoot },
          { name: "company", src_root: companyRoot },
        ],
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    idIndexPath,
    JSON.stringify(
      {
        items: [
          {
            id: "co.software.Incident",
            kind: "concept",
            labels: ["Incident"],
            layer: "company",
            path_in_layer: "reference/concepts/co.software.Incident.md",
          },
          {
            id: "co.software.Service",
            kind: "concept",
            labels: ["Service"],
            layer: "company",
            path_in_layer: "reference/concepts/co.software.Service.md",
          },
          {
            id: "core.Capability",
            kind: "concept",
            labels: ["Capability"],
            layer: "core",
            path_in_layer: "reference/concepts/core.Capability.md",
          },
        ],
      },
      null,
      2,
    ),
  );

  writeExecutable(
    rocsPath,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> ${JSON.stringify(argsLog)}
printf '%s' ${JSON.stringify(
      JSON.stringify({
        dist: {
          files: {
            resolve: resolvePath,
            id_index: idIndexPath,
          },
        },
      }),
    )}
`,
  );

  try {
    const config = {
      rocsBin: rocsPath,
      ontologyRepo: "/tmp/fake-ontology-repo",
      workspaceRoot: "/tmp/fake-workspace",
      workspaceRefMode: "loose",
    };

    const byDefinition = await lookupOntologyConcepts({ search: "customer impact" }, config);
    assert.equal(byDefinition.ok, true);
    if (byDefinition.ok) {
      assert.deepEqual(
        byDefinition.value.map((entry) => entry.concept),
        ["co.software.Incident"],
      );
    }

    const byLabel = await lookupOntologyConcepts({ concept: "Service" }, config);
    assert.equal(byLabel.ok, true);
    if (byLabel.ok) {
      assert.deepEqual(
        byLabel.value.map((entry) => entry.concept),
        ["co.software.Service"],
      );
      assert.match(formatOntologyConcepts(byLabel.value), /Deployable software system component/);
      assert.match(formatOntologyConcepts(byLabel.value), /Labels: Service/);
    }

    const defaultList = await lookupOntologyConcepts({ limit: 2 }, config);
    assert.equal(defaultList.ok, true);
    if (defaultList.ok) {
      assert.deepEqual(
        defaultList.value.map((entry) => entry.concept),
        ["co.software.Incident", "co.software.Service"],
      );
    }

    const loggedArgs = fs.readFileSync(argsLog, "utf8");
    assert.match(loggedArgs, /build --repo \/tmp\/fake-ontology-repo/);
    assert.match(loggedArgs, /--resolve-refs/);
    assert.match(loggedArgs, /--workspace-root \/tmp\/fake-workspace/);
    assert.match(loggedArgs, /--workspace-ref-mode loose/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("lookupOntologyConcepts surfaces rocs json failures clearly", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ontology-failure-"));
  const rocsPath = path.join(tempDir, "rocs-fail.sh");

  writeExecutable(
    rocsPath,
    `#!/usr/bin/env bash
printf '%s' '{"ok":false,"error":{"kind":"offline-first","message":"ref layer requires network resolution"}}'
exit 1
`,
  );

  try {
    const result = await lookupOntologyConcepts(
      { search: "incident" },
      {
        rocsBin: rocsPath,
      },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /rocs offline-first: ref layer requires network resolution/);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("lookupOntologyConcepts uses async supervised rocs execution with timeout support", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-ontology-timeout-"));
  const rocsPath = path.join(tempDir, "rocs-timeout.sh");

  writeExecutable(
    rocsPath,
    `#!/usr/bin/env bash
sleep 2
printf '%s' '{"dist":{}}'
`,
  );

  try {
    let timerFired = false;
    const timer = new Promise((resolve) => {
      setTimeout(() => {
        timerFired = true;
        resolve(undefined);
      }, 20);
    });

    const resultPromise = lookupOntologyConcepts(
      { search: "incident" },
      {
        rocsBin: rocsPath,
        timeoutMs: 50,
      },
    );

    await timer;
    assert.equal(timerFired, true);

    const result = await resultPromise;
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /timed out/i);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
