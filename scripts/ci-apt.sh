#!/usr/bin/env bash
# Installs Ubuntu packages for CI quickly: no man-db trigger, no recommends, .deb files cached in ~/apt-cache.
set -euo pipefail
cache="$HOME/apt-cache"; mkdir -p "$cache"
# Rebuilding the man page index after every install costs minutes on GitHub runners.
echo "set man-db/auto-update false" | sudo debconf-communicate >/dev/null 2>&1 || true
sudo rm -f /var/lib/man-db/auto-update
sudo cp "$cache"/*.deb /var/cache/apt/archives/ 2>/dev/null || true
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends "$@"
cp /var/cache/apt/archives/*.deb "$cache"/ 2>/dev/null || true
