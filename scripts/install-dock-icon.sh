#!/bin/bash
# Install the G-Schlange (Snack) app icon into the Safari Web App / Dock entry.
#
# Source of truth: assets/app-icon.png
# Pipeline:
#   1. prepare-mac-icon.py — scale + macOS squircle mask (transparent corners)
#   2. Build .icns + web favicons from the prepared master
#   3. Set icon on ~/Applications/Glyph UI.app (or APP_PATH)
#
# Env:
#   APP_PATH     override app bundle
#   ICON_SCALE   content scale 0.5–1.0 (default 0.82 — optical inset so the
#                glyph matches other Dock / Web-App icons; 1.0 = full-bleed)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_RAW="$ROOT/assets/app-icon.png"
PREPARE="$ROOT/scripts/prepare-mac-icon.py"
ICONSET="$ROOT/scripts/assets/AppIcon.iconset"
ICNS="$ROOT/scripts/assets/AppIcon.icns"
MASTER="$ROOT/scripts/assets/AppIcon-1024.png"
APP="${APP_PATH:-$HOME/Applications/Glyph UI.app}"
# Optical inset inside the icon window (plate stays dark to the squircle edge).
# 0.82 = slightly smaller G-snake; ring filled with plate color (not white).
ICON_SCALE="${ICON_SCALE:-0.82}"

if [[ ! -f "$SRC_RAW" ]]; then
  echo "Missing master icon: $SRC_RAW" >&2
  exit 1
fi
if ! python3 -c 'from PIL import Image' 2>/dev/null; then
  echo "Pillow required: python3 -m pip install pillow" >&2
  exit 1
fi

echo "→ Preparing macOS Dock icon (scale=${ICON_SCALE}, rounded corners)…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PREPARED="$TMP/app-icon-mac.png"
python3 "$PREPARE" "$SRC_RAW" "$PREPARED" --size 1024 --scale "$ICON_SCALE"

# Also refresh the checked-in 1024 master used by iconutil / setIcon
mkdir -p "$ROOT/scripts/assets"
cp "$PREPARED" "$MASTER"
# Keep assets/ApplicationIcon source in sync as PNG+icns
cp "$PREPARED" "$ROOT/assets/app-icon-mac.png"

echo "→ Building iconset…"
declare -a SIZES=(
  "16:icon_16x16.png"
  "32:icon_16x16@2x.png"
  "32:icon_32x32.png"
  "64:icon_32x32@2x.png"
  "128:icon_128x128.png"
  "256:icon_128x128@2x.png"
  "256:icon_256x256.png"
  "512:icon_256x256@2x.png"
  "512:icon_512x512.png"
  "1024:icon_512x512@2x.png"
)
for entry in "${SIZES[@]}"; do
  sz="${entry%%:*}"
  name="${entry#*:}"
  # Re-apply mask at each size so small icons keep clean AA corners
  python3 "$PREPARE" "$SRC_RAW" "$TMP/$name" --size "$sz" --scale "$ICON_SCALE"
done

rm -rf "$ICONSET"
mkdir -p "$(dirname "$ICONSET")"
# Copy prepared sizes into iconset (exclude temp master name)
mkdir -p "$ICONSET"
for entry in "${SIZES[@]}"; do
  name="${entry#*:}"
  cp "$TMP/$name" "$ICONSET/$name"
done
iconutil -c icns "$ICONSET" -o "$ICNS"
cp "$ICNS" "$ROOT/assets/ApplicationIcon.icns"

echo "→ Web / PWA icons…"
mkdir -p "$ROOT/client/public"
# PWA / apple-touch already expect rounded presentation — use prepared master
sips -z 180 180 "$PREPARED" --out "$ROOT/client/public/apple-touch-icon.png" >/dev/null
sips -z 32 32 "$PREPARED" --out "$ROOT/client/public/favicon-32.png" >/dev/null
sips -z 192 192 "$PREPARED" --out "$ROOT/client/public/icon-192.png" >/dev/null
sips -z 512 512 "$PREPARED" --out "$ROOT/client/public/icon-512.png" >/dev/null

python3 - <<PY
from PIL import Image
im = Image.open("$PREPARED").convert("RGBA")
sizes = [(16, 16), (32, 32), (48, 48)]
imgs = [im.resize(s, Image.Resampling.LANCZOS) for s in sizes]
imgs[0].save("$ROOT/client/public/favicon.ico", format="ICO", sizes=sizes)
PY

if [[ -d "$ROOT/client/dist" ]]; then
  cp "$ROOT/client/public/apple-touch-icon.png" \
    "$ROOT/client/public/favicon-32.png" \
    "$ROOT/client/public/favicon.ico" \
    "$ROOT/client/public/icon-192.png" \
    "$ROOT/client/public/icon-512.png" \
    "$ROOT/client/dist/" 2>/dev/null || true
  if [[ -f "$ROOT/client/public/site.webmanifest" ]]; then
    cp "$ROOT/client/public/site.webmanifest" "$ROOT/client/dist/" 2>/dev/null || true
  fi
fi

if [[ ! -d "$APP" ]]; then
  echo "WARN: App not found: $APP" >&2
  echo "  Open Safari → http://127.0.0.1:5174 → File → Add to Dock, then re-run." >&2
  exit 0
fi

echo "→ Installing into $APP …"
mkdir -p "$APP/Contents/Resources"
cp "$ICNS" "$APP/Contents/Resources/ApplicationIcon.icns"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $(date +%s)" "$APP/Contents/Info.plist" 2>/dev/null || true

# Custom icon (resource fork) — what Finder/Dock often display for Web Apps.
# Use the *prepared* PNG (rounded + scaled), not the raw square master.
osascript -l JavaScript - "$APP" "$PREPARED" <<'JXA'
ObjC.import('AppKit');
const app = $.NSProcessInfo.processInfo.arguments.objectAtIndex(4).js;
const png = $.NSProcessInfo.processInfo.arguments.objectAtIndex(5).js;
const img = $.NSImage.alloc.initWithContentsOfFile(png);
const ok = $.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, app, 0);
console.log('setIcon: ' + ok);
JXA

touch "$APP"
LS=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$LS" -f "$APP" 2>/dev/null || true

# User-level icon cache + Dock refresh
rm -rf "$HOME/Library/Caches/com.apple.iconservices.store" 2>/dev/null || true
killall iconservicesagent 2>/dev/null || true
killall Dock 2>/dev/null || true

echo
echo "G-Schlange icon installed (macOS rounded + scaled)."
echo "  App:     $APP"
echo "  Master:  $SRC_RAW"
echo "  Prepared:$MASTER  (scale=$ICON_SCALE)"
echo "If Dock still shows the old icon: right-click app → Options → Remove from Dock,"
echo "then open the app once from ~/Applications and re-pin it."
