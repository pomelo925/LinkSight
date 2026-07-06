#!/bin/bash
# Register a local .desktop entry so GNOME/KDE can show the LinkSight icon
# in the dock during development (matches WM_CLASS=linksight).
install_linksight_dev_desktop() {
  local root="${1:?project root required}"
  local icon_path="$root/src-tauri/icons/icon.png"
  local desktop_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  local desktop_file="$desktop_dir/linksight-dev.desktop"

  if [ ! -f "$icon_path" ]; then
    printf '[desktop] icon not found at %s — skipping dock entry\n' "$icon_path" >&2
    return 0
  fi

  mkdir -p "$desktop_dir"
  cat >"$desktop_file" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=LinkSight
Comment=LinkSight network diagnostics (development)
Icon=$icon_path
StartupWMClass=linksight
Terminal=false
NoDisplay=true
EOF

  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$desktop_dir" >/dev/null 2>&1 || true
  fi

  printf '[desktop] registered %s\n' "$desktop_file"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  install_linksight_dev_desktop "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
