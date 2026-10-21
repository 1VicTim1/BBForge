#!/usr/bin/env bash
set -euo pipefail
export TAURI_WEBVIEW_AUTOMATION=true
export WEBKIT_DISABLE_COMPOSITING_MODE=1
# Docker's root user needs WebKit's sandbox disabled in this test container only.
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
export BBFORGE_BINARY="${BBFORGE_BINARY:-/target/release/bbforge-app}"
export BBFORGE_SMOKE_SCRIPT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/smoke-desktop.py"
dbus-run-session -- xvfb-run -a -s '-screen 0 1440x1000x24' bash -c '
  WebKitWebDriver --port=4444 >/tmp/bbforge-webdriver.log 2>&1 &
  driver=$!
  trap "kill $driver 2>/dev/null || true" EXIT
  for attempt in $(seq 1 100); do
    if curl -fsS http://127.0.0.1:4444/status >/dev/null 2>&1; then break; fi
    sleep .1
  done
  python3 "$BBFORGE_SMOKE_SCRIPT" || { cat /tmp/bbforge-webdriver.log; exit 1; }
'
