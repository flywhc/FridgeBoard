#!/bin/sh
set -eu

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

export UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/fridgeboard-uv-cache}"
exec uv run alembic upgrade head
