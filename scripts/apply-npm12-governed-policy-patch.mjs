import { readFileSync, rmSync, writeFileSync } from "node:fs";

function replaceOnce(filePath, before, after) {
  const content = readFileSync(filePath, "utf8");
  const first = content.indexOf(before);
  if (first < 0 || content.indexOf(before, first + 1) >= 0) {
    throw new Error(`Expected exactly one patch target in ${filePath}`);
  }
  writeFileSync(filePath, content.replace(before, after));
}

replaceOnce(
  "packages/pi-society-orchestrator/src/runtime/governed-runtime-materialization.ts",
  `  // npm >= 11.13 converts a configured \`min-release-age\` into a derived effective
  // \`before\` cutoff and erases \`min-release-age\` from every \`config get\`/\`list\`
  // surface (it reads back as \`null\`), and it hard-fails config resolution when a
  // \`before\` key coexists with \`min-release-age\` in any config or env layer. The
  // observable age proof is therefore the derived \`before\`: derive the policy days
  // from it and fail closed when it is unset or unparsable. An explicit \`before=\`
  // key must never be written into any npm config file.
  const effectiveBeforeText = npmText(nodeExecutable.realpath, npmExecutable.realpath, [
    "config",
    "get",
    "before",
  ]);
  const effectiveBeforeMs = Date.parse(effectiveBeforeText);
  if (!Number.isFinite(effectiveBeforeMs)) {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_policy_mismatch",
      "The effective npm 'before' cutoff is unset or unparsable; npm >= 11.13 derives it from min-release-age, so min-release-age (>= 7 days) must be configured without any explicit 'before' key.",
    );
  }
  const effectiveBefore = new Date(effectiveBeforeMs).toISOString();
  const minReleaseAgeDays = Math.round((observedAtMs - effectiveBeforeMs) / 86_400_000);
`,
  `  // npm keeps the declared \`min-release-age\` value in config while deriving a
  // runtime-only flat \`before\` option for install resolution. \`npm config get
  // before\` reads the raw key, not that derived flat option, so it legitimately
  // returns null when only the relative policy is configured. Prove the declared
  // relative policy directly and derive the exact cutoff used by the governed npm
  // effects. Retain an explicit-before fallback for older/operator-controlled
  // environments, but reject simultaneous raw values because their precedence is
  // easy to misread and can silently relax the intended age gate.
  const configuredMinReleaseAgeText = npmText(
    nodeExecutable.realpath,
    npmExecutable.realpath,
    ["config", "get", "min-release-age"],
  );
  const configuredMinReleaseAge =
    configuredMinReleaseAgeText && configuredMinReleaseAgeText !== "null"
      ? Number(configuredMinReleaseAgeText)
      : Number.NaN;
  const configuredBeforeText = npmText(nodeExecutable.realpath, npmExecutable.realpath, [
    "config",
    "get",
    "before",
  ]);
  const configuredBeforeMs = Date.parse(configuredBeforeText);
  let minReleaseAgeDays: number;
  let effectiveBeforeMs: number;
  if (Number.isFinite(configuredMinReleaseAge)) {
    if (configuredMinReleaseAge < 0 || Number.isFinite(configuredBeforeMs)) {
      throw new GovernedRuntimeMaterializationError(
        "materialization_npm_policy_mismatch",
        "Governed npm policy requires one non-negative min-release-age value and no simultaneous explicit before cutoff.",
      );
    }
    minReleaseAgeDays = configuredMinReleaseAge;
    effectiveBeforeMs = observedAtMs - configuredMinReleaseAge * 86_400_000;
  } else if (Number.isFinite(configuredBeforeMs)) {
    effectiveBeforeMs = configuredBeforeMs;
    minReleaseAgeDays = Math.round((observedAtMs - effectiveBeforeMs) / 86_400_000);
  } else {
    throw new GovernedRuntimeMaterializationError(
      "materialization_npm_policy_mismatch",
      "Governed npm policy requires min-release-age (preferred) or one explicit before cutoff equivalent to at least seven days.",
    );
  }
  const effectiveBefore = new Date(effectiveBeforeMs).toISOString();
`,
);

replaceOnce(
  "packages/pi-society-orchestrator/tests/governed-deep-review-preflight.test.mjs",
  `  // npm >= 11.13 derives the effective \`before\` cutoff from \`min-release-age\`
  // itself (always fresh, within the gate's 5-minute tolerance) and hard-fails
  // config resolution when an explicit \`before\` key coexists with
  // \`min-release-age\` in any config or env layer. The fixture therefore pins
  // only the declarative policy and lets npm derive the cutoff.
`,
  `  // npm derives a runtime-only flat \`before\` option from this declarative
  // relative policy. The governed proof reads min-release-age directly because
  // \`npm config get before\` exposes only a raw explicit cutoff, not the derived
  // flat option used by install resolution.
`,
);

replaceOnce(
  "packages/pi-society-orchestrator/tests/governed-deep-review-preflight.test.mjs",
  `    return run({ scratch, cacheDir });
`,
  `    return run({ scratch, cacheDir, npmrcPath });
`,
);

replaceOnce(
  "packages/pi-society-orchestrator/tests/governed-deep-review-preflight.test.mjs",
  `test("governed npm policy rejects widened or ambient release-age exclusions", () => {
`,
  `test("governed npm policy accepts one explicit-before fallback", () => {
  withGovernedNpmPolicyFixture(({ cacheDir, npmrcPath }) => {
    const before = new Date(Date.now() - 7 * 86_400_000).toISOString();
    writeFileSync(
      npmrcPath,
      \`before=\${before}\nmin-release-age-exclude[]=@tryinget/*\nregistry=https://registry.npmjs.org/\noffline=false\nprefer-offline=false\nforce=false\ncache=\${cacheDir}\n\`,
    );
    const proof = inspectGovernedRuntimeNpmPolicy();
    assert.equal(proof.minReleaseAgeDays >= 7, true);
    assert.equal(proof.effectiveBefore, before);
  });
});

test("governed npm policy rejects simultaneous relative and absolute cutoffs", () => {
  withGovernedNpmPolicyFixture(({ npmrcPath }) => {
    const before = new Date(Date.now() - 7 * 86_400_000).toISOString();
    writeFileSync(npmrcPath, \`\${readFileSync(npmrcPath, "utf8")}before=\${before}\n\`);
    assert.throws(
      () => inspectGovernedRuntimeNpmPolicy(),
      (error) => error?.failureClass === "materialization_npm_policy_mismatch",
    );
  });
});

test("governed npm policy rejects widened or ambient release-age exclusions", () => {
`,
);

replaceOnce(
  ".github/workflows/ci.yml",
  `          # npm >= 11.13 derives the effective \`before\` cutoff from
          # min-release-age itself and hard-fails when an explicit \`before\`
          # key coexists with it, so never write a \`before=\` line here.
          # \`npm config get before\` below prints the derived cutoff as the
          # live age proof (min-release-age reads back as null on npm >= 11.13).
`,
  `          # npm derives an internal install cutoff from min-release-age, but
          # \`npm config get before\` reports only an explicitly configured raw
          # key. The governed preflight therefore proves min-release-age itself
          # and derives the exact cutoff carried into every sanitized npm effect.
`,
);

replaceOnce(
  ".github/workflows/ci.yml",
  `          npm config get min-release-age-exclude
          npm config get before
`,
  `          npm config get min-release-age
          npm config get min-release-age-exclude
          npm config get before
`,
);

rmSync("scripts/apply-npm12-governed-policy-patch.mjs");
rmSync(".github/workflows/apply-npm12-governed-policy-patch.yml");
