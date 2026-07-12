import { randomBytes } from "node:crypto";
import { realpath, rename } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  DEVELOPMENT_ROCS_COMMIT,
  DEVELOPMENT_ROCS_FILES,
  DEVELOPMENT_ROCS_LOCK,
  DEVELOPMENT_RUNTIME_DEPENDENCIES,
} from "./development-pin.ts";
import {
  type PreparedRuntimeFile,
  type PreparedRuntimeLocation,
  type PreparedRuntimeManifest,
  preparedManifestDigest,
  sha256Raw,
  verifyPreparedRuntimeMaterial,
} from "./prepared-runtime.ts";
import {
  addMaterial,
  collectDependencies,
  collectStandardLibrary,
  parsePythonConfiguration,
  proveDependencyClosure,
  validatePin,
} from "./preparer-dependencies.ts";
import { gitBlobDigest, verifyPinnedCheckout } from "./preparer-git.ts";
import {
  contentIdentity,
  ENTRYPOINT,
  location,
  verifyExpectedGeneration,
} from "./preparer-publication.ts";
import {
  childExists,
  createPrivateChild,
  DevelopmentPreparationError,
  ensurePrivateCache,
  fail,
  isExistingRename,
  type Material,
  message,
  openAbsoluteDirectory,
  openAbsoluteFile,
  openRelativeDirectory,
  procChild,
  readOpenedFile,
  readRelativeFile,
  removeOwnedTree,
  requireLinuxOwner,
  resolveStableRequestedFile,
  type SafeDirectory,
  writeMaterial,
} from "./preparer-safe-fs.ts";

const FILE_CAP = 1_048_576;
const INTERPRETER_CAP = 134_217_728;

export interface DevelopmentDependencyPackage {
  /** Normalized distribution identity in uv.lock. */
  distribution: string;
  /** Import-package path relative to site-packages. */
  path: string;
  purePython: true;
  /** The sole supported native omission: PyYAML's documented Python fallback. */
  optionalNativeFallback?: "pyyaml";
}

export interface DevelopmentSourcePin {
  sourceRoot: string;
  cacheRoot: string;
  commit: string;
  files: ReadonlyArray<readonly [path: string, gitBlob: string]>;
  lock: Readonly<{ path: string; blob: string }>;
  dependencyPackages: readonly DevelopmentDependencyPackage[];
}

export interface PreparedDevelopmentRuntime {
  readonly location: PreparedRuntimeLocation;
  readonly manifest: PreparedRuntimeManifest;
  readonly cacheRoot: string;
  readonly published: boolean;
}

export { DevelopmentPreparationError };

export function defaultDevelopmentSourcePin(): DevelopmentSourcePin {
  const home = homedir();
  return Object.freeze({
    sourceRoot: path.join(home, "ai-society", "core", "rocs-cli"),
    cacheRoot: path.join(home, ".cache", "pi-ontology-workflows", "extension-cache"),
    commit: DEVELOPMENT_ROCS_COMMIT,
    files: DEVELOPMENT_ROCS_FILES,
    lock: DEVELOPMENT_ROCS_LOCK,
    dependencyPackages: DEVELOPMENT_RUNTIME_DEPENDENCIES,
  });
}

/** Prepare without shell, network, PATH lookup, inherited environment, or pathname reads. */
export async function prepareDevelopmentRuntime(
  pin: DevelopmentSourcePin = defaultDevelopmentSourcePin(),
): Promise<PreparedDevelopmentRuntime> {
  requireLinuxOwner();
  validatePin(pin);
  const source = await openAbsoluteDirectory(pin.sourceRoot, "ROCS source", true);
  let venv: SafeDirectory | undefined;
  let sitePackages: SafeDirectory | undefined;
  let standardLibraryRoot: SafeDirectory | undefined;
  try {
    const checkout = await verifyPinnedCheckout(source, pin);
    const sourceFiles = new Map<string, Buffer>();
    for (const [relative, expectedBlob] of pin.files) {
      const bytes = await readRelativeFile(source, relative, FILE_CAP, `ROCS source ${relative}`);
      if (gitBlobDigest(bytes) !== expectedBlob) fail(`dirty or unpinned ROCS source: ${relative}`);
      sourceFiles.set(relative, bytes);
    }
    const lockBytes = await readRelativeFile(
      source,
      pin.lock.path,
      FILE_CAP,
      "ROCS dependency lock",
    );
    if (gitBlobDigest(lockBytes) !== pin.lock.blob) fail("dirty or unpinned ROCS dependency lock");
    proveDependencyClosure(lockBytes, pin.dependencyPackages);

    venv = await openRelativeDirectory(source, ".venv", "ROCS virtualenv");
    const cfg = await readRelativeFile(venv, "pyvenv.cfg", 16_384, "ROCS pyvenv.cfg");
    const python = parsePythonConfiguration(cfg);
    const bin = await openRelativeDirectory(venv, "bin", "ROCS virtualenv bin");
    let interpreterCanonical: string;
    try {
      interpreterCanonical = await resolveStableRequestedFile(
        bin,
        `python${python.majorMinor}`,
        "ROCS interpreter",
      );
    } finally {
      await bin.handle.close();
    }
    const configuredHome = await realpath(python.home);
    if (configuredHome !== path.resolve(configuredHome))
      fail("Python home did not resolve canonically");
    const expectedInterpreter = path.join(configuredHome, `python${python.majorMinor}`);
    if (interpreterCanonical !== expectedInterpreter)
      fail("ROCS interpreter does not match canonical pyvenv.cfg home");
    const interpreter = await openAbsoluteFile(
      interpreterCanonical,
      "ROCS canonical interpreter",
      INTERPRETER_CAP,
    );
    let interpreterBytes: Buffer;
    try {
      interpreterBytes = await readOpenedFile(
        interpreter.handle,
        INTERPRETER_CAP,
        "ROCS canonical interpreter",
      );
    } finally {
      await interpreter.handle.close();
    }

    const standardLibraryPath = path.join(
      path.dirname(configuredHome),
      "lib",
      `python${python.majorMinor}`,
    );
    standardLibraryRoot = await openAbsoluteDirectory(
      standardLibraryPath,
      "Python standard library",
      true,
    );
    sitePackages = await openRelativeDirectory(
      venv,
      `lib/python${python.majorMinor}/site-packages`,
      "ROCS site-packages",
    );
    const standardLibrary = await collectStandardLibrary(standardLibraryRoot, python.majorMinor);
    const dependencies = await collectDependencies(sitePackages, pin.dependencyPackages);
    await verifyPinnedCheckout(source, pin, checkout);

    const stagedFiles = new Map<string, Material>();
    for (const [sourcePath, bytes] of sourceFiles) {
      if (!sourcePath.startsWith("src/rocs_cli/"))
        fail(`pinned ROCS path is outside the package: ${sourcePath}`);
      addMaterial(stagedFiles, sourcePath.slice(4), bytes, 0o644);
    }
    for (const [relative, material] of standardLibrary)
      addMaterial(stagedFiles, relative, material.bytes, material.mode);
    for (const [relative, material] of dependencies)
      addMaterial(stagedFiles, relative, material.bytes, material.mode);

    const interpreterRelative = `python${python.majorMinor}`;
    const contentKey = contentIdentity({
      pin,
      checkout,
      cfg,
      pythonVersion: python.version,
      interpreterCanonical,
      standardLibraryPath,
      sitePackagesPath: sitePackages.absolute,
      sourceFiles,
      lockBytes,
      stagedFiles,
      interpreterRelative,
      interpreterBytes,
    });
    const cache = await ensurePrivateCache(pin.cacheRoot);
    try {
      const finalName = `runtime-${contentKey}`;
      const finalRoot = path.join(cache.absolute, finalName);
      const finalLocation = location(finalRoot);
      const files = [...stagedFiles]
        .sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
        .map(
          ([relative, material]): PreparedRuntimeFile => ({
            path: relative,
            mode: material.mode,
            size: material.bytes.byteLength,
            digest: sha256Raw(material.bytes),
          }),
        );
      const manifest: PreparedRuntimeManifest = {
        schema: "pi-rocs-prepared-runtime-manifest.v0",
        rocs_commit: pin.commit,
        files,
        dependency_lock_digest: sha256Raw(lockBytes),
        interpreter: {
          path: path.join(finalRoot, interpreterRelative),
          version: python.version,
          digest: sha256Raw(interpreterBytes),
        },
        entrypoint_digest: sha256Raw(ENTRYPOINT),
        manifest_digest: `sha256:${"0".repeat(64)}`,
      };
      manifest.manifest_digest = preparedManifestDigest(manifest);
      verifyPreparedRuntimeMaterial(manifest, {
        files: Object.fromEntries([...stagedFiles].map(([name, value]) => [name, value.bytes])),
        dependencyLock: lockBytes,
        entrypoint: ENTRYPOINT,
        interpreter: interpreterBytes,
      });
      const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
      const expectedPaths = new Set([
        ...stagedFiles.keys(),
        "uv.lock",
        "entrypoint.txt",
        interpreterRelative,
        "manifest.json",
      ]);
      if (await childExists(cache, finalName)) {
        const existing = await verifyExpectedGeneration(
          cache,
          finalName,
          finalLocation,
          manifest.manifest_digest,
          expectedPaths,
        );
        return Object.freeze({
          location: finalLocation,
          manifest: existing,
          cacheRoot: cache.absolute,
          published: false,
        });
      }

      const stagingName = `.runtime-${contentKey}.tmp-${randomBytes(16).toString("hex")}`;
      const staging = await createPrivateChild(cache, stagingName);
      let stagingExists = true;
      let wonPublication = false;
      try {
        for (const [relative, material] of stagedFiles)
          await writeMaterial(staging, relative, material.bytes, material.mode);
        await writeMaterial(staging, "uv.lock", lockBytes, 0o644);
        await writeMaterial(staging, "entrypoint.txt", ENTRYPOINT, 0o644);
        await writeMaterial(staging, interpreterRelative, interpreterBytes, 0o755);
        await writeMaterial(staging, "manifest.json", manifestBytes, 0o644);
        await staging.handle.sync();
        await staging.handle.close();
        try {
          await rename(procChild(cache, stagingName), procChild(cache, finalName));
          stagingExists = false;
          wonPublication = true;
          await cache.handle.sync();
        } catch (error) {
          if (!isExistingRename(error)) throw error;
          const reopened = await openRelativeDirectory(cache, stagingName, "staging generation");
          await removeOwnedTree(cache, stagingName, reopened);
          stagingExists = false;
        }
        const verified = await verifyExpectedGeneration(
          cache,
          finalName,
          finalLocation,
          manifest.manifest_digest,
          expectedPaths,
        );
        return Object.freeze({
          location: finalLocation,
          manifest: verified,
          cacheRoot: cache.absolute,
          published: wonPublication,
        });
      } catch (error) {
        if (stagingExists) {
          await staging.handle.close().catch(() => undefined);
          const reopened = await openRelativeDirectory(
            cache,
            stagingName,
            "staging generation",
          ).catch(() => undefined);
          if (reopened) await removeOwnedTree(cache, stagingName, reopened).catch(() => undefined);
        }
        throw error;
      }
    } finally {
      await cache.handle.close();
    }
  } catch (error) {
    throw error instanceof DevelopmentPreparationError
      ? error
      : new DevelopmentPreparationError(message(error));
  } finally {
    await Promise.allSettled(
      [
        source.handle.close(),
        venv?.handle.close(),
        sitePackages?.handle.close(),
        standardLibraryRoot?.handle.close(),
      ].filter((value): value is Promise<void> => value !== undefined),
    );
  }
}
