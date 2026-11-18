#!/bin/bash
set -euo pipefail
cipher_target=${1:?Pass an app, zip or disk image path.}
cipher_auth_args=()
if [ -n "${CIPHER_NOTARY_PROFILE:-}" ]; then
  cipher_auth_args=(--keychain-profile "$CIPHER_NOTARY_PROFILE")
else
  : "${CIPHER_NOTARY_KEY:?Configure a notarytool profile or an existing authorized API key.}"
  : "${CIPHER_NOTARY_KEY_ID:?Set the Apple API key ID.}"
  : "${CIPHER_NOTARY_ISSUER:?Set the Apple API issuer ID.}"
  cipher_auth_args=(--key "$CIPHER_NOTARY_KEY" --key-id "$CIPHER_NOTARY_KEY_ID" --issuer "$CIPHER_NOTARY_ISSUER")
fi
[ -e "$cipher_target" ] || { echo 'Notarization target does not exist.' >&2; exit 1; }
cipher_upload="$cipher_target"
cipher_temp=''
trap '[ -z "$cipher_temp" ] || rm -rf "$cipher_temp"' EXIT
if [[ "$cipher_target" == *.app ]]; then
  codesign --verify --deep --strict "$cipher_target"
  cipher_signature=$(codesign -dv --verbose=2 "$cipher_target" 2>&1)
  [[ "$cipher_signature" == *'Authority=Developer ID Application:'* ]] || { echo 'Developer ID Application signing is required.' >&2; exit 1; }
  cipher_temp=$(mktemp -d)
  cipher_upload="$cipher_temp/Cipher.zip"
  ditto -c -k --keepParent "$cipher_target" "$cipher_upload"
fi
if [ -n "${CIPHER_NOTARY_KEYCHAIN:-}" ]; then cipher_auth_args+=(--keychain "$CIPHER_NOTARY_KEYCHAIN"); fi
xcrun notarytool submit "$cipher_upload" "${cipher_auth_args[@]}" --wait --timeout 30m
case "$cipher_target" in
  *.app|*.dmg) xcrun stapler staple "$cipher_target"; xcrun stapler validate "$cipher_target" ;;
esac
if [[ "$cipher_target" == *.app ]]; then spctl --assess --type execute --verbose=2 "$cipher_target"; fi
