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

# shellcheck source=free-port.sh
source "$ROOT_DIR/scripts/free-port.sh"
# shellcheck source=install-dev-desktop.sh
source "$ROOT_DIR/scripts/install-dev-desktop.sh"

log() { printf '\033[1;36m[dev]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[dev]\033[0m %s\n' "$*"; }

if [ ! -d node_modules ]; then
  log "node_modules missing; running setup first..."
  ./scripts/setup.sh
fi

# Tauri runs `beforeDevCommand` (npm run dev) itself — port 1420 must be free.
# this call catches processes started inside a previous container session.
free_port 1420

if ! command -v cargo >/dev/null 2>&1; then
  warn "cargo not found — cannot start Tauri backend."
  warn "Use the dev container: ./run.sh dev"
  exit 1
fi

log "Launching Tauri dev (frontend + backend, hot reload)..."
log "The LinkSight desktop window will open automatically."

install_linksight_dev_desktop "$ROOT_DIR"

if command -v cargo-tauri >/dev/null 2>&1 || cargo tauri --version >/dev/null 2>&1; then
  cargo tauri dev
else
  warn "tauri-cli not found; falling back to Vite-only (backend commands will NOT work)."
  npm run dev
fi
