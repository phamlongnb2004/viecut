#!/bin/sh
# Cài VIECUT cho người dùng hiện tại (không cần sudo)
set -e
D=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/viecut.desktop" <<EOD
[Desktop Entry]
Name=VIECUT
Comment=Edit video
Exec="$D/viecut" --no-sandbox %U
Icon=$D/icon.png
Terminal=false
Type=Application
Categories=AudioVideo;Video;
EOD
echo "Đã thêm VIECUT vào menu ứng dụng. Chạy trực tiếp: $D/viecut"
