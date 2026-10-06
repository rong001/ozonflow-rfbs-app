#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "未找到 .env，从 .env.example 复制…"
  cp .env.example .env
  echo "已生成 .env，可按需填写 OZON_CLIENT_ID / OZON_API_KEY / DEPLOY_TOKEN / ALLOW_ORIGIN"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "未检测到 docker。改用 Node 启动："
  echo "  npm start   # 或 node server/app.js"
  echo "访问 http://127.0.0.1:${PORT:-8787}/"
  exit 1
fi

COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    echo "docker 已安装但无 compose 插件"
    exit 1
  fi
fi

mkdir -p data
"${COMPOSE[@]}" up -d --build

PORT_VAL="${PORT:-8787}"
# try read from .env
if grep -q '^PORT=' .env 2>/dev/null; then
  PORT_VAL="$(grep '^PORT=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
PORT_VAL="${PORT_VAL:-8787}"

echo ""
echo "已启动：http://127.0.0.1:${PORT_VAL}/"
echo "健康检查："
sleep 1
curl -sS "http://127.0.0.1:${PORT_VAL}/api/health" || true
echo ""
