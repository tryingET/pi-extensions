#!/usr/bin/env bash
set -euo pipefail

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR is required so release smoke cannot touch operator pi settings}"
: "${NPM_CONFIG_PREFIX:?NPM_CONFIG_PREFIX is required so release smoke cannot touch global npm packages}"
: "${PACKAGE_SPEC:?PACKAGE_SPEC is required; release-check.sh sets it to the packed tarball spec}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v pi >/dev/null 2>&1; then
  echo "pi CLI not found in PATH." >&2
  exit 1
fi

if [[ ! -f "$PI_CODING_AGENT_DIR/settings.json" ]]; then
  echo "Isolated pi settings missing: $PI_CODING_AGENT_DIR/settings.json" >&2
  exit 1
fi

PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
PACKAGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
GLOBAL_NODE_MODULES="$(NPM_CONFIG_PREFIX="$NPM_CONFIG_PREFIX" npm_config_prefix="$NPM_CONFIG_PREFIX" npm root -g)"
INSTALLED_PACKAGE_ROOT="$GLOBAL_NODE_MODULES/$PACKAGE_NAME"

case "$INSTALLED_PACKAGE_ROOT" in
  "$NPM_CONFIG_PREFIX"/*) ;;
  *)
    echo "Installed package root escaped isolated npm prefix: $INSTALLED_PACKAGE_ROOT" >&2
    exit 1
    ;;
esac

echo "== context-packer installed artifact smoke"
node --input-type=module - "$PI_CODING_AGENT_DIR/settings.json" "$PACKAGE_SPEC" "$INSTALLED_PACKAGE_ROOT" "$PACKAGE_NAME" "$PACKAGE_VERSION" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const [settingsPath, packageSpec, packageRoot, packageName, packageVersion] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const packages = Array.isArray(settings.packages) ? settings.packages : [];
assert.ok(
  packages.some((entry) => entry === packageSpec || entry?.source === packageSpec),
  `Missing ${packageSpec} in settings.packages`,
);

const packageJsonPath = path.join(packageRoot, "package.json");
const extensionPath = path.join(packageRoot, "extensions", "context-pack.ts");
assert.ok(fs.existsSync(packageJsonPath), `Installed package.json missing: ${packageJsonPath}`);
assert.ok(fs.existsSync(extensionPath), `Installed extension missing: ${extensionPath}`);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
assert.equal(pkg.name, packageName, "Installed package name mismatch");
assert.equal(pkg.version, packageVersion, "Installed package version mismatch");
assert.ok(
  pkg.pi?.extensions?.includes("./extensions/context-pack.ts"),
  "Installed package missing ./extensions/context-pack.ts in pi.extensions",
);

for (const requiredPath of ["src/context-plan.js", "src/context-pack.js", "src/dogfood-observation.js"]) {
  assert.ok(fs.existsSync(path.join(packageRoot, requiredPath)), `Installed package missing ${requiredPath}`);
}
console.log("installed artifact OK");
NODE

SMOKE_DIR=""
cleanup() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" && -n "$SMOKE_DIR" && -d "$SMOKE_DIR" ]]; then
    rm -rf "$SMOKE_DIR"
  fi
}
trap cleanup EXIT

SMOKE_DIR="$(mktemp -d /tmp/pi-context-packer-release-smoke-XXXXXX)"
SMOKE_EXTENSION="$SMOKE_DIR/assert-context-packer-release-smoke.ts"
SMOKE_OUTPUT="$SMOKE_DIR/pi-smoke.out"

cat > "$SMOKE_EXTENSION" <<'EOF'
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export default function(pi) {
  pi.registerCommand("assert_context_packer_release_smoke", {
    description: "Assert installed context-packer extension registration and core execution",
    handler: async () => {
      const tools = new Map(pi.getAllTools().map((tool) => [tool.name, tool]));
      const commands = new Map(pi.getCommands().map((command) => [command.name, command]));
      const expectedTools = [
        "context_plan",
        "context_pack",
        "context_dogfood_evaluate",
        "context_dogfood_summarize",
      ];

      for (const name of expectedTools) {
        const tool = tools.get(name);
        if (!tool) throw new Error(`${name} tool not registered`);
        if (tool.sourceInfo?.source === "builtin" || tool.sourceInfo?.source === "sdk") {
          throw new Error(`${name} registered from unexpected source: ${tool.sourceInfo?.source}`);
        }
        if (!tool.description || !tool.parameters) {
          throw new Error(`${name} missing description or parameters`);
        }
      }

      const command = commands.get("context-pack");
      if (!command) throw new Error("context-pack command not registered");
      if (command.source !== "extension") {
        throw new Error(`context-pack command registered from unexpected source: ${command.source}`);
      }

      const installedPackageRoot = process.env.INSTALLED_PACKAGE_ROOT;
      if (!installedPackageRoot) throw new Error("INSTALLED_PACKAGE_ROOT is required");
      const { buildContextPlan } = await import(
        pathToFileURL(join(installedPackageRoot, "src", "context-plan.js")).href
      );
      const { contextPacketToolResult } = await import(
        pathToFileURL(join(installedPackageRoot, "src", "context-pack.js")).href
      );
      const { buildDogfoodObservationEvaluation } = await import(
        pathToFileURL(join(installedPackageRoot, "src", "dogfood-observation.js")).href
      );

      const workspace = await mkdtemp(join(tmpdir(), "pi-context-packer-runtime-tool-smoke-"));
      try {
        await mkdir(join(workspace, "docs", "project"), { recursive: true });
        await writeFile(join(workspace, "AGENTS.md"), "# Runtime AGENTS\n\nRead-only smoke.\n", "utf8");
        await writeFile(
          join(workspace, "docs", "project", "smoke.md"),
          "# Runtime Smoke\n\nInstalled context_pack can read seeded Markdown.\n",
          "utf8",
        );
        const docsListScript = join(workspace, "docs-list-json-smoke.mjs");
        await writeFile(
          docsListScript,
          [
            "const payload = {",
            "  ok: true,",
            "  rankedItems: [{ repoPath: 'docs/project/smoke.md' }],",
            "};",
            "console.log(JSON.stringify(payload));",
          ].join("\n"),
          "utf8",
        );
        const env = {
          cwd: workspace,
          systemPrompt: "",
          contextUsage: { usedTokens: 0, maxTokens: 100000 },
          docsListScript,
        };
        const baseParams = {
          objective: "Installed runtime smoke for context-packer tools",
          cwd: workspace,
          repoRoot: workspace,
          providers: { agents: "required", docs: "required", git: "off", sci: "off", session: "off" },
        };

        const planResult = buildContextPlan(baseParams, env);
        if (!planResult.ok) {
          throw new Error(`context_plan execution failed: ${JSON.stringify(planResult.errors)}`);
        }

        const packResult = await contextPacketToolResult(
          {
            ...baseParams,
            seeds: [{ kind: "path", value: "docs/project/smoke.md" }],
          },
          env,
        );
        if (!packResult.details?.ok) {
          throw new Error(`context_pack execution failed: ${JSON.stringify(packResult.details)}`);
        }
        const packText = packResult.content?.[0]?.text ?? "";
        if (!packText.includes("Runtime Smoke")) {
          throw new Error("context_pack execution did not include seeded Markdown packet content");
        }
        const serializedPackDetails = JSON.stringify(packResult.details);
        if (!packResult.details?.redaction?.rawItemContentOmitted) {
          throw new Error("context_pack compact details did not report raw item content redaction");
        }
        if (serializedPackDetails.includes("Installed context_pack can read seeded Markdown")) {
          throw new Error("context_pack compact details exposed raw selected item content");
        }

        const discoveredPackResult = await contextPacketToolResult(baseParams, env);
        if (!discoveredPackResult.details?.ok) {
          throw new Error(
            `context_pack docs-list discovery execution failed: ${JSON.stringify(discoveredPackResult.details)}`,
          );
        }
        const discoveredPackText = discoveredPackResult.content?.[0]?.text ?? "";
        if (!discoveredPackText.includes("Runtime Smoke")) {
          throw new Error("context_pack docs-list discovery did not include ranked Markdown content");
        }

        const evaluationResult = buildDogfoodObservationEvaluation({
          observation: {
            kind: "context_pack_dogfood_observation_v1",
            prediction: {
              expectedLowLevelCallsAvoided: 1,
              packetUtilityRecommendationStatus: "use_packet",
            },
            observation: {
              actualLowLevelReadSearchStatusCalls: 0,
              actualLowLevelCallsAvoided: 1,
              validationCommandsRun: 0,
              duplicateReadsObserved: false,
              omissionFollowupsUsed: [],
              recommendationMatchedOutcome: true,
              notes: "installed runtime release smoke",
            },
          },
        });
        if (evaluationResult.status !== "matched" || evaluationResult.validationCommandsRun !== 0) {
          throw new Error(
            `context_dogfood_evaluate execution failed: ${JSON.stringify(evaluationResult)}`,
          );
        }
      } finally {
        await rm(workspace, { recursive: true, force: true });
      }

      console.log("context-packer runtime registration and installed core execution OK");
    },
  });
}
EOF

echo "== context-packer installed runtime registration and core execution smoke"
PI_CODING_AGENT_DIR="$PI_CODING_AGENT_DIR" INSTALLED_PACKAGE_ROOT="$INSTALLED_PACKAGE_ROOT" \
  pi --offline --no-session --no-builtin-tools --no-skills --no-prompt-templates --no-context-files --no-themes \
  -e "$INSTALLED_PACKAGE_ROOT" \
  -e "$SMOKE_EXTENSION" \
  -p "/assert_context_packer_release_smoke" >"$SMOKE_OUTPUT" 2>&1
cat "$SMOKE_OUTPUT"

if ! grep -q "context-packer runtime registration and installed core execution OK" "$SMOKE_OUTPUT"; then
  echo "Runtime registration/installed core execution smoke did not report success." >&2
  exit 1
fi

echo "release smoke done: installed $PACKAGE_NAME@$PACKAGE_VERSION from $PACKAGE_SPEC and verified context-packer command/tool registration plus installed core execution through Pi runtime."
