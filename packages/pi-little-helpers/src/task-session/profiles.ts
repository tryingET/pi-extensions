import { opendirSync } from "node:fs";
import { join } from "node:path";
import { refuse } from "./json.js";
import { preflightProfile } from "./profile.js";
import {
  accountLocator,
  assertSnapshotDomains,
  type Locator,
  privatePath,
  readSnapshot,
} from "./state.js";
/** Bounded existing-only inspection, not publication or runtime producer/task authority. */
export async function profileCatalog(locator: Locator) {
  assertSnapshotDomains(readSnapshot(locator));
  const root = join(locator.root, "profiles");
  privatePath(root, true);
  const dir = opendirSync(root),
    references: string[] = [];
  try {
    for (let entry = dir.readSync(); entry; entry = dir.readSync()) {
      if (!/^[a-f0-9]{64}\.json$/.test(entry.name)) refuse("profile_catalog_unexpected_entry");
      if (references.length === 256) refuse("profile_catalog_too_large");
      references.push(entry.name.slice(0, -5));
    }
  } finally {
    dir.closeSync();
  }
  const profiles = [];
  for (const reference of references.sort()) {
    try {
      const p = await preflightProfile(locator, reference);
      profiles.push({
        profile: reference,
        validation: "profile_preflight_passed",
        requested: p.resolution.requested,
        resolved: p.resolution.resolved,
        reasoning: p.reasoning,
        modelSourceDigest: p.resolution.sourceDigest,
        workerDigest: p.producer.akBinaryDigest,
        policyDigest: p.producer.policyDigest,
        hostBuildDigest: p.producer.hostBuildDigest,
      });
    } catch (error) {
      profiles.push({
        profile: reference,
        validation: "unavailable",
        reason:
          error instanceof Error && /^[a-z_]+$/.test(error.message)
            ? error.message
            : "profile_unavailable",
      });
    }
  }
  return {
    schema: "pi.task-session.profiles.v1",
    namespace: locator.namespace,
    profiles,
    admissionAssessed: false,
    publicationPerformed: false,
    ownerAction:
      "Select an exact existing profile; missing profiles require separate owner publication. Plan and launch still require producer, policy and custody checks.",
  };
}
export async function taskSessionProfiles() {
  return profileCatalog(accountLocator());
}
