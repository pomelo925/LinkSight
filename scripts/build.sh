#!/bin/bash
# =============================================================================
# build.sh - build the production desktop application
#
# Produces the Linux bundles configured in src-tauri/tauri.conf.json
# (AppImage is the primary distribution format; deb also produced).
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\033[1;32m[build]\033[0m %s\n' "$*"; }

if [ ! -d node_modules ]; then
  log "node_modules missing; running setup first..."
  ./scripts/setup.sh
fi

log "Building production bundles (AppImage / deb)..."
cargo tauri build

log "Build complete. Artifacts:"
BUNDLE_DIR="src-tauri/target/release/bundle"
if [ -d "$BUNDLE_DIR" ]; then
  find "$BUNDLE_DIR" -type f \( -name '*.AppImage' -o -name '*.deb' \) -print
else
  log "No bundle directory found at $BUNDLE_DIR"
fi
