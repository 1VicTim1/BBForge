#!/usr/bin/env bash
# Builds a portable tarball for manual installation from the release .deb layout:
#   bbforge-<version>-linux-amd64/{usr/..., install.sh, uninstall.sh, LICENSE, README.txt}
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(node -p "require('$root/package.json').version")"
data="$(ls -d "$root"/target/release/bundle/deb/*/data | head -n1)"
name="bbforge-$version-linux-amd64"
out="$root/target/release/bundle/tarball"
rm -rf "$out/$name" && mkdir -p "$out/$name"
cp -r "$data/usr" "$out/$name/usr"
cp "$root/LICENSE" "$out/$name/LICENSE"
cat > "$out/$name/install.sh" <<'INSTALL'
#!/usr/bin/env sh
# Installs BBForge. Default prefix: /usr/local (needs root); use --user for ~/.local.
set -eu
prefix=/usr/local
[ "${1:-}" = "--user" ] && prefix="$HOME/.local"
[ -n "${PREFIX:-}" ] && prefix="$PREFIX"
here="$(cd -- "$(dirname -- "$0")" && pwd)"
mkdir -p "$prefix"
cp -r "$here/usr/." "$prefix/"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$prefix/share/applications" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "$prefix/share/icons/hicolor" 2>/dev/null || true
echo "BBForge installed to $prefix (run: bbforge-app)"
INSTALL
cat > "$out/$name/uninstall.sh" <<'UNINSTALL'
#!/usr/bin/env sh
set -eu
prefix=/usr/local
[ "${1:-}" = "--user" ] && prefix="$HOME/.local"
[ -n "${PREFIX:-}" ] && prefix="$PREFIX"
rm -f "$prefix/bin/bbforge-app" "$prefix/share/applications/BBForge.desktop"
find "$prefix/share/icons/hicolor" -name 'bbforge-app.png' -delete 2>/dev/null || true
echo "BBForge removed from $prefix"
UNINSTALL
cat > "$out/$name/README.txt" <<'README'
BBForge — ручная установка (Linux amd64)

Требуется WebKitGTK 4.1 и GTK 3:
  Debian/Ubuntu: sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0
  Fedora/RED OS: sudo dnf install webkit2gtk4.1 gtk3
  Arch/CachyOS:  sudo pacman -S webkit2gtk-4.1 gtk3

Установка для всех:      sudo ./install.sh
Установка в ~/.local:    ./install.sh --user
Удаление:                sudo ./uninstall.sh   (или ./uninstall.sh --user)
Запуск без установки:    ./usr/bin/bbforge-app
README
chmod +x "$out/$name/install.sh" "$out/$name/uninstall.sh"
tar -C "$out" -czf "$out/$name.tar.gz" "$name"
echo "$out/$name.tar.gz"
