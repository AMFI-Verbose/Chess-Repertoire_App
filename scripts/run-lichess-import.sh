#!/bin/zsh
# Daily Lichess import, run by launchd (com.cjpeng.chess-lichess).
# launchd starts with an empty environment, so the node path is discovered here.
set -u

cd "$(dirname "$0")/.."

NODE="$(ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -1)"
if [ ! -x "$NODE" ]; then
  NODE=/opt/homebrew/bin/node
fi

LOG=/tmp/chess-lichess.log
{
  echo "-------------- $(date '+%Y-%m-%d %H:%M:%S') --------------"
  "$NODE" scripts/import-lichess.mjs --count=10
} >> "$LOG" 2>&1
