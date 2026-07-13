#!/bin/bash
# =============================================================================
# setup.sh - install project dependencies (npm + cargo fetch)
#
# Linux system packages live in docker/dockerfile (rebuild image to update).
# Run this before dev/build when entering the container for the first time,
# or when package.json / Cargo.toml changes.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\033[1;36m[setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[setup]\033[0m %s\n' "$*"; }

command -v node >/dev/null 2>&1 || warn "node not found on PATH (use the dev container)."
command -v cargo >/dev/null 2>&1 || warn "cargo not found on PATH (use the dev container)."

if command -v npm >/dev/null 2>&1; then
  log "Installing frontend dependencies (npm install)..."
  # --no-audit/--no-fund: quiet known Vite 5 / esbuild advisories (fix needs a
  # major Vite bump) and funding noise on every ./run.sh dev.
  npm install --no-audit --no-fund
else
  warn "npm unavailable; skipping frontend install."
fi

if command -v cargo >/dev/null 2>&1; then
  log "Fetching Rust dependencies..."
  (cd src-tauri && cargo fetch)
fi

log "Setup complete."
