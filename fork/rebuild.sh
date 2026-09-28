#!/bin/sh
# Reinstall dependencies and rebuild the app, after a pull or a rebase.
#
# Works around two install problems on this machine: npm 12 does not run
# packages' install scripts (so Electron never fetches its binary), and
# Electron's own unpacker stops after locales/ under Node 26. The binary is
# fetched with Electron's installer, checked against the checksum Electron
# ships, and unpacked with unzip. ffmpeg-static is skipped: the app falls
# back to the system ffmpeg.
set -eu
cd "$(dirname "$0")/.."

npm ci --no-audit --no-fund

electron=node_modules/electron
version=$(node -p "require('./$electron/package.json').version")
zip_name="electron-v$version-linux-x64.zip"
if [ ! -x "$electron/dist/electron" ] || [ "$(cat "$electron/dist/version" 2>/dev/null)" != "$version" ]; then
  # Downloads into ~/.cache/electron (its extraction is the broken part).
  node "$electron/install.js" || true
  zip=$(find "${electron_config_cache:-$HOME/.cache/electron}" -name "$zip_name" | head -n 1)
  [ -n "$zip" ] || { echo "Electron $version zip was not downloaded" >&2; exit 1; }
  want=$(node -p "require('./$electron/checksums.json')['$zip_name']")
  got=$(sha256sum "$zip" | cut -d' ' -f1)
  [ "$want" = "$got" ] || { echo "checksum mismatch for $zip" >&2; exit 1; }
  rm -rf "$electron/dist" && mkdir "$electron/dist"
  unzip -q "$zip" -d "$electron/dist"
  [ -f "$electron/dist/electron.d.ts" ] && mv "$electron/dist/electron.d.ts" "$electron/electron.d.ts"
  printf electron > "$electron/path.txt"
fi
echo "Electron $(cat "$electron/dist/version") ready"

npm run build
