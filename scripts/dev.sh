#!/bin/bash
# =============================================================================
# dev.sh - start the LinkSight app in development mode
#
# Runs the Tauri dev flow: `cargo tauri dev` boots the Vite dev server
# (frontend) and the Rust backend together with hot reload.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\033[1;36m[dev]\033[0m %s\n' "$*"; }

if [ ! -d node_modules ]; then
  log "node_modules missing; running setup first..."
  ./scripts/setup.sh
fi

log "Launching Tauri dev (frontend + backend, hot reload)..."
if command -v cargo-tauri >/dev/null 2>&1 || cargo tauri --version >/dev/null 2>&1; then
  cargo tauri dev
else
  log "tauri-cli not found; falling back to Vite-only frontend dev server."
  npm run dev
fi
