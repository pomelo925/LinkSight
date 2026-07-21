#!/bin/bash
# =============================================================================
# LinkSight - Docker development environment launcher
#
#   ./run.sh dev   → start container + launch Tauri app (cargo tauri dev)
#   ./run.sh shell → interactive container shell (debugging)
# =============================================================================

set -euo pipefail

usage() {
  echo "usage: $0 <service>"
  echo ""
  echo "service:"
  echo "  dev      Start container and launch LinkSight (cargo tauri dev)"
  echo "  shell    Start container and drop into an interactive shell"
  echo "  build    Build production artifacts (AppImage / deb / rpm)"
  echo "  down     Stop and remove the dev container"
  echo ""
  echo "Examples:"
  echo "  $0 dev      # One command — desktop app pops up with hot reload"
  echo "  $0 shell    # Enter container for debugging"
  echo "  $0 build    # Production build inside container"
  exit 1
}

if [ $# -ne 1 ]; then
  echo "Error: exactly one service argument is required."
  usage
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker/compose.yaml"
PROJECT_NAME="linksight"
SERVICE="dev"
CONTAINER_NAME="${PROJECT_NAME}-dev"
IMAGE_NAME="pomelo925/linksight:dev"

# shellcheck source=scripts/free-port.sh
source "$SCRIPT_DIR/scripts/free-port.sh"
# shellcheck source=scripts/install-dev-desktop.sh
source "$SCRIPT_DIR/scripts/install-dev-desktop.sh"

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

start_container() {
  local recycle="${1:-false}"

  # Compose volume changes (e.g. docker.sock) require recreate — detect a stale
  # container that is missing the host Docker socket mount.
  if [ "$recycle" != true ] && docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    if ! docker exec "$CONTAINER_NAME" test -S /var/run/docker.sock 2>/dev/null; then
      echo "Dev container is missing /var/run/docker.sock — recreating to pick up compose mounts..."
      recycle=true
    fi
  fi

  if [ "$recycle" = true ] && docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    echo "Existing container detected ($CONTAINER_NAME) — stopping (grace 1s) and removing..."
    docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down --remove-orphans
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi

  free_port 1420

  local build_args=()
  if docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo "Using existing image $IMAGE_NAME (skip build)."
  else
    echo "Image $IMAGE_NAME not found locally — building..."
    build_args=(--build)
  fi

  echo "Starting LinkSight dev container..."
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d "${build_args[@]}" "$SERVICE"
  sleep 2
}

case "$ACTION" in
  dev)
    setup_x11
    install_linksight_dev_desktop "$SCRIPT_DIR"
    start_container true
    echo "Launching LinkSight (cargo tauri dev)..."
    echo "Press Ctrl+C to stop. The desktop window will open automatically."
    docker exec -it "$CONTAINER_NAME" bash -lc "./scripts/setup.sh && ./scripts/dev.sh"
    ;;
  shell)
    setup_x11
    start_container
    echo "Entering container ($CONTAINER_NAME)..."
    docker exec -it "$CONTAINER_NAME" /bin/bash
    ;;
  build)
    setup_x11
    start_container
    docker exec -it "$CONTAINER_NAME" bash -lc "./scripts/setup.sh && ./scripts/build.sh"
    ;;
  down)
    free_port 1420
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
