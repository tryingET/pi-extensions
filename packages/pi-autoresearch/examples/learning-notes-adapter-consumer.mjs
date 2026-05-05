#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

function usage() {
  console.error(
    [
      "Usage: node examples/learning-notes-adapter-consumer.mjs --packet <packet.json> [--destination <relative-path>]",
      "",
      "Dry-run consumer proof for autoresearch.learning.v1 packets.",
      "It validates the packet and prints a planned repo-notes write receipt without writing files.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const result = { packetPath: null, destinationPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--packet") {
      result.packetPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--destination") {
      result.destinationPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!result.packetPath) throw new Error("--packet is required");
  return result;
}

function assertRelativeNotesPath(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty relative notes path`);
  }
  if (path.isAbsolute(value)) {
    throw new Error(`${fieldName} must be relative, not absolute`);
  }
  const normalized = path.posix.normalize(value.replaceAll("\\", "/"));
  if (normalized === "." || normalized.startsWith("../") || normalized === "..") {
    throw new Error(`${fieldName} must not escape the selected notes root`);
  }
  if (!normalized.startsWith("docs/learnings/")) {
    throw new Error(`${fieldName} must stay under docs/learnings/ for this proof consumer`);
  }
  return normalized;
}

function validateLearningPacket(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    throw new Error("packet must be an object");
  }
  if (packet.packetKind !== "autoresearch.learning.v1") {
    throw new Error(`unsupported packetKind: ${String(packet.packetKind)}`);
  }
  if (packet.adapterContractVersion !== 1) {
    throw new Error(`unsupported adapterContractVersion: ${String(packet.adapterContractVersion)}`);
  }
  if (!Array.isArray(packet.targetKinds) || !packet.targetKinds.includes("notes")) {
    throw new Error("targetKinds must include notes");
  }
  if (typeof packet.title !== "string" || packet.title.trim().length === 0) {
    throw new Error("title must be a non-empty string");
  }
  if (typeof packet.markdown !== "string" || packet.markdown.trim().length === 0) {
    throw new Error("markdown must be a non-empty string");
  }
  if (!packet.closeout || typeof packet.closeout !== "object") {
    throw new Error("closeout object is required");
  }
  return packet;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const packet = validateLearningPacket(JSON.parse(readFileSync(args.packetPath, "utf8")));
  const destinationPath = assertRelativeNotesPath(
    args.destinationPath ?? packet.suggestedPath,
    args.destinationPath ? "--destination" : "packet.suggestedPath",
  );
  const receipt = {
    kind: "autoresearch.notes_adapter_dry_run.v1",
    status: "planned",
    apply: false,
    target: "repo_notes",
    packetKind: packet.packetKind,
    adapterContractVersion: packet.adapterContractVersion,
    title: packet.title,
    destinationPath,
    markdownBytes: Buffer.byteLength(packet.markdown, "utf8"),
    empiricalDecisionClass: packet.closeout.empiricalDecisionClass ?? null,
    promotionReady: packet.closeout.empiricalPosture?.promotionReady ?? null,
    boundary:
      "dry-run proof only; this consumer validates and plans a repo-notes write but does not create files, promote learning, or change pi-autoresearch authority",
  };
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
