import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSubagentState, spawnSubagentWithSpawn } from "../extensions/self/subagent.ts";

async function withFakePiOnPath(scriptBody, run) {
  const tempDir = await mkdtemp(join(tmpdir(), "asc-startup-noise-host-contract-"));
  const binDir = join(tempDir, "bin");
  const fakePiPath = join(binDir, "pi");
  const scenarioPath = join(binDir, "pi-scenario");
  const previousPath = process.env.PATH;
  const hostVersion = process.env.PI_HOST_VERSION || "0.80.6";

  await mkdir(binDir, { recursive: true });
  await writeFile(scenarioPath, scriptBody, { mode: 0o755 });
  await writeFile(
    fakePiPath,
    `#!/usr/bin/env bash\nif [[ "$1" == "--version" ]]; then printf '%s\\n' ${JSON.stringify(hostVersion)}; exit 0; fi\nexec ${JSON.stringify(scenarioPath)} "$@"\n`,
    { mode: 0o755 },
  );
  process.env.PATH = `${binDir}:${previousPath || ""}`;

  try {
    return await run(tempDir);
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("host contract: repeated raw stdout noise never establishes startup readiness", async () => {
  await withFakePiOnPath(
    [
      "#!/usr/bin/env bash",
      "trap '' TERM INT",
      "while true; do",
      "  printf 'startup banner\\n'",
      "  sleep 0.05",
      "done",
      "",
    ].join("\n"),
    async (tempRoot) => {
      const state = createSubagentState(join(tempRoot, "sessions"));
      const result = await spawnSubagentWithSpawn(
        {
          name: "repeated-noise-does-not-ready",
          objective: "Wait for recognized Pi readiness",
          tools: "read,bash",
          sessionFile: join(state.sessionsDir, "repeated-noise-does-not-ready.jsonl"),
          timeout: 10_000,
          startupTimeout: 3_000,
        },
        "test/model",
        { cwd: tempRoot },
        state,
      );

      assert.equal(result.status, "timeout");
      assert.equal(result.timeoutPhase, "startup");
      assert.equal(result.output, "Subagent timed out during startup after 3s");
      assert.match(result.stderr || "", /raw pi stdout noise: startup banner/);
      assert.equal(result.executionState?.transport?.timedOut, true);
    },
  );
});
