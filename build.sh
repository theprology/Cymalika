#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p 'build/CyMalika.app/Contents/MacOS' 'build/CyMalika.app/Contents/Resources/web'
cp source/CyMalika.swift build/main.swift
xcrun swiftc -swift-version 5 -O -target "${CYMALIKA_ARCH:-arm64}-apple-macosx13.0" -framework IOKit -framework AppKit -framework WebKit -framework CryptoKit -framework ApplicationServices -framework ScreenCaptureKit build/main.swift source/Advanced.swift source/Streams.swift source/Coffee.swift source/ModelLibrary.swift -o 'build/CyMalika.app/Contents/MacOS/CyMalika'
cp source/web/* 'build/CyMalika.app/Contents/Resources/web/'
python3 - <<'PYBUNDLE'
from pathlib import Path
web=Path('build/CyMalika.app/Contents/Resources/web')
engine=(web/'engine.mjs').read_text().replace('export const ', 'const ').replace('export function ', 'function ')
markdown=(web/'markdown.mjs').read_text().replace('export function ', 'function ')
advanced=(web/'advanced-engine.mjs').read_text().replace('export const ', 'const ').replace('export function ', 'function ')
features=(web/'features.mjs').read_text()
app=(web/'app.mjs').read_text()
(web/'app.bundle.js').write_text(engine+'\n'+markdown+'\n'+advanced+'\n'+app+'\n'+features+'\n'+(web/'model-library.mjs').read_text())
index=web/'index.html'
index.write_text(index.read_text().replace('<script type="module" src="app.mjs"></script>','<script src="app.bundle.js"></script>'))
PYBUNDLE
cat > 'build/CyMalika.app/Contents/Info.plist' <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleInfoDictionaryVersion</key><string>6.0</string><key>CFBundleExecutable</key><string>CyMalika</string><key>CFBundleIdentifier</key><string>local.cipher.coding</string><key>CFBundleName</key><string>CyMalika</string><key>CFBundleDisplayName</key><string>CyMalika</string><key>CFBundleIconFile</key><string>CyMalika.icns</string><key>CFBundleVersion</key><string>20</string><key>CFBundleShortVersionString</key><string>0.6.3</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>NSCameraUsageDescription</key><string>CyMalika asks you before allowing an approved website to use the camera.</string><key>NSMicrophoneUsageDescription</key><string>CyMalika asks you before allowing an approved website to use the microphone.</string><key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>
PLIST
cp source/CyMalika.icns 'build/CyMalika.app/Contents/Resources/CyMalika.icns'
if [[ -n "${CYMALIKA_SIGN_IDENTITY:-}" ]]; then
  [[ "$CYMALIKA_SIGN_IDENTITY" == "Developer ID Application:"* ]] || { echo 'A Developer ID Application identity is required.' >&2; exit 1; }
  codesign --force --options runtime --timestamp --sign "$CYMALIKA_SIGN_IDENTITY" 'build/CyMalika.app'
else
  [[ "${CYMALIKA_REQUIRE_SIGNING:-0}" != 1 ]] || { echo 'Release signing identity is missing.' >&2; exit 1; }
  codesign --force --deep --sign - 'build/CyMalika.app'
fi
codesign --verify --deep --strict 'build/CyMalika.app'
'build/CyMalika.app/Contents/MacOS/CyMalika' --self-test
