import fs from "node:fs";
import path from "node:path";
import {
  KES_CONTRACT_VERSION,
  KES_DIARY_DIR,
  KES_LEARNINGS_DIR,
  KES_PACKAGE_NAME,
  type KesArtifactDraft,
  type KesArtifactPlan,
  type KesArtifactRequest,
  type KesDiaryEntryInput,
  type KesLearningCandidateInput,
  type KesRoots,
} from "./types.ts";

export function resolveKesRoots(packageRoot: string): KesRoots {
  const normalizedRoot = path.resolve(packageRoot);
  return {
    packageRoot: normalizedRoot,
    diaryDir: path.join(normalizedRoot, KES_DIARY_DIR),
    learningsDir: path.join(normalizedRoot, KES_LEARNINGS_DIR),
    diaryRelativeDir: KES_DIARY_DIR,
    learningsRelativeDir: KES_LEARNINGS_DIR,
  };
}

export function ensureKesRoots(packageRoot: string): KesRoots {
  const roots = resolveKesRoots(packageRoot);
  fs.mkdirSync(roots.diaryDir, { recursive: true });
  fs.mkdirSync(roots.learningsDir, { recursive: true });
  return roots;
}

export function createKesArtifactPlan(
  packageRoot: string,
  request: KesArtifactRequest,
): KesArtifactPlan {
  validateDiaryInput(request.diary);
  if (request.learningCandidate) {
    validateLearningCandidateInput(request.learningCandidate);
  }

  const roots = resolveKesRoots(packageRoot);
  const diary = createDiaryDraft(roots, request.diary);
  const learningCandidate = request.learningCandidate
    ? createLearningCandidateDraft(
        roots,
        request.diary,
        request.learningCandidate,
        diary.relativePath,
      )
    : undefined;

  return {
    version: KES_CONTRACT_VERSION,
    roots,
    diary,
    learningCandidate,
  };
}

export function materializeKesArtifactPlan(plan: KesArtifactPlan): KesArtifactPlan {
  const roots = ensureKesRoots(plan.roots.packageRoot);
  writeDraft(plan.diary, roots);
  if (plan.learningCandidate) {
    writeDraft(plan.learningCandidate, roots);
  }
  return { ...plan, roots };
}

function createDiaryDraft(roots: KesRoots, diary: KesDiaryEntryInput): KesArtifactDraft {
  const dateStamp = formatDateStamp(diary.timestamp ?? new Date());
  const fileStem = [diary.kind, diary.source.loop, diary.source.phase, diary.summary]
    .filter((value): value is string => Boolean(value))
    .map((value) => slugify(value, 40))
    .filter(Boolean)
    .join("-");
  const fileName = `${dateStamp}--${fileStem || "entry"}.md`;
  const relativePath = allocateAvailableRelativePath(
    roots.packageRoot,
    path.join(roots.diaryRelativeDir, fileName),
  );

  return {
    kind: "diary",
    relativePath,
    absolutePath: resolveBoundedArtifactPath(roots, relativePath),
    title: `KES Diary: ${normalizeInline(diary.summary)}`,
    content: renderDiaryContent(dateStamp, diary),
    metadata: {
      kes_contract_version: KES_CONTRACT_VERSION,
      kes_package: diary.source.packageName || KES_PACKAGE_NAME,
      diary_kind: diary.kind,
      source: diary.source,
    },
  };
}

function createLearningCandidateDraft(
  roots: KesRoots,
  diary: KesDiaryEntryInput,
  learningCandidate: KesLearningCandidateInput,
  sourceDiaryRelativePath: string,
): KesArtifactDraft {
  const dateStamp = formatDateStamp(diary.timestamp ?? new Date());
  const fileStem = [learningCandidate.kind, learningCandidate.summary]
    .map((value) => slugify(value, 48))
    .filter(Boolean)
    .join("-");
  const fileName = `${dateStamp}--${fileStem || "candidate"}.md`;
  const relativePath = allocateAvailableRelativePath(
    roots.packageRoot,
    path.join(roots.learningsRelativeDir, fileName),
  );

  return {
    kind: "learning_candidate",
    relativePath,
    absolutePath: resolveBoundedArtifactPath(roots, relativePath),
    title: `KES Learning Candidate: ${normalizeInline(learningCandidate.summary)}`,
    content: renderLearningCandidateContent(
      dateStamp,
      diary,
      learningCandidate,
      sourceDiaryRelativePath,
    ),
    metadata: {
      kes_contract_version: KES_CONTRACT_VERSION,
      kes_package: diary.source.packageName || KES_PACKAGE_NAME,
      learning_kind: learningCandidate.kind,
      source: diary.source,
      source_diary: sourceDiaryRelativePath,
    },
  };
}

function writeDraft(draft: KesArtifactDraft, roots: KesRoots): void {
  const absolutePath = resolveBoundedArtifactPath(roots, draft.relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, draft.content, "utf8");
}

function renderDiaryContent(dateStamp: string, diary: KesDiaryEntryInput): string {
  const sourceLines = [
    `- Package: ${diary.source.packageName || KES_PACKAGE_NAME}`,
    `- Source kind: ${diary.source.kind}`,
    diary.source.loop ? `- Loop: ${diary.source.loop}` : null,
    diary.source.phase ? `- Phase: ${diary.source.phase}` : null,
    diary.source.sessionId ? `- Session: ${diary.source.sessionId}` : null,
    `- Objective: ${diary.source.objective}`,
    `- Entry kind: ${diary.kind}`,
  ].filter((value): value is string => value !== null);

  return `${renderFrontmatter({
    summary: `KES diary capture for ${normalizeInline(diary.summary)}`,
    readWhen: `Reviewing raw package-local KES capture for ${diary.kind}.`,
    system4d: {
      container: "Package-local KES diary entry.",
      compass: "Preserve raw orchestration memory before any learning promotion.",
      engine: "Capture context -> actions -> surprises -> patterns -> candidate hints.",
      fog: "The main risk is treating a raw capture as a canonical learning before the evidence stays bounded.",
    },
    extras: {
      kes_contract_version: KES_CONTRACT_VERSION,
      kes_kind: "diary",
      kes_package: diary.source.packageName || KES_PACKAGE_NAME,
    },
  })}
# ${dateStamp} — KES Diary: ${normalizeInline(diary.summary)}

## Source
${sourceLines.join("\n")}

## What I Did
${renderBulletList(diary.actions, "No actions recorded.")}

## What Surprised Me
${renderBulletList(diary.surprises, "No surprises recorded.")}

## Patterns
${renderBulletList(diary.patterns, "No stable patterns recorded yet.")}

## Crystallization Candidates
${renderBulletList(diary.candidateHints, "No promotion candidates recorded yet.")}

## Follow-up
${renderBulletList(diary.followUps, "No follow-up recorded.")}

## Metadata
\`\`\`json
${JSON.stringify(
  {
    kes_contract_version: KES_CONTRACT_VERSION,
    package: diary.source.packageName || KES_PACKAGE_NAME,
    source: diary.source,
    metadata: diary.metadata || {},
  },
  null,
  2,
)}
\`\`\`
`;
}

function renderLearningCandidateContent(
  dateStamp: string,
  diary: KesDiaryEntryInput,
  learningCandidate: KesLearningCandidateInput,
  sourceDiaryRelativePath: string,
): string {
  const sourceLines = [
    `- Package: ${diary.source.packageName || KES_PACKAGE_NAME}`,
    `- Source diary: \`${sourceDiaryRelativePath}\``,
    `- Source kind: ${diary.source.kind}`,
    diary.source.loop ? `- Loop: ${diary.source.loop}` : null,
    diary.source.phase ? `- Phase: ${diary.source.phase}` : null,
    diary.source.sessionId ? `- Session: ${diary.source.sessionId}` : null,
    `- Objective: ${diary.source.objective}`,
  ].filter((value): value is string => value !== null);

  return `${renderFrontmatter({
    summary: `KES learning candidate for ${normalizeInline(learningCandidate.summary)}`,
    readWhen: "Reviewing a package-owned learning candidate before promotion.",
    system4d: {
      container: "Package-local KES learning candidate.",
      compass:
        "Bound promotion from raw capture into a durable candidate without inventing a second authority surface.",
      engine:
        "Tie the claim to raw evidence -> state reusable heuristics -> capture follow-up and anti-patterns.",
      fog: "The main risk is promoting pattern language without attributable package-local evidence.",
    },
    extras: {
      kes_contract_version: KES_CONTRACT_VERSION,
      kes_kind: "learning_candidate",
      kes_package: diary.source.packageName || KES_PACKAGE_NAME,
    },
  })}
# ${dateStamp} — KES Learning Candidate: ${normalizeInline(learningCandidate.summary)}

## Status
- State: candidate-only
- Candidate kind: ${learningCandidate.kind}

## Source
${sourceLines.join("\n")}

## Claim
${learningCandidate.claim.trim()}

## Evidence
${renderBulletList(learningCandidate.evidence, "No supporting evidence recorded.")}

## Reusable Heuristics
${renderBulletList(learningCandidate.heuristics, "No reusable heuristics recorded yet.")}

## Anti-patterns to Avoid
${renderBulletList(learningCandidate.antiPatterns, "No anti-patterns recorded yet.")}

## Follow-up
${renderBulletList(learningCandidate.followUps, "No follow-up recorded.")}

## Metadata
\`\`\`json
${JSON.stringify(
  {
    kes_contract_version: KES_CONTRACT_VERSION,
    package: diary.source.packageName || KES_PACKAGE_NAME,
    source: diary.source,
    sourceDiary: sourceDiaryRelativePath,
    metadata: learningCandidate.metadata || {},
  },
  null,
  2,
)}
\`\`\`
`;
}

function renderFrontmatter(params: {
  summary: string;
  readWhen: string;
  system4d: {
    container: string;
    compass: string;
    engine: string;
    fog: string;
  };
  extras: Record<string, string | number>;
}): string {
  const extras = Object.entries(params.extras)
    .map(([key, value]) => `${key}: ${formatYamlScalar(value)}`)
    .join("\n");

  return `---
summary: ${formatYamlScalar(params.summary)}
read_when:
  - ${formatYamlScalar(params.readWhen)}
${extras}
system4d:
  container: ${formatYamlScalar(params.system4d.container)}
  compass: ${formatYamlScalar(params.system4d.compass)}
  engine: ${formatYamlScalar(params.system4d.engine)}
  fog: ${formatYamlScalar(params.system4d.fog)}
---
`;
}

function renderBulletList(values: string[] | undefined, fallback: string): string {
  if (!values || values.length === 0) {
    return `- ${fallback}`;
  }
  return values.map((value) => `- ${value.trim()}`).join("\n");
}

function validateDiaryInput(diary: KesDiaryEntryInput): void {
  if (!normalizeInline(diary.summary)) {
    throw new Error("KES diary summary is required.");
  }
  if (!normalizeInline(diary.source.objective)) {
    throw new Error("KES diary objective is required.");
  }
  if (!diary.actions || diary.actions.length === 0) {
    throw new Error("KES diary entries require at least one action.");
  }
}

function validateLearningCandidateInput(learningCandidate: KesLearningCandidateInput): void {
  if (!normalizeInline(learningCandidate.summary)) {
    throw new Error("KES learning candidate summary is required.");
  }
  if (!normalizeInline(learningCandidate.claim)) {
    throw new Error("KES learning candidate claim is required.");
  }
  if (!learningCandidate.evidence || learningCandidate.evidence.length === 0) {
    throw new Error("KES learning candidates require at least one evidence item.");
  }
}

function resolveBoundedArtifactPath(roots: KesRoots, relativePath: string): string {
  const absolutePath = path.resolve(roots.packageRoot, relativePath);
  const allowedRoots = [roots.diaryDir, roots.learningsDir];
  const isAllowed = allowedRoots.some(
    (allowedRoot) =>
      absolutePath === allowedRoot || absolutePath.startsWith(`${allowedRoot}${path.sep}`),
  );

  if (!isAllowed) {
    throw new Error(
      `KES artifact path must stay inside ${KES_DIARY_DIR}/ or ${KES_LEARNINGS_DIR}/`,
    );
  }

  return absolutePath;
}

function allocateAvailableRelativePath(packageRoot: string, relativePath: string): string {
  const extension = path.extname(relativePath) || ".md";
  const baseWithoutExtension = relativePath.slice(0, -extension.length);
  let candidate = relativePath;
  let index = 2;

  while (fs.existsSync(path.resolve(packageRoot, candidate))) {
    candidate = `${baseWithoutExtension}--${index}${extension}`;
    index += 1;
  }

  return candidate;
}

function formatDateStamp(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function slugify(value: string, maxLength: number): string {
  const slug = normalizeInline(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    return "";
  }

  return slug.slice(0, maxLength).replace(/-+$/g, "");
}

function normalizeInline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatYamlScalar(value: string | number): string {
  if (typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
}
