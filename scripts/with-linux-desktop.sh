#!/bin/bash
set -euo pipefail
exec dbus-run-session -- xvfb-run -a bash -c '
set -euo pipefail
log=$(mktemp)
openbox >"$log" 2>&1 &
wm=$!
trap '\''kill "$wm" 2>/dev/null || true; rm -f "$log"'\'' EXIT
ready=false
for ((attempt=0;attempt<50;attempt++)); do
  if wmctrl -m >/dev/null 2>&1; then ready=true; break; fi
  if ! kill -0 "$wm" 2>/dev/null; then cat "$log" >&2; exit 1; fi
  sleep 0.1
done
if ! $ready; then cat "$log" >&2; echo "The test window manager did not become ready." >&2; exit 1; fi
"$@"
' cipher-desktop-tests "$@"
