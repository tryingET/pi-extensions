#!/usr/bin/env node
// Deterministic AK projection generator for governance/work-items.json.
// The output is a projection only; Agent Kernel remains live authority.
// Usage: node scripts/sync-work-items.mjs

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(repoRoot, "governance/work-items.json");

const raw = execSync("ak task list -F json", {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  cwd: repoRoot,
});
const parsed = JSON.parse(raw);
const list = Array.isArray(parsed) ? parsed : (parsed.tasks ?? []);

const items = list.map((task) => ({
  id: `AK-TASK-${String(task.id).padStart(4, "0")}`,
  title: task.title,
  state: task.status ?? task.state ?? "unknown",
  priority: task.priority ?? null,
  updated_at: task.updated_at ?? task.updatedAt ?? null,
}));

const out = {
  schema_version: 2,
  projection: {
    kind: "deterministic AK export",
    canonical_source: "ak task list -F json",
    exported_at: new Date().toISOString().slice(0, 10),
    regenerated_by: "scripts/sync-work-items.mjs",
    note: "Projection only; Agent Kernel is live authority. Regenerate after task lifecycle changes.",
  },
  owner: "@tryingET",
  project_name: "pi-extensions",
  items,
};

writeFileSync(target, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${items.length} items to ${target}`);
