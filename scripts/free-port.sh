#!/bin/bash
# =============================================================================
# free-port.sh — release a TCP port (host or container, host-network aware)
#
# Usage: free-port.sh <port>
# =============================================================================

free_port() {
  local port=$1
  local killed=0

  # fuser (psmisc) — most reliable on Linux
  if command -v fuser >/dev/null 2>&1; then
    if fuser "${port}/tcp" >/dev/null 2>&1; then
      echo "[free-port] stopping process(es) on port ${port} (fuser)..."
      fuser -k "${port}/tcp" >/dev/null 2>&1 || true
      killed=1
    fi
  fi

  # lsof fallback
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -ti:"${port}" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "[free-port] stopping process(es) on port ${port} (pids: ${pids})..."
      kill $pids 2>/dev/null || true
      sleep 0.3
      # force-kill survivors
      pids=$(lsof -ti:"${port}" 2>/dev/null || true)
      [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
      killed=1
    fi
  fi

  # ss + /proc fallback (no extra packages needed)
  if command -v ss >/dev/null 2>&1; then
    local line pid
    line=$(ss -tlnp "sport = :${port}" 2>/dev/null | grep -v "^State" | head -1 || true)
    if [ -n "$line" ]; then
      pid=$(echo "$line" | sed -n 's/.*pid=\([0-9]*\).*/\1/p')
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        echo "[free-port] stopping pid ${pid} on port ${port} (ss)..."
        kill "$pid" 2>/dev/null || true
        sleep 0.3
        kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
        killed=1
      fi
    fi
  fi

  if [ "$killed" -eq 1 ]; then
    sleep 0.5
  fi
}

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  if [ $# -ne 1 ]; then
    echo "usage: $0 <port>" >&2
    exit 1
  fi
  free_port "$1"
fi
