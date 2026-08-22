#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAR="${TLA2TOOLS_JAR:-}"
if [[ -z "$JAR" || ! -f "$JAR" ]]; then
  echo "error: set TLA2TOOLS_JAR to the official TLA+ v1.7.4 tla2tools.jar" >&2
  exit 1
fi
expected_sha1="bee4a54f3ee3d4afc347c3240ec2d9e93b075104"
actual_sha1="$(sha1sum "$JAR" | awk '{print $1}')"
if [[ "$actual_sha1" != "$expected_sha1" ]]; then
  echo "error: tla2tools.jar SHA-1 mismatch: $actual_sha1" >&2
  exit 1
fi
cd "$ROOT_DIR/formal"
for model in PiToolBoundaryV03 ControllerSafety; do
  echo "==> validating ${model}.tla"
  java -cp "$JAR" tla2sany.SANY "${model}.tla"
  echo "==> model checking ${model}.tla"
  java -XX:+UseParallelGC -Xmx2g -jar "$JAR" \
    -config "${model}.cfg" \
    -workers 1 \
    -deadlock \
    "${model}.tla"
done
