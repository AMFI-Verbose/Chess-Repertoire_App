#!/bin/sh
# Runs dev-timeline.py with the first interpreter that actually has Pillow.
# The sandboxed Python that ships with the desktop app is the usual winner.
cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "$0"/..)" || exit 1
for py in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3 \
          "$HOME"/Library/Application\ Support/Doubao/sandbox_runtime/bases/*/bin/python3; do
  [ -x "$py" ] || continue
  if "$py" -c "import PIL" >/dev/null 2>&1; then
    exec "$py" scripts/dev-timeline.py
  fi
done
echo "dev-timeline: no Python with Pillow found" >&2
exit 1
