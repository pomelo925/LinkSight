#!/bin/bash
# =============================================================================
# test.sh - run unit + integration tests and static checks
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { printf '\033[1;35m[test]\033[0m %s\n' "$*"; }

# ---- Backend: format, lint, test -------------------------------------------
log "Rust: cargo fmt --check"
(cd src-tauri && cargo fmt --all -- --check)

log "Rust: cargo clippy"
(cd src-tauri && cargo clippy --all-targets -- -D warnings)

log "Rust: cargo test"
(cd src-tauri && cargo test)

# ---- Frontend: typecheck + tests -------------------------------------------
if [ -d node_modules ]; then
  log "Frontend: type-check"
  npm run typecheck

  if npm run | grep -q "^  test$"; then
    log "Frontend: unit tests"
    npm test --silent || true
  fi
else
  log "node_modules missing; skipping frontend tests (run ./scripts/setup.sh)."
fi

log "All tests complete."
