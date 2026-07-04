#!/bin/bash
# =============================================================================
# release.sh - build artifacts and stage them for a GitHub release
#
# Usage: ./scripts/release.sh [version]
#   version defaults to the version in src-tauri/tauri.conf.json
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\033[1;34m[release]\033[0m %s\n' "$*"; }

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  VERSION="$(grep -m1 '"version"' src-tauri/tauri.conf.json | sed -E 's/.*"version"\s*:\s*"([^"]+)".*/\1/')"
fi
log "Preparing release v${VERSION}"

# ---- Build ------------------------------------------------------------------
./scripts/build.sh

# ---- Collect artifacts ------------------------------------------------------
OUT_DIR="release/v${VERSION}"
mkdir -p "$OUT_DIR"
BUNDLE_DIR="src-tauri/target/release/bundle"

log "Collecting artifacts into $OUT_DIR"
find "$BUNDLE_DIR" -type f \( -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' \) \
  -exec cp -v {} "$OUT_DIR/" \;

# ---- Checksums --------------------------------------------------------------
( cd "$OUT_DIR" && sha256sum ./* > SHA256SUMS.txt )
log "Checksums written to $OUT_DIR/SHA256SUMS.txt"

# ---- Optional: publish via gh -----------------------------------------------
if command -v gh >/dev/null 2>&1; then
  log "GitHub CLI detected. To publish, run:"
  echo "  gh release create v${VERSION} $OUT_DIR/* --title \"LinkSight v${VERSION}\" --generate-notes"
else
  log "Install GitHub CLI (gh) to publish the release automatically."
fi

log "Release artifacts ready in $OUT_DIR"
