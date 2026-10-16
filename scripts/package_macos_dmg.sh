#!/usr/bin/env bash
set -euo pipefail

APP_PATH="${1:?usage: package_macos_dmg.sh APP_PATH OUTPUT_DIR}"
OUTPUT_DIR="${2:?usage: package_macos_dmg.sh APP_PATH OUTPUT_DIR}"
ENTITLEMENTS="${3:-}"
APP_PATH="$(cd "$(dirname "$APP_PATH")" && pwd)/$(basename "$APP_PATH")"
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd)"
test -d "$APP_PATH/Contents/MacOS" || { echo "Missing macOS app bundle: $APP_PATH" >&2; exit 1; }

EXECUTABLE="$(find "$APP_PATH/Contents/MacOS" -maxdepth 1 -type f -print -quit)"
test -n "$EXECUTABLE" || { echo "Missing app executable" >&2; exit 1; }
ARCHS="$(lipo -archs "$EXECUTABLE" | tr ' ' '\n' | sort -u | paste -sd, -)"
test -n "$ARCHS" || { echo "Could not read app architectures" >&2; exit 1; }
for arch in ${ARCHS//,/ }; do
  case "$arch" in arm64|x86_64) ;; *) echo "Unsupported macOS architecture: $arch" >&2; exit 1 ;; esac
done

if [[ -n "$ENTITLEMENTS" && -f "$ENTITLEMENTS" ]]; then
  codesign --force --deep --sign - --entitlements "$ENTITLEMENTS" "$APP_PATH"
else
  codesign --force --deep --sign - "$APP_PATH"
fi
codesign --verify --deep --strict "$APP_PATH"

DMG="$OUTPUT_DIR/MA-TV-macOS-Unsigned.dmg"
hdiutil create -volname "MA TV" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG" >/dev/null
shasum -a 256 "$DMG" > "$DMG.sha256"
python3 - "$APP_PATH" "$DMG" "$ARCHS" "$OUTPUT_DIR/macOS-report.json" <<'PY'
import hashlib
import json
import plistlib
import sys
from pathlib import Path

app = Path(sys.argv[1])
dmg = Path(sys.argv[2])
architectures = sys.argv[3].split(',')
report = Path(sys.argv[4])
with (app / 'Contents/Info.plist').open('rb') as stream:
    info = plistlib.load(stream)
assert info.get('CFBundleDisplayName') == 'MA TV', 'Wrong app display name'
assert info.get('CFBundleIdentifier') == 'com.mitv.mitv', 'Wrong bundle identifier'
assert set(architectures) <= {'arm64', 'x86_64'}
assert architectures, 'No supported macOS architecture'
report.write_text(json.dumps({
    'product': 'MA TV OFFICIAL',
    'version': info.get('CFBundleShortVersionString'),
    'build': info.get('CFBundleVersion'),
    'architectures': architectures,
    'dmg': dmg.name,
    'sha256': hashlib.sha256(dmg.read_bytes()).hexdigest(),
    'signature': 'ad-hoc; no Apple developer certificate',
    'notarized': False,
}, indent=2) + '\n', encoding='utf-8')
PY
