#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_QUESTIONS_PATH = path.join(ROOT, "docs", "org", "project-docs-intake.questions.json");

function usage() {
  console.error(
    "Usage: node ./scripts/build-intake-questions-runtime.mjs --output <path> [--startup-intent <text>]",
  );
}

function parseArgs(argv) {
  let output = path.join(ROOT, "docs", "org", "project-docs-intake.runtime.questions.json");
  let startupIntent = "";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--output") {
      i += 1;
      if (i >= argv.length) {
        console.error("Missing value for --output");
        usage();
        process.exit(1);
      }
      output = argv[i];
      continue;
    }

    if (arg === "--startup-intent") {
      i += 1;
      if (i >= argv.length) {
        console.error("Missing value for --startup-intent");
        usage();
        process.exit(1);
      }
      startupIntent = argv[i];
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }

    console.error(`Unknown argument: ${arg}`);
    usage();
    process.exit(1);
  }

  return {
    output: path.resolve(ROOT, output),
    startupIntent: startupIntent.trim(),
  };
}

function inline(value, maxLen = 260) {
  const compact = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen - 1)}…`;
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function detectRepoContext() {
  const repoDir = inline(path.basename(ROOT), 120);
  const pkgPath = path.join(ROOT, "package.json");
  const readmePath = path.join(ROOT, "README.md");

  const pkg = readJsonSafe(pkgPath) ?? {};
  const packageName = inline(pkg?.name ?? "", 120);
  const packageDescription = inline(pkg?.description ?? "", 220);
  const intakeContextSeed = inline(pkg?.config?.intakeContextSeed ?? "", 500);

  let readmeTitle = "";
  let readmeSummary = "";

  if (fs.existsSync(readmePath)) {
    const raw = fs.readFileSync(readmePath, "utf8");
    const withoutFrontmatter = raw.replace(/^---\n[\s\S]*?\n---\n?/, "");

    const titleMatch = withoutFrontmatter.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      readmeTitle = inline(titleMatch[1], 120);
    }

    const blocks = withoutFrontmatter
      .replace(/^#\s+.+$/m, "")
      .split(/\n\s*\n/g)
      .map((block) => inline(block, 400))
      .filter(Boolean)
      .filter((block) => !block.startsWith("```"))
      .filter((block) => !block.startsWith("![]("))
      .filter((block) => !block.startsWith("## "));

    readmeSummary = blocks[0] ?? "";
  }

  const repoName = inline(packageName || readmeTitle || repoDir, 120);
  const contextHint = inline(
    intakeContextSeed ||
      readmeSummary ||
      packageDescription ||
      `Repository ${repoName} (folder: ${repoDir}). Use this as baseline for project-level wording.`,
    320,
  );

  return {
    repoDir,
    repoName,
    readmeTitle,
    contextHint,
    intakeContextSeed,
  };
}

function buildStartupIntentQuestion(startupIntent) {
  return {
    id: "startup_intent_confirmation",
    type: "text",
    question: `Startup intent captured: ${startupIntent}. Confirm or refine this intent before continuing.`,
  };
}

function buildRepoContextQuestion(context) {
  return {
    id: "repo_context_info",
    type: "info",
    question: "Detected repository context",
    codeBlock: {
      lang: "text",
      code: [
        `Repository directory: ${context.repoDir}`,
        `Package/repo name: ${context.repoName}`,
        `README title: ${context.readmeTitle || "<none>"}`,
        `Context hint: ${context.contextHint}`,
        `Scaffold context seed: ${context.intakeContextSeed || "<none>"}`,
      ].join("\n"),
    },
  };
}

function main() {
  const { output, startupIntent } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(SOURCE_QUESTIONS_PATH)) {
    console.error(`Missing source questions file: ${SOURCE_QUESTIONS_PATH}`);
    process.exit(1);
  }

  const source = readJsonSafe(SOURCE_QUESTIONS_PATH);
  if (!source || !Array.isArray(source.questions)) {
    console.error(`Invalid source questions file: ${SOURCE_QUESTIONS_PATH}`);
    process.exit(1);
  }

  const context = detectRepoContext();

  const runtime = {
    ...source,
    questions: [...source.questions],
  };

  runtime.questions.unshift(buildRepoContextQuestion(context));

  if (startupIntent) {
    runtime.questions.unshift(buildStartupIntentQuestion(inline(startupIntent, 1200)));
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
  process.stdout.write(`Generated runtime intake questions -> ${path.relative(ROOT, output)}\n`);
}

main();
