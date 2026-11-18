#!/bin/bash
set -euo pipefail
cipher_target=${1:?Pass an app, zip or disk image path.}
: "${CIPHER_NOTARY_PROFILE:?Configure a notarytool keychain profile first.}"
[ -e "$cipher_target" ] || { echo 'Notarization target does not exist.' >&2; exit 1; }
cipher_upload="$cipher_target"
cipher_temp=''
trap '[ -z "$cipher_temp" ] || rm -rf "$cipher_temp"' EXIT
if [[ "$cipher_target" == *.app ]]; then
  codesign --verify --deep --strict "$cipher_target"
  codesign -dv "$cipher_target" 2>&1 | grep -q 'Authority=Developer ID Application:' || { echo 'Developer ID Application signing is required.' >&2; exit 1; }
  cipher_temp=$(mktemp -d)
  cipher_upload="$cipher_temp/Cipher.zip"
  ditto -c -k --keepParent "$cipher_target" "$cipher_upload"
fi
cipher_keychain_args=()
if [ -n "${CIPHER_NOTARY_KEYCHAIN:-}" ]; then cipher_keychain_args=(--keychain "$CIPHER_NOTARY_KEYCHAIN"); fi
xcrun notarytool submit "$cipher_upload" --keychain-profile "$CIPHER_NOTARY_PROFILE" "${cipher_keychain_args[@]}" --wait --timeout 30m
case "$cipher_target" in
  *.app|*.dmg) xcrun stapler staple "$cipher_target"; xcrun stapler validate "$cipher_target" ;;
esac
if [[ "$cipher_target" == *.app ]]; then spctl --assess --type execute --verbose=2 "$cipher_target"; fi
