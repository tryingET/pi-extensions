// ---
// summary: "Validates one pi.release-evidence.v1 closure and plans or records bounded Agent Kernel custody evidence."
// read_when:
//   - "Changing release evidence custody, AK handoff, digest verification, or authority ceilings."
// ---

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildAkEvidenceRecordArgs,
  type EvidenceEntry,
  type EvidenceWriteResult,
  type RecordEvidenceConfig,
  recordEvidence,
} from "./evidence.ts";

export const RELEASE_EVIDENCE_AK_ADAPTER_KIND =
  "pi-society-orchestrator.release_evidence_ak_adapter.v1" as const;
export const RELEASE_EVIDENCE_SCHEMA = "pi.release-evidence.v1" as const;
export const RELEASE_ARTIFACT_SCHEMA = "pi.release-artifact.v1" as const;

export type ReleaseEvidenceAkAction = "plan" | "record";

interface FileRecord {
  relativePath: string;
  sha256: string;
  size: number;
}

interface LocalArtifactRecord extends FileRecord {
  name: string;
  version: string;
}

interface ReleaseEvidenceManifest {
  schema: typeof RELEASE_EVIDENCE_SCHEMA;
  producer: string;
  subject: FileRecord & { name: string; version: string };
  source: { tag: string; commit: string; sourceDateEpoch: number };
  artifactManifest: FileRecord;
  sbom: FileRecord & {
    format: "SPDX-2.3";
    mode: "tagged-package-lock" | "packed-manifest-declarations";
    sourcePackageLock: { repositoryPath: string; sha256: string } | null;
  };
  localArtifacts: LocalArtifactRecord[];
  toolchain: { npm: string; script: string };
  boundaries: { claims: string[]; nonclaims: string[] };
}

interface ReleaseArtifactManifest {
  schema: typeof RELEASE_ARTIFACT_SCHEMA;
  package: { name: string; version: string; component: string | null };
  source: { tag: string | null; commit: string | null };
  artifact: { relativePath?: string; basename?: string; sha256: string; size: number };
  dependencies: { localArtifacts: LocalArtifactRecord[] };
}

export interface BuildReleaseEvidenceAkAdapterInput {
  evidencePath: string;
  artifactRef: string;
  repoRoot: string;
  taskId?: number;
  action?: ReleaseEvidenceAkAction;
  signal?: AbortSignal;
  akConfig?: Omit<RecordEvidenceConfig, "cwd">;
  recordEvidenceFn?: typeof recordEvidence;
}

export interface ReleaseEvidenceAkAdapterResult {
  kind: typeof RELEASE_EVIDENCE_AK_ADAPTER_KIND;
  action: ReleaseEvidenceAkAction;
  status: "planned" | "recorded";
  evidence: {
    fileName: string;
    sha256: string;
    schema: typeof RELEASE_EVIDENCE_SCHEMA;
    artifactRef: string;
  };
  subject: {
    packageName: string;
    version: string;
    releaseTag: string;
    sourceCommit: string;
    sha256: string;
  };
  akEvidenceEntry: EvidenceEntry;
  akArgs: string[];
  writeResult: EvidenceWriteResult | null;
  effect: {
    akCalled: boolean;
    sourceMutated: false;
    releaseMutated: false;
    authorityPromoted: false;
  };
  boundary: string;
}

const MAX_JSON_BYTES = 1_048_576;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const BOUNDARY =
  "The adapter verifies one canonical pi.release-evidence.v1 closure and may explicitly record custody metadata in Agent Kernel. It does not publish, mutate release assets, verify vulnerability absence or semantic correctness, establish compliance, or promote evidence into decision or doctrine authority.";
const AUTHORITY_CEILING =
  "pass records canonical schema, identity, path, size, and digest verification for the retained release evidence closure only; it does not establish package safety, semantic correctness, vulnerability absence, compliance, adoption, or promotion readiness";

export async function buildReleaseEvidenceAkAdapterResult(
  input: BuildReleaseEvidenceAkAdapterInput,
): Promise<ReleaseEvidenceAkAdapterResult> {
  const action = normalizeAction(input.action ?? "plan");
  const artifactRef = boundedText(input.artifactRef, "artifactRef", 1_000);
  const repoRoot = existingDirectory(input.repoRoot, "repoRoot");
  const taskId = optionalTaskId(input.taskId);
  const evidenceFile = readCanonicalJson(input.evidencePath, "release evidence manifest");
  const evidence = releaseEvidenceManifest(evidenceFile.value);
  const evidenceDir = path.dirname(evidenceFile.path);

  verifyChecksumSidecar(evidenceFile.path, evidenceFile.sha256, "release evidence manifest");
  const subjectPath = verifyFileRecord(evidenceDir, evidence.subject, "release subject");
  verifyChecksumSidecar(subjectPath, evidence.subject.sha256, "release subject");
  const artifactManifestPath = verifyFileRecord(
    evidenceDir,
    evidence.artifactManifest,
    "release artifact manifest",
  );
  const artifactManifestFile = readCanonicalJson(
    artifactManifestPath,
    "release artifact manifest",
  );
  if (artifactManifestFile.sha256 !== evidence.artifactManifest.sha256) {
    throw new Error("release artifact manifest SHA-256 differs after canonical parsing");
  }
  const artifactManifest = releaseArtifactManifest(artifactManifestFile.value);
  verifyArtifactBinding(evidence, artifactManifest);

  const sbomPath = verifyFileRecord(evidenceDir, evidence.sbom, "release SPDX SBOM");
  verifyChecksumSidecar(sbomPath, evidence.sbom.sha256, "release SPDX SBOM");
  verifySpdxBinding(readCanonicalJson(sbomPath, "release SPDX SBOM").value, evidence);

  const localArtifacts = evidence.localArtifacts.map((record) => {
    const artifactPath = verifyFileRecord(evidenceDir, record, `local artifact ${record.name}`);
    verifyChecksumSidecar(artifactPath, record.sha256, `local artifact ${record.name}`);
    return {
      name: record.name,
      version: record.version,
      sha256: record.sha256,
      size: record.size,
      fileName: path.basename(artifactPath),
    };
  });
  verifyLocalArtifactBinding(evidence.localArtifacts, artifactManifest.dependencies.localArtifacts);

  const entry: EvidenceEntry = {
    check_type: "pi-release-evidence-v1",
    result: "pass",
    ...(taskId === null ? {} : { task_id: taskId }),
    details: {
      schema: evidence.schema,
      evidence_manifest_sha256: evidenceFile.sha256,
      artifact_ref: artifactRef,
      package_name: evidence.subject.name,
      package_version: evidence.subject.version,
      release_tag: evidence.source.tag,
      source_commit: evidence.source.commit,
      source_date_epoch: evidence.source.sourceDateEpoch,
      subject_sha256: evidence.subject.sha256,
      subject_size: evidence.subject.size,
      artifact_manifest_sha256: evidence.artifactManifest.sha256,
      sbom: {
        format: evidence.sbom.format,
        mode: evidence.sbom.mode,
        sha256: evidence.sbom.sha256,
        source_package_lock: evidence.sbom.sourcePackageLock,
      },
      local_artifacts: localArtifacts,
      producer: evidence.producer,
      toolchain: evidence.toolchain,
      claims: evidence.boundaries.claims,
      nonclaims: evidence.boundaries.nonclaims,
      authority_ceiling: AUTHORITY_CEILING,
    },
  };
  const akArgs = buildAkEvidenceRecordArgs(entry);

  let writeResult: EvidenceWriteResult | null = null;
  if (action === "record") {
    if (!input.akConfig) {
      throw new Error("akConfig is required when action is record");
    }
    writeResult = await (input.recordEvidenceFn ?? recordEvidence)(entry, input.signal, {
      ...input.akConfig,
      cwd: repoRoot,
    });
    if (!writeResult.ok) {
      throw new Error(`Agent Kernel evidence custody failed: ${writeResult.akError ?? "unknown error"}`);
    }
  }

  return {
    kind: RELEASE_EVIDENCE_AK_ADAPTER_KIND,
    action,
    status: action === "record" ? "recorded" : "planned",
    evidence: {
      fileName: path.basename(evidenceFile.path),
      sha256: evidenceFile.sha256,
      schema: evidence.schema,
      artifactRef,
    },
    subject: {
      packageName: evidence.subject.name,
      version: evidence.subject.version,
      releaseTag: evidence.source.tag,
      sourceCommit: evidence.source.commit,
      sha256: evidence.subject.sha256,
    },
    akEvidenceEntry: entry,
    akArgs,
    writeResult,
    effect: {
      akCalled: action === "record",
      sourceMutated: false,
      releaseMutated: false,
      authorityPromoted: false,
    },
    boundary: BOUNDARY,
  };
}

function readCanonicalJson(
  inputPath: string,
  label: string,
): { path: string; value: unknown; sha256: string } {
  const absolute = path.resolve(boundedText(inputPath, label, 4_096));
  const before = fs.lstatSync(absolute);
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  if (before.size < 2 || before.size > MAX_JSON_BYTES) {
    throw new Error(`${label} size is outside the supported bound`);
  }
  const bytes = fs.readFileSync(absolute);
  const after = fs.lstatSync(absolute);
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs
  ) {
    throw new Error(`${label} changed while being read`);
  }
  const text = bytes.toString("utf8");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (`${JSON.stringify(value, null, 2)}\n` !== text) {
    throw new Error(`${label} must use canonical two-space JSON with one trailing newline`);
  }
  return { path: absolute, value, sha256: sha256(bytes) };
}

function verifyFileRecord(evidenceDir: string, record: FileRecord, label: string): string {
  const relative = boundedText(record.relativePath, `${label}.relativePath`, 1_000);
  if (path.isAbsolute(relative)) throw new Error(`${label} path must be relative`);
  const evidenceRoot = fs.realpathSync(evidenceDir);
  const candidate = path.resolve(evidenceRoot, relative);
  const relation = path.relative(evidenceRoot, candidate);
  if (relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error(`${label} escapes the evidence directory`);
  }
  const stat = fs.lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  const expectedSize = boundedSize(record.size, `${label}.size`);
  if (stat.size !== expectedSize) throw new Error(`${label} size differs`);
  const expectedDigest = digest(record.sha256, `${label}.sha256`);
  const actualDigest = sha256(fs.readFileSync(candidate));
  if (actualDigest !== expectedDigest) throw new Error(`${label} SHA-256 differs`);
  return candidate;
}

function verifyChecksumSidecar(filePath: string, digestValue: string, label: string): void {
  const sidecar = `${filePath}.sha256`;
  const stat = fs.lstatSync(sidecar);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`${label} checksum sidecar must be a regular non-symlink file`);
  }
  const expected = `${digest(digestValue, `${label}.sha256`)}  ${path.basename(filePath)}\n`;
  if (fs.readFileSync(sidecar, "utf8") !== expected) {
    throw new Error(`${label} checksum sidecar differs`);
  }
}

function verifyArtifactBinding(
  evidence: ReleaseEvidenceManifest,
  artifact: ReleaseArtifactManifest,
): void {
  if (artifact.package.name !== evidence.subject.name || artifact.package.version !== evidence.subject.version) {
    throw new Error("release artifact package identity differs from release evidence");
  }
  if (artifact.source.tag !== evidence.source.tag || artifact.source.commit !== evidence.source.commit) {
    throw new Error("release artifact source identity differs from release evidence");
  }
  if (artifact.artifact.sha256 !== evidence.subject.sha256 || artifact.artifact.size !== evidence.subject.size) {
    throw new Error("release artifact subject binding differs from release evidence");
  }
}

function verifyLocalArtifactBinding(
  evidenceRecords: LocalArtifactRecord[],
  artifactRecords: LocalArtifactRecord[],
): void {
  const normalize = (records: LocalArtifactRecord[]) =>
    [...records]
      .map((record) => ({
        name: record.name,
        version: record.version,
        relativePath: record.relativePath,
        sha256: record.sha256,
        size: record.size,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  if (JSON.stringify(normalize(evidenceRecords)) !== JSON.stringify(normalize(artifactRecords))) {
    throw new Error("local artifact closure differs between evidence and artifact manifests");
  }
}

function verifySpdxBinding(value: unknown, evidence: ReleaseEvidenceManifest): void {
  const spdx = object(value, "SPDX document");
  if (spdx.spdxVersion !== "SPDX-2.3") throw new Error("SPDX version must be SPDX-2.3");
  const namespace = boundedText(spdx.documentNamespace, "SPDX documentNamespace", 1_000);
  if (!namespace.endsWith(`/${evidence.subject.sha256}`)) {
    throw new Error("SPDX document namespace is not bound to the release subject digest");
  }
  if (!Array.isArray(spdx.packages)) throw new Error("SPDX packages must be an array");
  const matches = spdx.packages.filter((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const record = candidate as Record<string, unknown>;
    return record.name === evidence.subject.name && record.versionInfo === evidence.subject.version;
  });
  if (matches.length !== 1) throw new Error("SPDX must describe exactly one release subject package");
  const subject = matches[0] as Record<string, unknown>;
  if (!Array.isArray(subject.checksums)) throw new Error("SPDX release subject checksum is missing");
  const checksum = subject.checksums.find((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const record = candidate as Record<string, unknown>;
    return record.algorithm === "SHA256";
  }) as Record<string, unknown> | undefined;
  if (checksum?.checksumValue !== evidence.subject.sha256) {
    throw new Error("SPDX release subject SHA-256 differs");
  }
}

function releaseEvidenceManifest(value: unknown): ReleaseEvidenceManifest {
  const record = object(value, "release evidence manifest");
  if (record.schema !== RELEASE_EVIDENCE_SCHEMA) {
    throw new Error(`unsupported release evidence schema: ${String(record.schema)}`);
  }
  const subject = object(record.subject, "subject");
  const source = object(record.source, "source");
  const artifactManifest = object(record.artifactManifest, "artifactManifest");
  const sbom = object(record.sbom, "sbom");
  const toolchain = object(record.toolchain, "toolchain");
  const boundaries = object(record.boundaries, "boundaries");
  if (!Array.isArray(record.localArtifacts)) throw new Error("localArtifacts must be an array");
  if (record.localArtifacts.length > 128) throw new Error("localArtifacts exceeds the supported bound");
  return {
    schema: RELEASE_EVIDENCE_SCHEMA,
    producer: boundedText(record.producer, "producer", 200),
    subject: {
      name: boundedText(subject.name, "subject.name", 300),
      version: boundedText(subject.version, "subject.version", 100),
      relativePath: boundedText(subject.relativePath, "subject.relativePath", 1_000),
      sha256: digest(subject.sha256, "subject.sha256"),
      size: boundedSize(subject.size, "subject.size"),
    },
    source: {
      tag: boundedText(source.tag, "source.tag", 300),
      commit: commit(source.commit, "source.commit"),
      sourceDateEpoch: boundedEpoch(source.sourceDateEpoch),
    },
    artifactManifest: fileRecord(artifactManifest, "artifactManifest"),
    sbom: {
      ...fileRecord(sbom, "sbom"),
      format: sbom.format === "SPDX-2.3" ? "SPDX-2.3" : invalid("sbom.format must be SPDX-2.3"),
      mode:
        sbom.mode === "tagged-package-lock" || sbom.mode === "packed-manifest-declarations"
          ? sbom.mode
          : invalid("sbom.mode is unsupported"),
      sourcePackageLock:
        sbom.sourcePackageLock === null
          ? null
          : sourcePackageLock(object(sbom.sourcePackageLock, "sbom.sourcePackageLock")),
    },
    localArtifacts: record.localArtifacts.map((candidate, index) =>
      localArtifactRecord(object(candidate, `localArtifacts[${index}]`), `localArtifacts[${index}]`),
    ),
    toolchain: {
      npm: boundedText(toolchain.npm, "toolchain.npm", 100),
      script: boundedText(toolchain.script, "toolchain.script", 500),
    },
    boundaries: {
      claims: boundedStringArray(boundaries.claims, "boundaries.claims", 64),
      nonclaims: boundedStringArray(boundaries.nonclaims, "boundaries.nonclaims", 64),
    },
  };
}

function releaseArtifactManifest(value: unknown): ReleaseArtifactManifest {
  const record = object(value, "release artifact manifest");
  if (record.schema !== RELEASE_ARTIFACT_SCHEMA) {
    throw new Error(`unsupported release artifact schema: ${String(record.schema)}`);
  }
  const packageRecord = object(record.package, "package");
  const source = object(record.source, "source");
  const artifact = object(record.artifact, "artifact");
  const dependencies = object(record.dependencies, "dependencies");
  if (!Array.isArray(dependencies.localArtifacts)) {
    throw new Error("artifact localArtifacts must be an array");
  }
  return {
    schema: RELEASE_ARTIFACT_SCHEMA,
    package: {
      name: boundedText(packageRecord.name, "package.name", 300),
      version: boundedText(packageRecord.version, "package.version", 100),
      component:
        packageRecord.component === null
          ? null
          : boundedText(packageRecord.component, "package.component", 300),
    },
    source: {
      tag: source.tag === null ? null : boundedText(source.tag, "artifact.source.tag", 300),
      commit: source.commit === null ? null : commit(source.commit, "artifact.source.commit"),
    },
    artifact: {
      relativePath:
        artifact.relativePath === undefined
          ? undefined
          : boundedText(artifact.relativePath, "artifact.relativePath", 1_000),
      basename:
        artifact.basename === undefined
          ? undefined
          : boundedText(artifact.basename, "artifact.basename", 500),
      sha256: digest(artifact.sha256, "artifact.sha256"),
      size: boundedSize(artifact.size, "artifact.size"),
    },
    dependencies: {
      localArtifacts: dependencies.localArtifacts.map((candidate, index) =>
        localArtifactRecord(
          object(candidate, `artifact.localArtifacts[${index}]`),
          `artifact.localArtifacts[${index}]`,
        ),
      ),
    },
  };
}

function fileRecord(record: Record<string, unknown>, label: string): FileRecord {
  return {
    relativePath: boundedText(record.relativePath, `${label}.relativePath`, 1_000),
    sha256: digest(record.sha256, `${label}.sha256`),
    size: boundedSize(record.size, `${label}.size`),
  };
}

function localArtifactRecord(
  record: Record<string, unknown>,
  label: string,
): LocalArtifactRecord {
  return {
    name: boundedText(record.name, `${label}.name`, 300),
    version: boundedText(record.version, `${label}.version`, 100),
    ...fileRecord(record, label),
  };
}

function sourcePackageLock(record: Record<string, unknown>) {
  return {
    repositoryPath: boundedText(record.repositoryPath, "sourcePackageLock.repositoryPath", 1_000),
    sha256: digest(record.sha256, "sourcePackageLock.sha256"),
  };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`${label} is empty, too long, or contains control characters`);
  }
  return normalized;
}

function boundedStringArray(value: unknown, label: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${label} must be an array within the supported bound`);
  }
  return value.map((candidate, index) => boundedText(candidate, `${label}[${index}]`, 2_000));
}

function digest(value: unknown, label: string): string {
  const normalized = boundedText(value, label, 64);
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`${label} must be a lowercase SHA-256`);
  return normalized;
}

function commit(value: unknown, label: string): string {
  const normalized = boundedText(value, label, 40);
  if (!COMMIT_PATTERN.test(normalized)) throw new Error(`${label} must be a lowercase full Git commit`);
  return normalized;
}

function boundedSize(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function boundedEpoch(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("source.sourceDateEpoch must be a non-negative safe integer");
  }
  return value as number;
}

function optionalTaskId(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("taskId must be a positive safe integer");
  }
  return value;
}

function normalizeAction(value: string): ReleaseEvidenceAkAction {
  if (value === "plan" || value === "record") return value;
  throw new Error(`unsupported release evidence AK action: ${value}`);
}

function existingDirectory(value: string, label: string): string {
  const absolute = path.resolve(boundedText(value, label, 4_096));
  const real = fs.realpathSync(absolute);
  if (!fs.statSync(real).isDirectory()) {
    throw new Error(`${label} must resolve to a directory`);
  }
  return real;
}

function sha256(value: Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function invalid(message: string): never {
  throw new Error(message);
}
