#!/bin/sh
# Reinstall dependencies and rebuild the app, after a pull or a rebase.
#
# npm 12 does not run packages' install scripts, so Electron never fetches its
# binary: run its installer here (it verifies Electron's checksums itself).
# Under Node 26 that installer used to stop unpacking after locales/; upstream
# #41 pinned extract-zip's yauzl to 3.4, which fixed it, so the manual unzip
# this script carried is gone. ffmpeg-static's download is skipped and the
# system ffmpeg linked in its place: the app would fall back to it anyway, but
# the tests spawn ffmpeg-static's path directly.
set -eu
cd "$(dirname "$0")/.."

npm ci --no-audit --no-fund

electron=node_modules/electron
version=$(node -p "require('./$electron/package.json').version")
if [ ! -x "$electron/dist/electron" ] || [ "$(cat "$electron/dist/version" 2>/dev/null)" != "$version" ]; then
  node "$electron/install.js"
fi
[ -x "$electron/dist/electron" ] && [ "$(cat "$electron/dist/version")" = "$version" ] \
  || { echo "Electron $version did not install into $electron/dist" >&2; exit 1; }
echo "Electron $(cat "$electron/dist/version") ready"

ffmpeg=$(command -v ffmpeg) || { echo "no system ffmpeg on PATH" >&2; exit 1; }
ln -sf "$ffmpeg" node_modules/ffmpeg-static/ffmpeg

npm run build
