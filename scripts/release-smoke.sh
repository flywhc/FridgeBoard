#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

echo "[smoke] 后端关键链路"
uv run pytest -m smoke -q

echo "[smoke] 前端关键运行边界"
npm run --prefix frontend test -- --run \
  src/appApi.test.ts \
  src/mobileAuth.test.ts \
  src/pwaCache.test.ts \
  src/recipeCalendar.test.ts \
  src/accessPermissions.test.ts

echo "发布 smoke test 通过。"
