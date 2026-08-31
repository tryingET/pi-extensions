// summary: Owns editor-refine socket publication and serialized endpoint lifecycle.
// read_when:
//   - Changing bridge discovery descriptors, socket permissions, or cleanup behavior.

import { chmod, lstat, mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { createConnection, createServer } from "node:net";
import { basename, dirname, join } from "node:path";
import {
  EDITOR_REFINE_SOCKET_DIR,
  publisherToken,
  socketPathFor,
} from "./editor-refine-identity.js";
import { EditorRefineProtocolError } from "./editor-refine-protocol.js";

/** @typedef {import("node:fs").Stats} Stats */
/** @typedef {import("node:net").Socket} Socket */
/** @typedef {import("node:net").Server} NetServer */
/** @typedef {{ dev: number|bigint, ino: number|bigint }} FileIdentity */
/** @typedef {{ runtimeDir: string, sessionId: string, publisherId: string, processStartTime: string, protocolVersion: number, descriptorVersion: number, snapshotTtlMs: number, outcomeTtlMs: number, now: () => number, onConnection: (socket: Socket) => void, beforeStop: () => void, onServerError?: () => void }} EndpointOptions */

/** @param {unknown} error @returns {string|undefined} */
function errorCode(error) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  return String(error.code);
}

/** @param {Stats} metadata @returns {FileIdentity} */
function fileIdentity(metadata) {
  return { dev: metadata.dev, ino: metadata.ino };
}

/** @param {Stats} metadata @param {FileIdentity|undefined} identity */
function matchesIdentity(metadata, identity) {
  return Boolean(identity && metadata.dev === identity.dev && metadata.ino === identity.ino);
}

/** @param {string} path @returns {Promise<boolean>} */
async function socketIsLive(path) {
  return new Promise((resolve) => {
    const client = createConnection(path);
    let finished = false;
    /** @param {boolean} live */
    const finish = (live) => {
      if (finished) return;
      finished = true;
      client.destroy();
      resolve(live);
    };
    client.once("connect", () => finish(true));
    client.once("error", () => finish(false));
    client.setTimeout(150, () => finish(false));
  });
}

/** @param {string} path @returns {Promise<void>} */
async function prepareSocketPath(path) {
  try {
    const metadata = await lstat(path);
    if (!metadata.isSocket() || metadata.uid !== process.getuid?.()) {
      throw new EditorRefineProtocolError(
        "unsafe_socket",
        "existing bridge path is not an owned socket",
      );
    }
    if (await socketIsLive(path)) {
      throw new EditorRefineProtocolError("socket_active", "editor bridge socket is active");
    }
    await unlink(path);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

/** @param {string} path @param {FileIdentity|undefined} identity @param {(metadata: Stats) => boolean} kind */
async function unlinkExact(path, identity, kind) {
  if (!identity) return;
  try {
    const metadata = await lstat(path);
    if (
      metadata.uid === process.getuid?.() &&
      kind(metadata) &&
      matchesIdentity(metadata, identity)
    ) {
      await unlink(path);
    }
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
  }
}

/** @param {NetServer|undefined} server */
async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(() => resolve(undefined)));
}

/** @param {EndpointOptions} options */
export function createEditorRefineEndpoint(options) {
  const directory = join(options.runtimeDir, EDITOR_REFINE_SOCKET_DIR);
  const targetSocketPath = socketPathFor(
    options.runtimeDir,
    options.sessionId,
    options.publisherId,
  );
  const targetDescriptorPath = `${targetSocketPath}.json`;
  /** @type {NetServer|undefined} */
  let server;
  let running = false;
  /** @type {FileIdentity|undefined} */
  let socketIdentity;
  /** @type {FileIdentity|undefined} */
  let descriptorIdentity;
  let lifecycle = Promise.resolve();

  /** @template T @param {() => Promise<T>} operation @returns {Promise<T>} */
  const enqueue = (operation) => {
    const result = lifecycle.then(operation, operation);
    lifecycle = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const cleanup = async () => {
    try {
      options.beforeStop();
    } finally {
      const currentServer = server;
      server = undefined;
      running = false;
      await closeServer(currentServer);
      await unlinkExact(targetDescriptorPath, descriptorIdentity, (metadata) => metadata.isFile());
      await unlinkExact(targetSocketPath, socketIdentity, (metadata) => metadata.isSocket());
      descriptorIdentity = undefined;
      socketIdentity = undefined;
    }
  };

  return {
    get socketPath() {
      return running ? targetSocketPath : undefined;
    },
    get descriptorPath() {
      return running ? targetDescriptorPath : undefined;
    },
    start() {
      return enqueue(async () => {
        if (running) return targetSocketPath;
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await chmod(directory, 0o700);
        await prepareSocketPath(targetSocketPath);

        const currentServer = createServer(options.onConnection);
        server = currentServer;
        try {
          await new Promise((resolve, reject) => {
            /** @param {unknown} error */
            const onInitialError = (error) => reject(error);
            currentServer.once("error", onInitialError);
            currentServer.listen(targetSocketPath, () => {
              currentServer.off("error", onInitialError);
              resolve(undefined);
            });
          });
          currentServer.on("error", () => options.onServerError?.());
          await chmod(targetSocketPath, 0o600);
          const socketMetadata = await lstat(targetSocketPath);
          if (!socketMetadata.isSocket() || socketMetadata.uid !== process.getuid?.()) {
            throw new EditorRefineProtocolError("unsafe_socket", "bridge socket ownership changed");
          }
          socketIdentity = fileIdentity(socketMetadata);

          const descriptor = {
            schema_version: options.descriptorVersion,
            protocol_version: options.protocolVersion,
            type: "pi-editor-refine-endpoint",
            session_id: options.sessionId,
            publisher_id: options.publisherId,
            publisher_token: publisherToken(options.publisherId),
            pid: process.pid,
            process_start_time: options.processStartTime,
            socket_path: targetSocketPath,
            socket_name: basename(targetSocketPath),
            snapshot_ttl_ms: options.snapshotTtlMs,
            outcome_ttl_ms: options.outcomeTtlMs,
            created_at_ms: options.now(),
          };
          const temporaryPath = join(
            dirname(targetDescriptorPath),
            `.${basename(targetDescriptorPath)}.${process.pid}.tmp`,
          );
          try {
            await writeFile(temporaryPath, `${JSON.stringify(descriptor)}\n`, {
              encoding: "utf8",
              flag: "wx",
              mode: 0o600,
            });
            await rename(temporaryPath, targetDescriptorPath);
          } catch (error) {
            try {
              await unlink(temporaryPath);
            } catch (cleanupError) {
              if (errorCode(cleanupError) !== "ENOENT") throw cleanupError;
            }
            throw error;
          }
          await chmod(targetDescriptorPath, 0o600);
          const descriptorMetadata = await lstat(targetDescriptorPath);
          if (!descriptorMetadata.isFile() || descriptorMetadata.uid !== process.getuid?.()) {
            throw new EditorRefineProtocolError(
              "unsafe_descriptor",
              "bridge descriptor ownership changed",
            );
          }
          descriptorIdentity = fileIdentity(descriptorMetadata);
          running = true;
          return targetSocketPath;
        } catch (error) {
          await cleanup();
          throw error;
        }
      });
    },
    stop() {
      return enqueue(cleanup);
    },
  };
}
