#!/usr/bin/env bash
# summary: "Builds and stages the reproducible Linux x64 GTK layer-shell panel artifact."
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PANEL_DIR="$ROOT_DIR/native/panel"
ARTIFACT_DIR="$ROOT_DIR/native/bin/linux-x64-gnu"
BINARY_NAME="pi-activity-strip-panel"
TOOLCHAIN="${PI_ACTIVITY_STRIP_RUST_TOOLCHAIN:-stable}"

if [[ "$(uname -s)" != "Linux" || "$(uname -m)" != "x86_64" ]]; then
  echo "native panel staging currently supports only Linux x86_64" >&2
  exit 1
fi

(
  cd "$PANEL_DIR"
  RUSTUP_TOOLCHAIN="$TOOLCHAIN" cargo fmt --check
  RUSTUP_TOOLCHAIN="$TOOLCHAIN" cargo test
  RUSTUP_TOOLCHAIN="$TOOLCHAIN" cargo build --release --locked
)

mkdir -p "$ARTIFACT_DIR"
install -m 0755 "$PANEL_DIR/target/release/$BINARY_NAME" "$ARTIFACT_DIR/$BINARY_NAME"

binary_sha="$(sha256sum "$ARTIFACT_DIR/$BINARY_NAME" | awk '{print $1}')"
lock_sha="$(sha256sum "$PANEL_DIR/Cargo.lock" | awk '{print $1}')"
rustc_version="$(RUSTUP_TOOLCHAIN="$TOOLCHAIN" rustc --version)"
if [[ "$rustc_version" != "rustc 1.98.0 "* ]]; then
  echo "native panel release requires Rust 1.98.0, got: $rustc_version" >&2
  exit 1
fi
source_sha="$(cd "$PANEL_DIR" && find Cargo.toml Cargo.lock src -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"
glibc_floor="$(objdump -T "$ARTIFACT_DIR/$BINARY_NAME" | grep -Eo 'GLIBC_[0-9.]+' | sort -V | tail -1)"
needed_sonames="$(
  readelf -d "$ARTIFACT_DIR/$BINARY_NAME" \
    | awk '/NEEDED/ {gsub(/\[|\]/, "", $5); print $5}' \
    | jq -R . \
    | jq -s .
)"

jq -n \
  --arg sha256 "$binary_sha" \
  --arg cargoLockSha256 "$lock_sha" \
  --arg sourceSha256 "$source_sha" \
  --arg rustc "$rustc_version" \
  --arg glibcFloor "$glibc_floor" \
  --argjson neededSonames "$needed_sonames" \
  '{
    schema: "pi-activity-strip-native-artifact.v1",
    target: "x86_64-unknown-linux-gnu",
    sha256: $sha256,
    cargoLockSha256: $cargoLockSha256,
    sourceSha256: $sourceSha256,
    rustc: $rustc,
    glibcFloor: $glibcFloor,
    neededSonames: $neededSonames
  }' >"$ARTIFACT_DIR/artifact.json"

printf 'staged %s (%s)\n' "$ARTIFACT_DIR/$BINARY_NAME" "$binary_sha"
