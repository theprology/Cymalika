#!/usr/bin/env bash
set -euo pipefail

cipher_repo='theprology/cipher'
cipher_version='latest'
cipher_dry_run=false
cipher_verify_only=false
cipher_appimage=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) [ "$#" -ge 2 ] || { echo 'Missing version.' >&2; exit 1; }; cipher_version="${2#v}"; shift 2 ;;
    --dry-run) cipher_dry_run=true; shift ;;
    --verify-only) cipher_verify_only=true; shift ;;
    --appimage) cipher_appimage=true; shift ;;
    -h|--help) echo 'Usage: install.sh [--version 0.3.0] [--dry-run] [--verify-only] [--appimage]'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done
cipher_fail() { echo "Cipher: $*" >&2; exit 1; }
command -v curl >/dev/null || cipher_fail 'curl is required.'
cipher_os=$(uname -s)
cipher_arch=$(uname -m)
if [ "$cipher_version" = latest ]; then
  cipher_metadata=$(curl -fsSL "https://api.github.com/repos/$cipher_repo/releases/latest") || cipher_fail "Could not read the latest release. Try --version 0.3.0."
  cipher_version=$(printf '%s\n' "$cipher_metadata" | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -n 1)
fi
[[ "$cipher_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$ ]] || cipher_fail 'Could not resolve a valid release version. Try --version 0.3.0.'
case "$cipher_os/$cipher_arch" in
  Darwin/arm64) cipher_asset="Cipher-$cipher_version-mac-arm64.dmg"; cipher_kind=mac ;;
  Darwin/x86_64) cipher_fail 'This release provides an Apple Silicon Mac app. Intel users can build from source.' ;;
  Linux/x86_64|Linux/amd64)
    if ! $cipher_appimage && command -v apt-get >/dev/null && command -v dpkg >/dev/null; then
      cipher_asset="Cipher-$cipher_version-amd64.deb"; cipher_kind=deb
    else
      cipher_asset="Cipher-$cipher_version-x86_64.AppImage"; cipher_kind=appimage
    fi ;;
  *) cipher_fail 'Supported downloads are Apple Silicon Mac and Linux x64. On Windows, use install.ps1.' ;;
esac
cipher_base="https://github.com/$cipher_repo/releases/download/v$cipher_version"
echo "Cipher $cipher_version - $cipher_asset"
if $cipher_dry_run; then echo "Download: $cipher_base/$cipher_asset"; echo 'No files were downloaded or installed.'; exit 0; fi
cipher_tmp=$(mktemp -d "${TMPDIR:-/tmp}/cipher-install.XXXXXX")
cipher_mount=''
cipher_cleanup() {
  if [ -n "$cipher_mount" ]; then hdiutil detach -quiet "$cipher_mount" >/dev/null 2>&1 || true; fi
  rm -rf "$cipher_tmp"
}
trap cipher_cleanup EXIT
curl -fL --retry 2 --output "$cipher_tmp/$cipher_asset" "$cipher_base/$cipher_asset"
curl -fsSL --retry 2 --output "$cipher_tmp/SHA256SUMS.txt" "$cipher_base/SHA256SUMS.txt"
cipher_expected=$(awk -v name="$cipher_asset" '$2==name {print $1}' "$cipher_tmp/SHA256SUMS.txt")
[[ "$cipher_expected" =~ ^[a-fA-F0-9]{64}$ ]] || cipher_fail 'The release does not contain a valid checksum for this download.'
if command -v sha256sum >/dev/null; then
  cipher_actual=$(sha256sum "$cipher_tmp/$cipher_asset" | awk '{print $1}')
else
  command -v shasum >/dev/null || cipher_fail 'sha256sum or shasum is required.'
  cipher_actual=$(shasum -a 256 "$cipher_tmp/$cipher_asset" | awk '{print $1}')
fi
[ "$cipher_actual" = "$cipher_expected" ] || cipher_fail 'Checksum mismatch. Nothing was installed.'
echo 'Checksum verified.'
if $cipher_verify_only; then echo 'Verification complete. Nothing was installed.'; exit 0; fi
cipher_bin="$HOME/.local/bin"
mkdir -p "$cipher_bin"
cipher_launch=''
if [ "$cipher_kind" = mac ]; then
  if pgrep -x Cipher >/dev/null 2>&1; then cipher_fail 'Quit Cipher, then run the installer again.'; fi
  cipher_mount="$cipher_tmp/mount"
  mkdir -p "$cipher_mount"
  hdiutil attach -quiet -nobrowse -readonly -mountpoint "$cipher_mount" "$cipher_tmp/$cipher_asset"
  [ -d "$cipher_mount/Cipher.app" ] || cipher_fail 'The disk image does not contain Cipher.app.'
  codesign --verify --deep --strict "$cipher_mount/Cipher.app"
  ditto "$cipher_mount/Cipher.app" "$cipher_tmp/Cipher.app"
  mkdir -p "$HOME/Applications"
  cipher_dest="$HOME/Applications/Cipher.app"
  if [ -e "$cipher_dest" ]; then mv "$cipher_dest" "$HOME/Applications/Cipher-backup-$(date +%Y%m%d-%H%M%S).app"; fi
  mv "$cipher_tmp/Cipher.app" "$cipher_dest"
  printf '#!/usr/bin/env bash\n# Cipher launcher\nexec open -a %q --args "$@"\n' "$cipher_dest" > "$cipher_tmp/launcher"
  cipher_launch="$cipher_dest"
elif [ "$cipher_kind" = deb ]; then
  if [ "$(id -u)" -eq 0 ]; then apt-get install -y "$cipher_tmp/$cipher_asset";
  else command -v sudo >/dev/null || cipher_fail 'sudo is required for a Debian package install. Use --appimage for a user-only install.'; sudo apt-get install -y "$cipher_tmp/$cipher_asset"; fi
  cipher_launch='/opt/Cipher/cipher-workspace'
  printf '#!/usr/bin/env bash\n# Cipher launcher\nexec %q "$@"\n' "$cipher_launch" > "$cipher_tmp/launcher"
else
  cipher_data="${XDG_DATA_HOME:-$HOME/.local/share}/cipher"
  mkdir -p "$cipher_data"
  cipher_launch="$cipher_data/Cipher.AppImage"
  cp "$cipher_tmp/$cipher_asset" "$cipher_launch.new"
  chmod 755 "$cipher_launch.new"
  mv -f "$cipher_launch.new" "$cipher_launch"
  printf '#!/usr/bin/env bash\n# Cipher launcher\nexec %q "$@"\n' "$cipher_launch" > "$cipher_tmp/launcher"
fi
if { [ ! -e "$cipher_bin/cipher" ] && [ ! -L "$cipher_bin/cipher" ]; } || { [ ! -L "$cipher_bin/cipher" ] && grep -q '^# Cipher launcher$' "$cipher_bin/cipher"; }; then
  install -m 755 "$cipher_tmp/launcher" "$cipher_bin/cipher"
  echo "Installed. Launch with: $cipher_bin/cipher"
  case ":$PATH:" in *":$cipher_bin:"*) ;; *) echo 'To use cipher by name in this terminal: export PATH="$HOME/.local/bin:$PATH"' ;; esac
else
  echo "Cipher is installed at $cipher_launch. The existing $cipher_bin/cipher command was left unchanged."
fi
echo 'Keep Ollama running to use your installed models. No model was downloaded.'
