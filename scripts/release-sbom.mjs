#!/usr/bin/env node
/**
summary: "Generates and verifies deterministic SPDX release evidence bound to exact npm tarballs."
read_when:
  - "Changing release SBOMs, artifact attestations, retained release evidence, or dependency evidence boundaries."
*/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const ARTIFACT_SCHEMA = "pi.release-artifact.v1";
const EVIDENCE_SCHEMA = "pi.release-evidence.v1";
const SPDX_VERSION = "SPDX-2.3";
const SHA256_RE = /^[0-9a-f]{64}$/u;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_PACKAGES = 20_000;
const DECLARATION_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"];

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {};
  while (args.length > 0) {
    const flag = args.shift();
    if (!flag?.startsWith("--")) fail(`Unexpected argument: ${String(flag)}`);
    const value = args.shift();
    if (value === undefined || value.startsWith("--")) fail(`Missing value for ${flag}`);
    options[flag.slice(2)] = value;
  }
  return { command, options };
}

function requireOption(options, name) {
  const value = options[name];
  if (typeof value !== "string" || !value.trim()) fail(`Missing --${name}`);
  return value;
}

function canonicalExisting(filePath) {
  return fs.realpathSync(path.resolve(filePath));
}

function assertWithin(parent, child, label) {
  const parentReal = canonicalExisting(parent);
  const relative = path.relative(parentReal, child);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) return;
  fail(`${label} escapes ${parentReal}: ${child}`);
}

function safeReadJson(filePath, label) {
  const real = canonicalExisting(filePath);
  const stat = fs.lstatSync(real);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular file`);
  if (stat.size <= 0 || stat.size > MAX_JSON_BYTES) {
    fail(`${label} size is outside the supported range: ${stat.size}`);
  }
  try {
    return JSON.parse(fs.readFileSync(real, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function resolveRecordedPath(root, relativePath, label) {
  const value = String(relativePath ?? "");
  if (!value || path.isAbsolute(value)) fail(`${label} has an unsafe relative path`);
  const resolved = canonicalExisting(path.join(root, value));
  assertWithin(root, resolved, label);
  return resolved;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    for (;;) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed with exit ${result.status}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
  return result.stdout ?? "";
}

function packedManifest(tarballPath) {
  return JSON.parse(run("tar", ["-xOf", tarballPath, "package/package.json"]));
}

function verifyFileRecord(artifactDir, record, label) {
  if (!record || typeof record !== "object") fail(`${label} record is missing`);
  const filePath = resolveRecordedPath(
    artifactDir,
    record.relativePath ?? record.basename,
    label,
  );
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must be a regular file`);
  const expectedSha = String(record.sha256 ?? "");
  if (!SHA256_RE.test(expectedSha)) fail(`${label} has an invalid SHA-256`);
  const actualSha = sha256File(filePath);
  if (actualSha !== expectedSha) fail(`${label} SHA-256 changed: ${actualSha}`);
  if (stat.size !== record.size) fail(`${label} size changed`);
  return filePath;
}

function writeSidecar(filePath, sha256) {
  fs.writeFileSync(`${filePath}.sha256`, `${sha256}  ${path.basename(filePath)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function verifySidecar(filePath, sha256, label) {
  const expected = `${sha256}  ${path.basename(filePath)}\n`;
  const actual = fs.readFileSync(`${filePath}.sha256`, "utf8");
  if (actual !== expected) fail(`${label} checksum sidecar does not match`);
}

function writeEnv(envFile, pairs) {
  if (!envFile) return;
  const text = `${Object.entries(pairs)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\n")}\n`;
  fs.appendFileSync(path.resolve(envFile), text, "utf8");
}

function spdxId(name, version, discriminator = "") {
  const readable = `${name}-${version}`
    .replace(/^@/u, "")
    .replace(/[^A-Za-z0-9.-]+/gu, ".")
    .replace(/^\.+|\.+$/gu, "") || "package";
  return `SPDXRef-Package-${readable}-${sha256Text(`${name}\0${version}\0${discriminator}`).slice(0, 12)}`;
}

function integrityChecksum(integrity) {
  if (typeof integrity !== "string") return null;
  const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/u.exec(integrity);
  if (!match) return null;
  return {
    algorithm: match[1].toUpperCase(),
    checksumValue: Buffer.from(match[2], "base64").toString("hex"),
  };
}

function purl(name, version) {
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function exactPackage(record, filePath, purpose = "LIBRARY") {
  return {
    name: record.name,
    SPDXID: spdxId(record.name, record.version, record.relativePath ?? filePath),
    versionInfo: record.version,
    packageFileName: path.basename(filePath),
    primaryPackagePurpose: purpose,
    downloadLocation: "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    licenseDeclared: "NOASSERTION",
    copyrightText: "NOASSERTION",
    checksums: [{ algorithm: "SHA256", checksumValue: record.sha256 }],
    externalRefs: [
      {
        referenceCategory: "PACKAGE-MANAGER",
        referenceType: "purl",
        referenceLocator: purl(record.name, record.version),
      },
    ],
  };
}

function declaredPackage(name, spec, field) {
  return {
    name,
    SPDXID: spdxId(name, spec, field),
    versionInfo: spec,
    primaryPackagePurpose: "LIBRARY",
    downloadLocation: "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    licenseDeclared: "NOASSERTION",
    copyrightText: "NOASSERTION",
    comment: `Declaration-only ${field} entry from the packed package manifest; '${spec}' is not asserted to be a resolved installed version.`,
  };
}

function lockPackageName(lockPath, entry) {
  if (typeof entry?.name === "string" && entry.name) return entry.name;
  const marker = "node_modules/";
  const offset = lockPath.lastIndexOf(marker);
  if (offset < 0) return null;
  const remainder = lockPath.slice(offset + marker.length);
  const parts = remainder.split("/");
  return remainder.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function resolveLockEntry(packages, ownerPath, dependencyName) {
  const candidates = [];
  let cursor = ownerPath;
  for (;;) {
    candidates.push(cursor ? `${cursor}/node_modules/${dependencyName}` : `node_modules/${dependencyName}`);
    if (!cursor) break;
    const marker = cursor.lastIndexOf("/node_modules/");
    if (marker >= 0) cursor = cursor.slice(0, marker);
    else cursor = "";
  }
  for (const candidate of candidates) {
    const entry = packages[candidate];
    if (!entry) continue;
    if (entry.link === true && typeof entry.resolved === "string" && packages[entry.resolved]) {
      return { lockPath: candidate, entry: packages[entry.resolved], sourcePath: entry.resolved };
    }
    return { lockPath: candidate, entry, sourcePath: candidate };
  }
  return null;
}

function lockPackage(entry, name, lockPath) {
  const version = String(entry.version ?? "");
  if (!version) fail(`Tracked lock entry has no version: ${lockPath}`);
  const checksum = integrityChecksum(entry.integrity);
  const pkg = {
    name,
    SPDXID: spdxId(name, version, lockPath),
    versionInfo: version,
    primaryPackagePurpose: "LIBRARY",
    downloadLocation:
      typeof entry.resolved === "string" && /^https:\/\//u.test(entry.resolved)
        ? entry.resolved
        : "NOASSERTION",
    filesAnalyzed: false,
    licenseConcluded: "NOASSERTION",
    licenseDeclared: typeof entry.license === "string" ? entry.license : "NOASSERTION",
    copyrightText: "NOASSERTION",
    externalRefs: [
      {
        referenceCategory: "PACKAGE-MANAGER",
        referenceType: "purl",
        referenceLocator: purl(name, version),
      },
    ],
  };
  if (checksum) pkg.checksums = [checksum];
  if (entry.optional === true) pkg.comment = "Resolved optional dependency from the tracked package lock.";
  return pkg;
}

function buildDeclarationSpdx(mainRecord, mainPath, packed, localRecords, localPaths) {
  const main = exactPackage(mainRecord, mainPath);
  const packages = [main];
  const relationships = [
    {
      spdxElementId: "SPDXRef-DOCUMENT",
      relatedSpdxElement: main.SPDXID,
      relationshipType: "DESCRIBES",
    },
  ];
  const localByName = new Map();
  for (let index = 0; index < localRecords.length; index += 1) {
    const record = localRecords[index];
    if (localByName.has(record.name)) fail(`Duplicate exact local artifact identity: ${record.name}`);
    const pkg = exactPackage(record, localPaths[index]);
    localByName.set(record.name, pkg);
    packages.push(pkg);
    relationships.push({
      spdxElementId: main.SPDXID,
      relatedSpdxElement: pkg.SPDXID,
      relationshipType: "DEPENDS_ON",
      comment: "Exact local tarball closure entry.",
    });
  }
  const seenDeclarations = new Set();
  for (const field of DECLARATION_FIELDS) {
    const declarations = packed[field];
    if (!declarations || typeof declarations !== "object" || Array.isArray(declarations)) continue;
    for (const [name, spec] of Object.entries(declarations)) {
      if (localByName.has(name) || typeof spec !== "string" || !spec) continue;
      const key = `${field}\0${name}\0${spec}`;
      if (seenDeclarations.has(key)) continue;
      seenDeclarations.add(key);
      const pkg = declaredPackage(name, spec, field);
      packages.push(pkg);
      relationships.push({
        spdxElementId: main.SPDXID,
        relatedSpdxElement: pkg.SPDXID,
        relationshipType: "DEPENDS_ON",
        comment: `Packed package.json ${field} declaration.`,
      });
    }
  }
  return { main, packages, relationships };
}

function buildLockSpdx(mainRecord, mainPath, lock, localRecords, localPaths) {
  const packagesMap = lock?.packages;
  if (!packagesMap || typeof packagesMap !== "object" || Array.isArray(packagesMap)) {
    fail("Tracked package-lock.json does not contain a packages object");
  }
  const root = packagesMap[""];
  if (!root || typeof root !== "object") fail("Tracked package-lock.json has no root package entry");
  const main = exactPackage(mainRecord, mainPath);
  const packages = [main];
  const relationships = [
    {
      spdxElementId: "SPDXRef-DOCUMENT",
      relatedSpdxElement: main.SPDXID,
      relationshipType: "DESCRIBES",
    },
  ];
  const exactLocal = new Map();
  for (let index = 0; index < localRecords.length; index += 1) {
    const record = localRecords[index];
    if (exactLocal.has(record.name)) fail(`Duplicate exact local artifact identity: ${record.name}`);
    const pkg = exactPackage(record, localPaths[index]);
    exactLocal.set(record.name, pkg);
    packages.push(pkg);
  }

  const byLockPath = new Map();
  const queue = [{ ownerPath: "", ownerSpdxId: main.SPDXID, entry: root }];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const field of ["dependencies", "optionalDependencies"]) {
      const declarations = current.entry[field];
      if (!declarations || typeof declarations !== "object" || Array.isArray(declarations)) continue;
      for (const dependencyName of Object.keys(declarations).sort()) {
        const local = exactLocal.get(dependencyName);
        if (local) {
          relationships.push({
            spdxElementId: current.ownerSpdxId,
            relatedSpdxElement: local.SPDXID,
            relationshipType: "DEPENDS_ON",
            comment: `Tracked package-lock ${field} resolved to the exact local tarball closure.`,
          });
          continue;
        }
        const resolved = resolveLockEntry(packagesMap, current.ownerPath, dependencyName);
        if (!resolved) {
          const spec = String(declarations[dependencyName]);
          const pkg = declaredPackage(dependencyName, spec, field);
          packages.push(pkg);
          relationships.push({
            spdxElementId: current.ownerSpdxId,
            relatedSpdxElement: pkg.SPDXID,
            relationshipType: "DEPENDS_ON",
            comment: `Unresolved tracked package-lock ${field} declaration.`,
          });
          continue;
        }
        if (resolved.entry.dev === true || resolved.entry.peer === true) continue;
        let pkg = byLockPath.get(resolved.lockPath);
        if (!pkg) {
          const name = lockPackageName(resolved.lockPath, resolved.entry) ?? dependencyName;
          pkg = lockPackage(resolved.entry, name, resolved.lockPath);
          byLockPath.set(resolved.lockPath, pkg);
          packages.push(pkg);
          if (packages.length > MAX_PACKAGES) fail(`SPDX package limit exceeded: ${MAX_PACKAGES}`);
          queue.push({ ownerPath: resolved.lockPath, ownerSpdxId: pkg.SPDXID, entry: resolved.entry });
        }
        relationships.push({
          spdxElementId: current.ownerSpdxId,
          relatedSpdxElement: pkg.SPDXID,
          relationshipType: "DEPENDS_ON",
          comment: `Tracked package-lock ${field} resolution.`,
        });
      }
    }
  }

  for (const pkg of exactLocal.values()) {
    if (!relationships.some((relationship) => relationship.relatedSpdxElement === pkg.SPDXID)) {
      relationships.push({
        spdxElementId: main.SPDXID,
        relatedSpdxElement: pkg.SPDXID,
        relationshipType: "DEPENDS_ON",
        comment: "Exact local artifact closure entry not represented by the tracked root lock declarations.",
      });
    }
  }

  const peerDeclarations = root.peerDependencies;
  if (peerDeclarations && typeof peerDeclarations === "object" && !Array.isArray(peerDeclarations)) {
    for (const [name, spec] of Object.entries(peerDeclarations)) {
      if (typeof spec !== "string" || !spec) continue;
      const pkg = declaredPackage(name, spec, "peerDependencies");
      packages.push(pkg);
      relationships.push({
        spdxElementId: main.SPDXID,
        relatedSpdxElement: pkg.SPDXID,
        relationshipType: "DEPENDS_ON",
        comment: "Peer dependency declaration; realization remains the consumer host's responsibility.",
      });
    }
  }
  return { main, packages, relationships };
}

function canonicalizeSpdx(spdx) {
  const result = structuredClone(spdx);
  result.creationInfo.creators = [...new Set(result.creationInfo.creators)].sort();
  result.documentDescribes = [...new Set(result.documentDescribes)].sort();
  result.packages = result.packages
    .map((pkg) => {
      const next = { ...pkg };
      if (Array.isArray(next.checksums)) {
        next.checksums = [...next.checksums].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      }
      if (Array.isArray(next.externalRefs)) {
        next.externalRefs = [...next.externalRefs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      }
      return next;
    })
    .sort((a, b) => String(a.SPDXID).localeCompare(String(b.SPDXID)));
  result.relationships = result.relationships
    .filter((relationship, index, values) =>
      values.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(relationship)) === index,
    )
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return result;
}

function isTracked(filePath) {
  const relative = path.relative(ROOT, filePath).replaceAll(path.sep, "/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) return false;
  const result = spawnSync("git", ["ls-files", "--error-unmatch", "--", relative], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

function evidenceBoundaries(mode) {
  const commonClaims = [
    "The subject tarball, release artifact manifest, SBOM, and exact local tarball closure are bound by SHA-256.",
    "The SBOM describes the exact subject package identity and artifact filename.",
  ];
  const commonNonclaims = [
    "This evidence does not prove vulnerability absence, semantic correctness, or benign runtime behavior.",
    "Peer dependency realization and platform-specific optional dependencies remain consumer-environment responsibilities.",
    "GitHub attestations and npm provenance are separate evidence surfaces with separate trust roots.",
  ];
  if (mode === "tagged-package-lock") {
    return {
      claims: [
        ...commonClaims,
        "Resolved non-development, non-peer dependency identities are derived from the tracked tagged package-lock.json without registry lookup.",
      ],
      nonclaims: commonNonclaims,
    };
  }
  return {
    claims: [
      ...commonClaims,
      "External dependency names and ranges are copied from the packed package.json declarations.",
    ],
    nonclaims: [
      ...commonNonclaims,
      "Declaration-only external dependency entries are not resolved versions or an installed dependency graph.",
    ],
  };
}

function generate(options) {
  const artifactManifestPath = canonicalExisting(requireOption(options, "manifest"));
  const artifactDir = path.dirname(artifactManifestPath);
  const epoch = Number(requireOption(options, "source-date-epoch"));
  if (!Number.isSafeInteger(epoch) || epoch < 0) fail("--source-date-epoch must be a non-negative integer");
  const artifact = safeReadJson(artifactManifestPath, "release artifact manifest");
  assert.equal(artifact.schema, ARTIFACT_SCHEMA, `Unsupported artifact schema: ${artifact.schema}`);

  const mainRecord = {
    name: artifact.package?.name,
    version: artifact.package?.version,
    relativePath: artifact.artifact?.relativePath ?? artifact.artifact?.basename,
    sha256: artifact.artifact?.sha256,
    size: artifact.artifact?.size,
  };
  const mainPath = verifyFileRecord(artifactDir, mainRecord, "Release tarball");
  verifySidecar(mainPath, mainRecord.sha256, "Release tarball");
  const packed = packedManifest(mainPath);
  if (packed.name !== mainRecord.name || packed.version !== mainRecord.version) {
    fail("Release tarball identity differs from the release artifact manifest");
  }

  const localRecords = artifact.dependencies?.localArtifacts ?? [];
  if (!Array.isArray(localRecords)) fail("localArtifacts must be an array");
  const localPaths = localRecords.map((record) => {
    const filePath = verifyFileRecord(artifactDir, record, `Local artifact ${record.name}`);
    verifySidecar(filePath, record.sha256, `Local artifact ${record.name}`);
    const manifest = packedManifest(filePath);
    if (manifest.name !== record.name || manifest.version !== record.version) {
      fail(`Local artifact identity differs: ${record.name}`);
    }
    return filePath;
  });

  const repositoryPath = String(artifact.package?.repositoryPath ?? "");
  if (!repositoryPath || path.isAbsolute(repositoryPath)) fail("Artifact repositoryPath is unsafe");
  const sourceRoot = canonicalExisting(path.join(ROOT, repositoryPath));
  assertWithin(ROOT, sourceRoot, "release source package");
  const sourceManifest = safeReadJson(path.join(sourceRoot, "package.json"), "source package.json");
  if (sourceManifest.name !== mainRecord.name || sourceManifest.version !== mainRecord.version) {
    fail("Source package identity differs from the artifact manifest");
  }

  const lockPath = path.join(sourceRoot, "package-lock.json");
  const hasTrackedLock = fs.existsSync(lockPath) && isTracked(lockPath);
  const mode = hasTrackedLock ? "tagged-package-lock" : "packed-manifest-declarations";
  const built = hasTrackedLock
    ? buildLockSpdx(mainRecord, mainPath, safeReadJson(lockPath, "tracked package-lock.json"), localRecords, localPaths)
    : buildDeclarationSpdx(mainRecord, mainPath, packed, localRecords, localPaths);
  if (built.packages.length > MAX_PACKAGES) fail(`SPDX package limit exceeded: ${MAX_PACKAGES}`);

  const created = new Date(epoch * 1000).toISOString();
  const spdx = canonicalizeSpdx({
    spdxVersion: SPDX_VERSION,
    dataLicense: "CC0-1.0",
    SPDXID: "SPDXRef-DOCUMENT",
    name: `${mainRecord.name}@${mainRecord.version}`,
    documentNamespace: `https://github.com/tryingET/pi-extensions/sbom/sha256/${mainRecord.sha256}`,
    creationInfo: {
      created,
      creators: ["Organization: tryingET", "Tool: scripts/release-sbom.mjs"],
    },
    documentDescribes: [built.main.SPDXID],
    packages: built.packages,
    relationships: built.relationships,
  });
  const sbomText = `${JSON.stringify(spdx, null, 2)}\n`;
  if (Buffer.byteLength(sbomText) > MAX_JSON_BYTES) fail("Generated SPDX document exceeds the size limit");
  const sbomPath = path.join(artifactDir, `${path.basename(mainPath)}.spdx.json`);
  fs.writeFileSync(sbomPath, sbomText, { encoding: "utf8", mode: 0o600 });
  const sbomSha = sha256File(sbomPath);
  writeSidecar(sbomPath, sbomSha);

  const artifactManifestStat = fs.statSync(artifactManifestPath);
  const evidence = {
    schema: EVIDENCE_SCHEMA,
    producer: "scripts/release-sbom.mjs",
    subject: {
      name: mainRecord.name,
      version: mainRecord.version,
      relativePath: path.relative(artifactDir, mainPath).replaceAll(path.sep, "/"),
      sha256: mainRecord.sha256,
      size: mainRecord.size,
    },
    source: {
      tag: artifact.source?.tag ?? null,
      commit: artifact.source?.commit ?? null,
      sourceDateEpoch: epoch,
    },
    artifactManifest: {
      relativePath: path.relative(artifactDir, artifactManifestPath).replaceAll(path.sep, "/"),
      sha256: sha256File(artifactManifestPath),
      size: artifactManifestStat.size,
    },
    sbom: {
      format: SPDX_VERSION,
      mode,
      relativePath: path.relative(artifactDir, sbomPath).replaceAll(path.sep, "/"),
      sha256: sbomSha,
      size: fs.statSync(sbomPath).size,
      sourcePackageLock:
        mode === "tagged-package-lock"
          ? {
              repositoryPath: path.relative(ROOT, lockPath).replaceAll(path.sep, "/"),
              sha256: sha256File(lockPath),
            }
          : null,
    },
    exactLocalArtifacts: localRecords.map((record) => ({
      name: record.name,
      version: record.version,
      relativePath: record.relativePath,
      sha256: record.sha256,
      size: record.size,
    })),
    toolchain: {
      node: process.version,
      npm: run("npm", ["--version"]).trim(),
      script: "scripts/release-sbom.mjs",
    },
    boundaries: evidenceBoundaries(mode),
  };
  const evidencePath = path.join(artifactDir, `${path.basename(mainPath)}.evidence.json`);
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  const evidenceSha = sha256File(evidencePath);
  writeSidecar(evidencePath, evidenceSha);

  writeEnv(options["output-env-file"], {
    RELEASE_SBOM_PATH: sbomPath,
    RELEASE_SBOM_SHA256: sbomSha,
    RELEASE_SBOM_CHECKSUM_PATH: `${sbomPath}.sha256`,
    RELEASE_EVIDENCE_MANIFEST_PATH: evidencePath,
    RELEASE_EVIDENCE_SHA256: evidenceSha,
    RELEASE_EVIDENCE_CHECKSUM_PATH: `${evidencePath}.sha256`,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

function findExactPackage(spdx, record, expectedFilename, label) {
  const matches = (spdx.packages ?? []).filter(
    (pkg) => pkg.name === record.name && pkg.versionInfo === record.version,
  );
  const pkg = matches.find((candidate) =>
    (candidate.checksums ?? []).some(
      (checksum) => checksum.algorithm === "SHA256" && checksum.checksumValue === record.sha256,
    ),
  );
  if (!pkg) fail(`${label} is not represented by an exact SHA-256 package in the SPDX document`);
  if (pkg.packageFileName !== expectedFilename) fail(`${label} SPDX package filename differs`);
  return pkg;
}

function verify(options) {
  const evidencePath = canonicalExisting(requireOption(options, "evidence"));
  const artifactDir = path.dirname(evidencePath);
  const evidence = safeReadJson(evidencePath, "release evidence manifest");
  assert.equal(evidence.schema, EVIDENCE_SCHEMA, `Unsupported evidence schema: ${evidence.schema}`);
  const evidenceSha = sha256File(evidencePath);
  verifySidecar(evidencePath, evidenceSha, "Release evidence manifest");

  const artifactManifestPath = resolveRecordedPath(
    artifactDir,
    evidence.artifactManifest?.relativePath,
    "Release artifact manifest",
  );
  const artifactManifestStat = fs.statSync(artifactManifestPath);
  if (
    sha256File(artifactManifestPath) !== evidence.artifactManifest.sha256 ||
    artifactManifestStat.size !== evidence.artifactManifest.size
  ) {
    fail("Release artifact manifest evidence differs");
  }
  const artifact = safeReadJson(artifactManifestPath, "release artifact manifest");
  assert.equal(artifact.schema, ARTIFACT_SCHEMA);

  const subjectRecord = {
    name: evidence.subject?.name,
    version: evidence.subject?.version,
    relativePath: evidence.subject?.relativePath,
    sha256: evidence.subject?.sha256,
    size: evidence.subject?.size,
  };
  const subjectPath = verifyFileRecord(artifactDir, subjectRecord, "Evidence subject");
  verifySidecar(subjectPath, subjectRecord.sha256, "Evidence subject");
  if (
    artifact.package?.name !== subjectRecord.name ||
    artifact.package?.version !== subjectRecord.version ||
    artifact.artifact?.sha256 !== subjectRecord.sha256 ||
    artifact.artifact?.size !== subjectRecord.size
  ) {
    fail("Evidence subject differs from the release artifact manifest");
  }

  const sbomPath = resolveRecordedPath(artifactDir, evidence.sbom?.relativePath, "SPDX SBOM");
  if (sha256File(sbomPath) !== evidence.sbom.sha256 || fs.statSync(sbomPath).size !== evidence.sbom.size) {
    fail("SPDX SBOM evidence differs");
  }
  verifySidecar(sbomPath, evidence.sbom.sha256, "SPDX SBOM");
  const sbomText = fs.readFileSync(sbomPath, "utf8");
  const spdx = safeReadJson(sbomPath, "SPDX SBOM");
  if (sbomText !== `${JSON.stringify(canonicalizeSpdx(spdx), null, 2)}\n`) {
    fail("SPDX SBOM is not in canonical deterministic form");
  }
  if (spdx.spdxVersion !== SPDX_VERSION) fail("SPDX version differs");
  if (
    spdx.documentNamespace !==
    `https://github.com/tryingET/pi-extensions/sbom/sha256/${subjectRecord.sha256}`
  ) {
    fail("SPDX namespace is not bound to the subject SHA-256");
  }
  if (spdx.creationInfo?.created !== new Date(evidence.source.sourceDateEpoch * 1000).toISOString()) {
    fail("SPDX creation time differs from the source date epoch");
  }
  const mainPkg = findExactPackage(spdx, subjectRecord, path.basename(subjectPath), "Subject");
  if (spdx.documentDescribes?.length !== 1 || spdx.documentDescribes[0] !== mainPkg.SPDXID) {
    fail("SPDX documentDescribes differs from the subject package");
  }

  const localRecords = artifact.dependencies?.localArtifacts ?? [];
  for (const record of localRecords) {
    findExactPackage(spdx, record, path.basename(record.relativePath), `Local artifact ${record.name}`);
  }

  if (evidence.sbom.mode === "tagged-package-lock") {
    const lock = evidence.sbom.sourcePackageLock;
    const lockPath = canonicalExisting(path.join(ROOT, String(lock?.repositoryPath ?? "")));
    assertWithin(ROOT, lockPath, "Tracked package lock");
    if (!isTracked(lockPath)) fail("Evidence package lock is not tracked by the repository state");
    if (sha256File(lockPath) !== lock.sha256) fail("Tracked package-lock.json digest differs");
  } else if (evidence.sbom.mode !== "packed-manifest-declarations") {
    fail(`Unsupported SBOM mode: ${evidence.sbom.mode}`);
  }

  process.stdout.write(
    `Verified ${evidence.sbom.mode} SPDX evidence for ${subjectRecord.name}@${subjectRecord.version} (${subjectRecord.sha256}).\n`,
  );
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "generate") return generate(options);
  if (command === "verify") return verify(options);
  fail("Usage: release-sbom.mjs <generate|verify> [options]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

export {
  buildDeclarationSpdx,
  buildLockSpdx,
  canonicalizeSpdx,
  integrityChecksum,
  resolveLockEntry,
  sha256File,
};
