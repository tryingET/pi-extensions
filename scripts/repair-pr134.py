from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_ROOT = ROOT / ".github" / "workflows"
OLD_NODE = "22.19.0"
NEW_NODE = "22.22.2"
DOLT_VERSION = "2.3.1"
DOLT_COMMIT = "b15770fe588268027d799c11356af0ce24ba882a"
DOLT_TEMPLATE_BLOB = "b212efe0dcb5b8ac05ceeefad17a65f19a5f502b"


def replace_exact(path: Path, old: str, new: str, *, count: int = 1) -> None:
    text = path.read_text(encoding="utf-8")
    observed = text.count(old)
    if observed != count:
        raise SystemExit(f"{path}: expected {count} occurrence(s), found {observed}")
    path.write_text(text.replace(old, new, count), encoding="utf-8")


for workflow in sorted(WORKFLOW_ROOT.glob("*.yml")):
    text = workflow.read_text(encoding="utf-8")
    if OLD_NODE in text:
        workflow.write_text(text.replace(OLD_NODE, NEW_NODE), encoding="utf-8")

lock_path = ROOT / "policy" / "ci-toolchain-lock.json"
lock = json.loads(lock_path.read_text(encoding="utf-8"))
if lock.get("nodeVersion") != OLD_NODE:
    raise SystemExit(f"unexpected locked Node version: {lock.get('nodeVersion')!r}")
if lock.get("npmVersion") != "12.0.2":
    raise SystemExit(f"unexpected locked npm version: {lock.get('npmVersion')!r}")
lock["nodeVersion"] = NEW_NODE
lock["actions"]["googleapis/release-please-action"] = {
    "version": "v4",
    "sha": "cc61a07e2da466bebbc19bd7682a655e9db616a5",
}
lock["actions"]["actions/github-script"] = {
    "version": "v8",
    "sha": "5d0a6c5505dcf00cb12f1ed09dd261c769d8b353",
}
lock["dolt"] = {
    "version": DOLT_VERSION,
    "tag": f"v{DOLT_VERSION}",
    "tagCommit": DOLT_COMMIT,
    "installerTemplateBlobSha": DOLT_TEMPLATE_BLOB,
}
lock_path.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")

ci_path = WORKFLOW_ROOT / "ci.yml"
replace_exact(
    ci_path,
    '''          curl -fsSL https://github.com/dolthub/dolt/releases/latest/download/install.sh -o "$RUNNER_TEMP/install-dolt.sh"
          sudo bash "$RUNNER_TEMP/install-dolt.sh"
          dolt config --global --set user.name "github-actions[bot]"
          dolt config --global --set user.email "41898282+github-actions[bot]@users.noreply.github.com"
          dolt version
''',
    '''          dolt_version="2.3.1"
          dolt_commit="b15770fe588268027d799c11356af0ce24ba882a"
          dolt_template_blob="b212efe0dcb5b8ac05ceeefad17a65f19a5f502b"
          template="$RUNNER_TEMP/install-dolt.template.sh"
          expected="$RUNNER_TEMP/install-dolt.expected.sh"
          installer="$RUNNER_TEMP/install-dolt.sh"
          curl -fsSL "https://raw.githubusercontent.com/dolthub/dolt/$dolt_commit/go/utils/publishrelease/install.sh" -o "$template"
          test "$(git hash-object "$template")" = "$dolt_template_blob"
          sed "s/__DOLT_VERSION__/$dolt_version/g" "$template" > "$expected"
          curl -fsSL "https://github.com/dolthub/dolt/releases/download/v$dolt_version/install.sh" -o "$installer"
          cmp "$expected" "$installer"
          sudo bash "$installer"
          dolt version | grep -F "$dolt_version"
          dolt config --global --set user.name "github-actions[bot]"
          dolt config --global --set user.email "41898282+github-actions[bot]@users.noreply.github.com"
''',
)

publish_path = WORKFLOW_ROOT / "publish.yml"
replace_exact(
    publish_path,
    '''          curl -L https://github.com/dolthub/dolt/releases/latest/download/install.sh | sudo bash
          dolt version
''',
    '''          dolt_version="2.3.1"
          dolt_commit="b15770fe588268027d799c11356af0ce24ba882a"
          dolt_template_blob="b212efe0dcb5b8ac05ceeefad17a65f19a5f502b"
          template="$RUNNER_TEMP/install-dolt.template.sh"
          expected="$RUNNER_TEMP/install-dolt.expected.sh"
          installer="$RUNNER_TEMP/install-dolt.sh"
          curl -fsSL "https://raw.githubusercontent.com/dolthub/dolt/$dolt_commit/go/utils/publishrelease/install.sh" -o "$template"
          test "$(git hash-object "$template")" = "$dolt_template_blob"
          sed "s/__DOLT_VERSION__/$dolt_version/g" "$template" > "$expected"
          curl -fsSL "https://github.com/dolthub/dolt/releases/download/v$dolt_version/install.sh" -o "$installer"
          cmp "$expected" "$installer"
          sudo bash "$installer"
          dolt version | grep -F "$dolt_version"
''',
)

audit_path = ROOT / "scripts" / "workflow-action-pins.test.mjs"
audit = audit_path.read_text(encoding="utf-8")
marker = 'test("Dolt bootstrap is versioned and bound to reviewed source"'
if marker not in audit:
    audit += '''\n\ntest("Dolt bootstrap is versioned and bound to reviewed source", () => {
  const lock = loadLock();
  assert.deepEqual(lock.dolt, {
    version: "2.3.1",
    tag: "v2.3.1",
    tagCommit: "b15770fe588268027d799c11356af0ce24ba882a",
    installerTemplateBlobSha: "b212efe0dcb5b8ac05ceeefad17a65f19a5f502b",
  });

  const combined = workflowFiles().map(({ content }) => content).join("\\n");
  assert.doesNotMatch(combined, /dolthub\\/dolt\\/releases\\/latest\\//u);
  assert.ok(
    combined.includes("dolthub/dolt/releases/download/v$dolt_version/install.sh"),
    "Dolt installation must use the locked versioned release asset",
  );
  assert.ok(combined.includes(lock.dolt.tagCommit));
  assert.ok(combined.includes(lock.dolt.installerTemplateBlobSha));
  assert.ok(
    combined.includes('cmp "$expected" "$installer"'),
    "downloaded release installer must match the installer generated from locked source",
  );
});
'''
    audit_path.write_text(audit, encoding="utf-8")

ci = ci_path.read_text(encoding="utf-8")
repair_block = '''  # BEGIN PR134 REPAIR JOB
  repair-pr134:
    if: github.event_name == 'pull_request' && github.head_ref == 'agent/harden-ci-release-provenance'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    outputs:
      changed: ${{ steps.commit.outputs.changed }}
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: agent/harden-ci-release-provenance
          fetch-depth: 0
      - id: commit
        shell: bash
        run: |
          set -euo pipefail
          python ./scripts/repair-pr134.py
          git diff --check
          node --test ./scripts/workflow-action-pins.test.mjs
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A
          git commit -m "fix(ci): align pinned toolchains and Dolt source"
          git push origin HEAD:agent/harden-ci-release-provenance
          echo "changed=true" >> "$GITHUB_OUTPUT"
  # END PR134 REPAIR JOB

'''
if repair_block not in ci:
    raise SystemExit("temporary PR134 repair job not found in ci.yml")
ci = ci.replace(repair_block, "", 1)
ci = ci.replace("permissions:\n  contents: write\n", "permissions:\n  contents: read\n", 1)
ci = ci.replace(
    "  check:\n    needs: repair-pr134\n    if: always() && needs.repair-pr134.outputs.changed != 'true'\n",
    "  check:\n",
    1,
)
ci_path.write_text(ci, encoding="utf-8")

for transient in [
    WORKFLOW_ROOT / "repair-pr134.yml",
    ROOT / ".github" / "repair-pr134.trigger",
    ROOT / "scripts" / "repair-pr134.py",
]:
    transient.unlink(missing_ok=True)
