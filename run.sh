#!/bin/bash
# =============================================================================
# LinkSight - Docker development environment launcher
#
#   - single entrypoint wrapping docker compose
#   - X11 forwarding so the Tauri GUI can render from inside the container
# =============================================================================

set -euo pipefail

usage() {
  echo "usage: $0 <service>"
  echo ""
  echo "service:"
  echo "  dev      Start the dev container and drop into an interactive shell"
  echo "  build    Start the dev container and build production artifacts"
  echo "  shell    Alias for 'dev' (interactive shell)"
  echo "  down     Stop and remove the dev container"
  echo ""
  echo "Examples:"
  echo "  $0 dev      # Interactive development shell (frontend + backend)"
  echo "  $0 build    # Produce AppImage / deb / rpm inside the container"
  exit 1
}

if [ $# -ne 1 ]; then
  echo "Error: exactly one service argument is required."
  usage
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker/docker-compose.yml"
PROJECT_NAME="linksight"
SERVICE="dev"
CONTAINER_NAME="${PROJECT_NAME}-dev"

ACTION=$1

# ---- X11 forwarding (required for the Tauri desktop window) -----------------
setup_x11() {
  echo "Setting up X11 forwarding..."
  if [ -z "${DISPLAY:-}" ]; then
    echo "WARNING: DISPLAY is not set. The desktop GUI may not render."
  fi
  if [ -z "${XAUTHORITY:-}" ]; then
    export XAUTHORITY="$HOME/.Xauthority"
  fi
  if [ ! -f "$XAUTHORITY" ]; then
    touch "$XAUTHORITY"
    if [ -n "${DISPLAY:-}" ]; then
      xauth nlist "$DISPLAY" | sed -e 's/^..../ffff/' | xauth -f "$XAUTHORITY" nmerge - 2>/dev/null || true
    fi
  fi
  xhost +local:docker >/dev/null 2>&1 || true
  export DISPLAY="${DISPLAY:-:0}"
  export XAUTHORITY
}

case "$ACTION" in
  dev|shell)
    setup_x11
    echo "Starting LinkSight dev container..."
    docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d "$SERVICE"
    sleep 2
    echo "Entering container ($CONTAINER_NAME)..."
    docker exec -it "$CONTAINER_NAME" /bin/bash
    ;;
  build)
    setup_x11
    echo "Starting LinkSight dev container for a production build..."
    docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d "$SERVICE"
    sleep 2
    docker exec -it "$CONTAINER_NAME" bash -lc "./scripts/build.sh"
    ;;
  down)
    docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down --remove-orphans
    echo "LinkSight dev container stopped."
    exit 0
    ;;
  *)
    echo "Error: invalid service '$ACTION'."
    usage
    ;;
esac

echo "Session ended."
echo "To stop the container, run: $0 down"
