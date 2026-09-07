import assert from "node:assert/strict";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyNamespace, classifySnapshot, commonGit } from "../dist/task-session/classify.js";
import { identityFromSnapshot } from "../dist/task-session/installed-identity.js";
import {
  durableWrite,
  physicalIdentity,
  readSnapshot,
  reserve,
} from "../dist/task-session/state.js";

for (const kind of ["inventory-gitdir", "inventory-commondir", "enrolled-only", "occupied-only"]) {
  test(`I01 recomputes ${kind} topology without rewriting occupancy`, () => {
    const root = mkdtempSync(join(tmpdir(), "task5480-topology-review-"));
    try {
      const g1 = join(root, "G1"),
        g2 = join(root, "G2");
      mkdirSync(g1);
      mkdirSync(g2);
      const makeDomain = (taskId, git) => {
        const checkout = join(root, `checkout-${taskId}`);
        mkdirSync(checkout);
        writeFileSync(join(checkout, ".git"), `gitdir: ${git}\n`);
        return {
          akInstance: "a",
          taskId,
          checkout,
          commonGit: git,
          sharedEffects: [],
          physical: { checkout: physicalIdentity(checkout), commonGit: physicalIdentity(git) },
        };
      };
      const gx = join(root, "GX");
      mkdirSync(gx);
      const x = makeDomain(1, gx),
        y = makeDomain(2, g1),
        z = makeDomain(3, g2);
      let driftFile = join(y.checkout, ".git"),
        replacement = `gitdir: ${g2}\n`;
      if (kind === "inventory-commondir") {
        const gd = join(root, "worktree-git");
        mkdirSync(gd);
        writeFileSync(driftFile, `gitdir: ${gd}\n`);
        driftFile = join(gd, "commondir");
        writeFileSync(driftFile, `${g1}\n`);
        replacement = `${g2}\n`;
      }
      writeFileSync(join(root, "namespace.lock"), "", { mode: 0o600 });
      const rs = lstatSync(root),
        ls = lstatSync(join(root, "namespace.lock"));
      const locator = {
        schema: "pi.task-session.locator.v1",
        namespace: "n",
        root,
        uid: process.getuid(),
        rootDev: rs.dev,
        rootIno: rs.ino,
        lockDev: ls.dev,
        lockIno: ls.ino,
      };
      const inventory = kind.startsWith("inventory");
      const state = {
        schema: "pi.task-session.state.v1",
        namespace: "n",
        generation: 1,
        withdrawn: false,
        inventoryComplete: true,
        domains: inventory ? [x, y, z] : [x, z],
        enrolled: kind === "enrolled-only" ? [y, z] : [z],
        attempts:
          kind === "occupied-only"
            ? [
                {
                  requestId: "held",
                  semanticDigest: "a".repeat(64),
                  attempt: "held",
                  incarnation: "held",
                  domain: y,
                  hostClosed: false,
                  effectsDisposed: false,
                  claimResolved: false,
                },
              ]
            : [],
      };
      durableWrite(join(root, "state.json"), state);
      const request = {
        schema: "pi.task-session.classify-request.v1",
        requestId: "probe",
        akInstance: "a",
        taskIds: [inventory ? 2 : 1],
        cwd: x.checkout,
      };
      assert.equal(classifyNamespace(request, locator).classification, "outside");
      const before = readFileSync(join(root, "state.json"));
      writeFileSync(driftFile, replacement);
      assert.equal(physicalIdentity(y.checkout), y.physical.checkout);
      assert.equal(physicalIdentity(g1), y.physical.commonGit);
      assert.equal(commonGit(y.checkout), g2);
      assert.throws(() => classifyNamespace(request, locator), /domain_git_topology_changed/);
      assert.throws(
        () => identityFromSnapshot(readSnapshot(locator)),
        /domain_git_topology_changed/,
      );
      assert.throws(
        () => reserve(locator, "probe", "b".repeat(64), z),
        /domain_git_topology_changed/,
      );
      assert.deepEqual(readFileSync(join(root, "state.json")), before);
      assert.deepEqual(readSnapshot(locator), state, "inspection retains all original custody");
      if (inventory) {
        // Demonstrate why substituting fresh metadata would change protection; NEVER persist that substitution.
        const fresh = structuredClone(state);
        fresh.domains[1] = {
          ...y,
          commonGit: g2,
          physical: { ...y.physical, commonGit: physicalIdentity(g2) },
        };
        assert.equal(classifySnapshot(request, fresh).classification, "enrolled");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test("I01 dangling commondir does not fall back to the old gitdir", () => {
  const root = mkdtempSync(join(tmpdir(), "task5480-dangling-git-"));
  try {
    const dot = join(root, ".git");
    mkdirSync(dot);
    assert.equal(commonGit(root), dot);
    writeFileSync(join(dot, "commondir"), "../missing\n");
    assert.throws(() => commonGit(root), /ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
