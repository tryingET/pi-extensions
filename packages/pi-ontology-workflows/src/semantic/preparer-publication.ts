import { createHash } from "node:crypto";
import path from "node:path";
import {
  type PreparedRuntimeLocation,
  type PreparedRuntimeManifest,
  verifyPreparedRuntime,
} from "./prepared-runtime.ts";
import type { DevelopmentSourcePin } from "./preparer.ts";
import type { CheckoutEvidence } from "./preparer-git.ts";
import {
  DevelopmentPreparationError,
  fail,
  type Material,
  message,
  openRelativeDirectory,
  openRelativeUnknown,
  requireOwnerSafe,
  type SafeDirectory,
  sameSignature,
  signature,
  stableDirectoryNames,
} from "./preparer-safe-fs.ts";

export const ENTRYPOINT = Buffer.from("python -B -m rocs_cli\n", "ascii");

export function contentIdentity(input: {
  pin: DevelopmentSourcePin;
  checkout: CheckoutEvidence;
  cfg: Buffer;
  pythonVersion: string;
  interpreterCanonical: string;
  standardLibraryPath: string;
  sitePackagesPath: string;
  sourceFiles: Map<string, Buffer>;
  lockBytes: Buffer;
  stagedFiles: Map<string, Material>;
  interpreterRelative: string;
  interpreterBytes: Buffer;
}): string {
  const hash = createHash("sha256");
  const field = (kind: string, name: string, mode: number, bytes: Uint8Array) => {
    const header = Buffer.from(
      `${kind}\0${name}\0${mode.toString(8)}\0${bytes.byteLength}\0`,
      "utf8",
    );
    hash.update(header).update(bytes);
  };
  field("domain", "preparation", 0, Buffer.from("pi.rocs-development-preparation.v1\0", "ascii"));
  field(
    "semantic",
    "pin",
    0,
    Buffer.from(
      JSON.stringify({
        commit: input.pin.commit,
        files: input.pin.files,
        lock: input.pin.lock,
        dependencies: input.pin.dependencyPackages,
        checkout: input.checkout,
        pythonVersion: input.pythonVersion,
        interpreterCanonical: input.interpreterCanonical,
        standardLibraryPath: input.standardLibraryPath,
        sitePackagesPath: input.sitePackagesPath,
      }),
      "utf8",
    ),
  );
  field("semantic", "pyvenv.cfg", 0o644, input.cfg);
  for (const [name, bytes] of [...input.sourceFiles].sort(([a], [b]) =>
    Buffer.compare(Buffer.from(a), Buffer.from(b)),
  ))
    field("source", name, 0o644, bytes);
  field("published", "uv.lock", 0o644, input.lockBytes);
  field("published", "entrypoint.txt", 0o644, ENTRYPOINT);
  field("published", input.interpreterRelative, 0o755, input.interpreterBytes);
  for (const [name, material] of [...input.stagedFiles].sort(([a], [b]) =>
    Buffer.compare(Buffer.from(a), Buffer.from(b)),
  ))
    field("published", name, material.mode, material.bytes);
  return hash.digest("hex");
}

export async function verifyExpectedGeneration(
  cache: SafeDirectory,
  name: string,
  locationValue: PreparedRuntimeLocation,
  expectedDigest: string,
  expectedFiles: ReadonlySet<string>,
): Promise<PreparedRuntimeManifest> {
  const generation = await openRelativeDirectory(cache, name, "prepared runtime").catch((error) => {
    throw new DevelopmentPreparationError(
      `existing prepared runtime is partial or invalid: ${message(error)}`,
    );
  });
  try {
    const before = signature(await generation.handle.stat({ bigint: true }));
    const actual = await enumerateGeneration(generation);
    if (
      actual.size !== expectedFiles.size ||
      [...expectedFiles].some((entry) => !actual.has(entry))
    )
      fail("existing prepared runtime is partial or invalid: path set mismatch");
    const manifest = await verifyPreparedRuntime(locationValue).catch((error) => {
      throw new DevelopmentPreparationError(
        `existing prepared runtime is partial or invalid: ${message(error)}`,
      );
    });
    if (manifest.manifest_digest !== expectedDigest)
      fail("existing prepared runtime identity does not match expected generation");
    const reopened = await openRelativeDirectory(cache, name, "prepared runtime");
    try {
      if (!sameSignature(before, signature(await reopened.handle.stat({ bigint: true }))))
        fail("prepared runtime final path changed during verification");
    } finally {
      await reopened.handle.close();
    }
    return manifest;
  } finally {
    await generation.handle.close();
  }
}

export async function enumerateGeneration(root: SafeDirectory): Promise<Set<string>> {
  const files = new Set<string>();
  const directories = new Set<string>();
  const visit = async (directory: SafeDirectory, prefix: string): Promise<void> => {
    for (const name of await stableDirectoryNames(directory, prefix || "prepared runtime")) {
      const relative = prefix ? `${prefix}/${name}` : name;
      const child = await openRelativeUnknown(directory, name, relative);
      try {
        requireOwnerSafe(child.stat, relative);
        if (child.stat.isDirectory()) {
          directories.add(relative);
          await visit(
            { handle: child.handle, absolute: path.join(directory.absolute, name) },
            relative,
          );
        } else if (child.stat.isFile()) files.add(relative);
        else fail(`non-regular prepared runtime path: ${relative}`);
      } finally {
        await child.handle.close();
      }
    }
  };
  await visit(root, "");
  const expectedDirectories = new Set<string>();
  for (const file of files) {
    const parts = file.split("/");
    parts.pop();
    while (parts.length) {
      expectedDirectories.add(parts.join("/"));
      parts.pop();
    }
  }
  if (
    directories.size !== expectedDirectories.size ||
    [...directories].some((entry) => !expectedDirectories.has(entry))
  )
    fail("prepared runtime contains extra directories");
  return files;
}

export function location(root: string): PreparedRuntimeLocation {
  return Object.freeze({
    root,
    manifestPath: path.join(root, "manifest.json"),
    dependencyLockPath: path.join(root, "uv.lock"),
    entrypointPath: path.join(root, "entrypoint.txt"),
  });
}
