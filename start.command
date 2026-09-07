#!/bin/zsh
set -e
ROOT="${0:A:h}"
if [[ ! -x "$ROOT/backend/.venv/bin/python" ]]; then
  print "请先按 README 创建 backend/.venv 并安装 requirements.txt。"
  exit 1
fi
exec "$ROOT/backend/.venv/bin/python" "$ROOT/tools/launch.py"
