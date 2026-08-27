#!/bin/sh
set -eu

# VS Code 的 stopAll 只结束调试会话；这里补回收由 reload/npm 派生的本地服务进程。
mode="${1:-all}"
ports="7001 7002"
if [ "$mode" = "frontend" ]; then
  ports="7001"
fi

for port in $ports; do
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    kill $pids 2>/dev/null || true
  fi
done

sleep 0.2

# 监听进程退出后，npm 和 uvicorn reload 的父进程可能仍然存活，按命令行精确清理。
pkill -f 'vite.*--port 7001' 2>/dev/null || true
if [ "$mode" != "frontend" ]; then
  pkill -f 'uvicorn.*--port 7002' 2>/dev/null || true
fi
