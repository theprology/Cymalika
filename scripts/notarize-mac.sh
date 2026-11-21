#!/bin/bash
set -euo pipefail
cymalika_target=${1:?Pass an app, zip or disk image path.}
cymalika_auth_args=()
if [ -n "${CYMALIKA_NOTARY_PROFILE:-}" ]; then
  cymalika_auth_args=(--keychain-profile "$CYMALIKA_NOTARY_PROFILE")
else
  : "${CYMALIKA_NOTARY_KEY:?Configure a notarytool profile or an existing authorized API key.}"
  : "${CYMALIKA_NOTARY_KEY_ID:?Set the Apple API key ID.}"
  : "${CYMALIKA_NOTARY_ISSUER:?Set the Apple API issuer ID.}"
  cymalika_auth_args=(--key "$CYMALIKA_NOTARY_KEY" --key-id "$CYMALIKA_NOTARY_KEY_ID" --issuer "$CYMALIKA_NOTARY_ISSUER")
fi
[ -e "$cymalika_target" ] || { echo 'Notarization target does not exist.' >&2; exit 1; }
cymalika_upload="$cymalika_target"
cymalika_temp=''
trap '[ -z "$cymalika_temp" ] || rm -rf "$cymalika_temp"' EXIT
if [[ "$cymalika_target" == *.app ]]; then
  codesign --verify --deep --strict "$cymalika_target"
  cymalika_signature=$(codesign -dv --verbose=2 "$cymalika_target" 2>&1)
  [[ "$cymalika_signature" == *'Authority=Developer ID Application:'* ]] || { echo 'Developer ID Application signing is required.' >&2; exit 1; }
  cymalika_temp=$(mktemp -d)
  cymalika_upload="$cymalika_temp/CyMalika.zip"
  ditto -c -k --keepParent "$cymalika_target" "$cymalika_upload"
fi
if [ -n "${CYMALIKA_NOTARY_KEYCHAIN:-}" ]; then cymalika_auth_args+=(--keychain "$CYMALIKA_NOTARY_KEYCHAIN"); fi
xcrun notarytool submit "$cymalika_upload" "${cymalika_auth_args[@]}" --wait --timeout 30m
case "$cymalika_target" in
  *.app|*.dmg) xcrun stapler staple "$cymalika_target"; xcrun stapler validate "$cymalika_target" ;;
esac
if [[ "$cymalika_target" == *.app ]]; then spctl --assess --type execute --verbose=2 "$cymalika_target"; fi
