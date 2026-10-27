#!/bin/sh
# Pull main when it moved, install, check, restart the server service.
set -eu
cd "$(dirname "$0")/.."
git fetch -q origin main
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse origin/main)
[ "$local_sha" = "$remote_sha" ] && exit 0

echo "$(date -u +%FT%TZ) deploying $remote_sha"
git reset -q --hard origin/main
pnpm install --frozen-lockfile --silent
pnpm typecheck
launchctl kickstart -k "gui/$(id -u)/com.yourco.headless-gtm"
echo "$(date -u +%FT%TZ) restarted"
