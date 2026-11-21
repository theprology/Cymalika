#!/usr/bin/env bash
set -euo pipefail

cymalika_repo='theprology/Cymalika'
cymalika_version='latest'
cymalika_dry_run=false
cymalika_verify_only=false
cymalika_appimage=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) [ "$#" -ge 2 ] || { echo 'Missing version.' >&2; exit 1; }; cymalika_version="${2#v}"; shift 2 ;;
    --dry-run) cymalika_dry_run=true; shift ;;
    --verify-only) cymalika_verify_only=true; shift ;;
    --appimage) cymalika_appimage=true; shift ;;
    -h|--help) echo 'Usage: install.sh [--version 0.3.0] [--dry-run] [--verify-only] [--appimage]'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done
cymalika_fail() { echo "CyMalika: $*" >&2; exit 1; }
command -v curl >/dev/null || cymalika_fail 'curl is required.'
cymalika_os=$(uname -s)
cymalika_arch=$(uname -m)
if [ "$cymalika_version" = latest ]; then
  cymalika_metadata=$(curl -fsSL "https://api.github.com/repos/$cymalika_repo/releases/latest") || cymalika_fail "Could not read the latest release. Try --version 0.3.0."
  cymalika_version=$(printf '%s\n' "$cymalika_metadata" | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -n 1)
fi
[[ "$cymalika_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$ ]] || cymalika_fail 'Could not resolve a valid release version. Try --version 0.3.0.'
case "$cymalika_os/$cymalika_arch" in
  Darwin/arm64) cymalika_asset="CyMalika-$cymalika_version-mac-arm64.dmg"; cymalika_kind=mac ;;
  Darwin/x86_64) cymalika_fail 'This release provides an Apple Silicon Mac app. Intel users can build from source.' ;;
  Linux/x86_64|Linux/amd64)
    if ! $cymalika_appimage && command -v apt-get >/dev/null && command -v dpkg >/dev/null; then
      cymalika_asset="CyMalika-$cymalika_version-amd64.deb"; cymalika_kind=deb
    else
      cymalika_asset="CyMalika-$cymalika_version-x86_64.AppImage"; cymalika_kind=appimage
    fi ;;
  *) cymalika_fail 'Supported downloads are Apple Silicon Mac and Linux x64. On Windows, use install.ps1.' ;;
esac
cymalika_base="https://github.com/$cymalika_repo/releases/download/v$cymalika_version"
echo "CyMalika $cymalika_version - $cymalika_asset"
if $cymalika_dry_run; then echo "Download: $cymalika_base/$cymalika_asset"; echo 'No files were downloaded or installed.'; exit 0; fi
cymalika_tmp=$(mktemp -d "${TMPDIR:-/tmp}/cymalika-install.XXXXXX")
cymalika_mount=''
cymalika_cleanup() {
  if [ -n "$cymalika_mount" ]; then hdiutil detach -quiet "$cymalika_mount" >/dev/null 2>&1 || true; fi
  rm -rf "$cymalika_tmp"
}
trap cymalika_cleanup EXIT
curl -fL --retry 2 --output "$cymalika_tmp/$cymalika_asset" "$cymalika_base/$cymalika_asset"
curl -fsSL --retry 2 --output "$cymalika_tmp/SHA256SUMS.txt" "$cymalika_base/SHA256SUMS.txt"
cymalika_expected=$(awk -v name="$cymalika_asset" '$2==name {print $1}' "$cymalika_tmp/SHA256SUMS.txt")
[[ "$cymalika_expected" =~ ^[a-fA-F0-9]{64}$ ]] || cymalika_fail 'The release does not contain a valid checksum for this download.'
if command -v sha256sum >/dev/null; then
  cymalika_actual=$(sha256sum "$cymalika_tmp/$cymalika_asset" | awk '{print $1}')
else
  command -v shasum >/dev/null || cymalika_fail 'sha256sum or shasum is required.'
  cymalika_actual=$(shasum -a 256 "$cymalika_tmp/$cymalika_asset" | awk '{print $1}')
fi
[ "$cymalika_actual" = "$cymalika_expected" ] || cymalika_fail 'Checksum mismatch. Nothing was installed.'
echo 'Checksum verified.'
if $cymalika_verify_only; then echo 'Verification complete. Nothing was installed.'; exit 0; fi
cymalika_bin="$HOME/.local/bin"
mkdir -p "$cymalika_bin"
cymalika_launch=''
if [ "$cymalika_kind" = mac ]; then
  if pgrep -x CyMalika >/dev/null 2>&1; then cymalika_fail 'Quit CyMalika, then run the installer again.'; fi
  cymalika_mount="$cymalika_tmp/mount"
  mkdir -p "$cymalika_mount"
  hdiutil attach -quiet -nobrowse -readonly -mountpoint "$cymalika_mount" "$cymalika_tmp/$cymalika_asset"
  [ -d "$cymalika_mount/CyMalika.app" ] || cymalika_fail 'The disk image does not contain CyMalika.app.'
  codesign --verify --deep --strict "$cymalika_mount/CyMalika.app"
  ditto "$cymalika_mount/CyMalika.app" "$cymalika_tmp/CyMalika.app"
  mkdir -p "$HOME/Applications"
  cymalika_dest="$HOME/Applications/CyMalika.app"
  if [ -e "$cymalika_dest" ]; then mv "$cymalika_dest" "$HOME/Applications/CyMalika-backup-$(date +%Y%m%d-%H%M%S).app"; fi
  mv "$cymalika_tmp/CyMalika.app" "$cymalika_dest"
  printf '#!/usr/bin/env bash\n# CyMalika launcher\nexec open -a %q --args "$@"\n' "$cymalika_dest" > "$cymalika_tmp/launcher"
  cymalika_launch="$cymalika_dest"
elif [ "$cymalika_kind" = deb ]; then
  if [ "$(id -u)" -eq 0 ]; then apt-get install -y "$cymalika_tmp/$cymalika_asset";
  else command -v sudo >/dev/null || cymalika_fail 'sudo is required for a Debian package install. Use --appimage for a user-only install.'; sudo apt-get install -y "$cymalika_tmp/$cymalika_asset"; fi
  cymalika_launch='/opt/CyMalika/cymalika-workspace'
  printf '#!/usr/bin/env bash\n# CyMalika launcher\nexec %q "$@"\n' "$cymalika_launch" > "$cymalika_tmp/launcher"
else
  cymalika_data="${XDG_DATA_HOME:-$HOME/.local/share}/cymalika"
  mkdir -p "$cymalika_data"
  cymalika_launch="$cymalika_data/CyMalika.AppImage"
  cp "$cymalika_tmp/$cymalika_asset" "$cymalika_launch.new"
  chmod 755 "$cymalika_launch.new"
  mv -f "$cymalika_launch.new" "$cymalika_launch"
  printf '#!/usr/bin/env bash\n# CyMalika launcher\nexec %q "$@"\n' "$cymalika_launch" > "$cymalika_tmp/launcher"
fi
if { [ ! -e "$cymalika_bin/cymalika" ] && [ ! -L "$cymalika_bin/cymalika" ]; } || { [ ! -L "$cymalika_bin/cymalika" ] && grep -q '^# CyMalika launcher$' "$cymalika_bin/cymalika"; }; then
  install -m 755 "$cymalika_tmp/launcher" "$cymalika_bin/cymalika"
  echo "Installed. Launch with: $cymalika_bin/cymalika"
  case ":$PATH:" in *":$cymalika_bin:"*) ;; *) echo 'To use cymalika by name in this terminal: export PATH="$HOME/.local/bin:$PATH"' ;; esac
else
  echo "CyMalika is installed at $cymalika_launch. The existing $cymalika_bin/cymalika command was left unchanged."
fi
echo 'Keep Ollama running to use your installed models. No model was downloaded.'
