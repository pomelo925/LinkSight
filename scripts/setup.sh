#!/bin/bash
# =============================================================================
# setup.sh - install project dependencies & prepare the dev environment
#
# Idempotent. Safe to run on the host (if toolchains are installed) or inside
# the LinkSight dev container.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\033[1;36m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[setup]\033[0m %s\n' "$*"; }

# ---- Sanity: required toolchains -------------------------------------------
command -v node >/dev/null 2>&1 || warn "node not found on PATH (use the dev container)."
command -v cargo >/dev/null 2>&1 || warn "cargo not found on PATH (use the dev container)."

# ---- Frontend deps ----------------------------------------------------------
if command -v npm >/dev/null 2>&1; then
  log "Installing frontend dependencies (npm install)..."
  npm install
else
  warn "npm unavailable; skipping frontend install."
fi

# ---- Backend deps (fetch crates ahead of time) ------------------------------
if command -v cargo >/dev/null 2>&1; then
  log "Fetching Rust dependencies..."
  (cd src-tauri && cargo fetch)
fi

log "Setup complete. Start development with: ./scripts/dev.sh"
