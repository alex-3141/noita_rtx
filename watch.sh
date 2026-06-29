#!/usr/bin/env bash
# Watch shaders/*.frag for changes and run make install-dev

set -euo pipefail

if ! command -v inotifywait &>/dev/null; then
    echo "Error: inotifywait not found. Install it with: sudo apt install inotify-tools" >&2
    exit 1
fi

echo "Watching shaders/*.frag for changes..."

while inotifywait -q -e close_write,moved_to --format '%f' shaders/*.frag; do
    make install-dev
done
