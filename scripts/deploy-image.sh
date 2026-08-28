#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
用法：
  scripts/deploy-image.sh [选项]

选项：
  --config FILE          配置文件，默认 .deploy.env
  --ref REF              要发布的 Git 提交/引用，默认 HEAD
  --host HOST            覆盖配置中的 DEPLOY_HOST
  --user USER            覆盖配置中的 DEPLOY_USER
  --path PATH            覆盖配置中的 DEPLOY_PATH
  --health-url URL       覆盖配置中的 HEALTH_URL
  --env-prod FILE        生产环境配置，默认 .env.prod；发布时覆盖服务器 .env
  --release RELEASE      覆盖部署 release，格式为 yymmddhhMMss
  --changelog-file FILE  保存自动生成的变更摘要
  --skip-health-check    只发布，不请求健康检查地址
  --dry-run              只检查参数并打印计划，不连接服务器
  -h, --help             显示帮助

脚本将源码归档通过 SSH 传到服务器，并在服务器上执行 Docker 构建。
EOF
}

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_CONFIG_FILE="${DEPLOY_CONFIG_FILE:-.deploy.env}"
if [ "${1:-}" = --config ]; then
  [ "$#" -ge 2 ] || { echo "缺少 --config 的参数" >&2; exit 2; }
  DEPLOY_CONFIG_FILE=$2
  shift 2
fi

[ -f "$DEPLOY_CONFIG_FILE" ] || {
  echo "找不到发布配置文件：$DEPLOY_CONFIG_FILE" >&2
  exit 2
}
set -a
. "$DEPLOY_CONFIG_FILE"
set +a

DEPLOY_REF="${DEPLOY_REF:-HEAD}"
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-$(id -un)}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/fridgeboard}"
HEALTH_URL="${HEALTH_URL:-https://fridge.flycn.fyi/healthz}"
DEPLOY_ENV_PROD_FILE="${DEPLOY_ENV_PROD_FILE:-.env.prod}"
DEPLOY_RELEASE="${DEPLOY_RELEASE:-}"
DEPLOY_CHANGELOG_FILE="${DEPLOY_CHANGELOG_FILE:-}"
SKIP_HEALTH_CHECK=0
DRY_RUN=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --ref)
      [ "$#" -ge 2 ] || { echo "缺少 --ref 的参数" >&2; exit 2; }
      DEPLOY_REF=$2
      shift 2
      ;;
    --host)
      [ "$#" -ge 2 ] || { echo "缺少 --host 的参数" >&2; exit 2; }
      DEPLOY_HOST=$2
      shift 2
      ;;
    --user)
      [ "$#" -ge 2 ] || { echo "缺少 --user 的参数" >&2; exit 2; }
      DEPLOY_USER=$2
      shift 2
      ;;
    --path)
      [ "$#" -ge 2 ] || { echo "缺少 --path 的参数" >&2; exit 2; }
      DEPLOY_PATH=$2
      shift 2
      ;;
    --health-url)
      [ "$#" -ge 2 ] || { echo "缺少 --health-url 的参数" >&2; exit 2; }
      HEALTH_URL=$2
      shift 2
      ;;
    --env-prod)
      [ "$#" -ge 2 ] || { echo "缺少 --env-prod 的参数" >&2; exit 2; }
      DEPLOY_ENV_PROD_FILE=$2
      shift 2
      ;;
    --release)
      [ "$#" -ge 2 ] || { echo "缺少 --release 的参数" >&2; exit 2; }
      DEPLOY_RELEASE=$2
      shift 2
      ;;
    --changelog-file)
      [ "$#" -ge 2 ] || { echo "缺少 --changelog-file 的参数" >&2; exit 2; }
      DEPLOY_CHANGELOG_FILE=$2
      shift 2
      ;;
    --skip-health-check)
      SKIP_HEALTH_CHECK=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数：$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -n "$DEPLOY_RELEASE" ] && ! printf '%s' "$DEPLOY_RELEASE" | grep -Eq '^[0-9]{12}$'; then
  echo "release 必须是 12 位 yymmddhhMMss 数字：$DEPLOY_RELEASE" >&2
  exit 2
fi

case "$DEPLOY_REF" in
  ''|*[!A-Za-z0-9._/@:-]*)
    echo "Git 引用包含不安全字符：$DEPLOY_REF" >&2
    exit 2
    ;;
esac

[ -n "$DEPLOY_HOST" ] || {
  echo "请设置 DEPLOY_HOST，或使用 --host 指定 SSH 主机" >&2
  exit 2
}

[ -f "$DEPLOY_ENV_PROD_FILE" ] || {
  echo "找不到生产环境配置文件：$DEPLOY_ENV_PROD_FILE" >&2
  exit 2
}

normalized_deploy_host=$(printf '%s' "$DEPLOY_HOST" | tr '[:upper:]' '[:lower:]')
case "$normalized_deploy_host" in
  flycn.fyi|flycn.fyi.)
    echo "禁止通过 flycn.fyi 建立 SSH 连接，请使用生产固定 IP 107.174.152.245" >&2
    exit 2
    ;;
esac

case "$DEPLOY_USER" in
  ''|*[!A-Za-z0-9._-]*)
    echo "SSH 用户名包含不安全字符：$DEPLOY_USER" >&2
    exit 2
    ;;
esac

case "$DEPLOY_PATH" in
  ''|*[!A-Za-z0-9._/-]*|/*/*..*)
    echo "DEPLOY_PATH 必须是安全的绝对路径：$DEPLOY_PATH" >&2
    exit 2
    ;;
  /*) ;;
  *)
    echo "DEPLOY_PATH 必须是绝对路径：$DEPLOY_PATH" >&2
    exit 2
    ;;
esac

SSH_TARGET="$DEPLOY_USER@$DEPLOY_HOST"
if [ "$SKIP_HEALTH_CHECK" -eq 1 ]; then
  HEALTH_PLAN=已跳过
else
  HEALTH_PLAN=$HEALTH_URL
fi
echo "发布目标：$SSH_TARGET:$DEPLOY_PATH"
echo "发布引用：$DEPLOY_REF"
echo "健康检查：$HEALTH_PLAN"
echo "生产配置：$DEPLOY_ENV_PROD_FILE -> $DEPLOY_PATH/.env"
echo "变更摘要：发布前自动生成"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry-run：未连接服务器，未执行发布。"
  exit 0
fi

command -v ssh >/dev/null 2>&1 || { echo "找不到 ssh" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "找不到 git" >&2; exit 1; }
git rev-parse --verify "$DEPLOY_REF^{commit}" >/dev/null 2>&1 || {
  echo "找不到 Git 提交或引用：$DEPLOY_REF" >&2
  exit 2
}

release_stamp="${DEPLOY_RELEASE:-$(date '+%y%m%d%H%M%S')}"
changelog_temp_file=""
archive_check_dir=$(mktemp -d)
cleanup_archive_check() {
  rm -rf "$archive_check_dir"
  [ -z "$changelog_temp_file" ] || rm -f "$changelog_temp_file"
}
trap cleanup_archive_check EXIT
git archive --format=tar "$DEPLOY_REF" | tar -xf - -C "$archive_check_dir"
# .env.prod 被 .gitignore 排除，发布时显式映射为服务器使用的 .env。
cp "$DEPLOY_ENV_PROD_FILE" "$archive_check_dir/.env"
chmod 600 "$archive_check_dir/.env"
cat > "$archive_check_dir/frontend/src/release.ts" <<EOF
// 由 scripts/deploy-image.sh 在发布时生成。
const configuredRelease = '$release_stamp'
export const isAppRelease = (value: unknown): value is string => typeof value === 'string' && /^\\d{12}$/.test(value)

export const APP_RELEASE = isAppRelease(configuredRelease) ? configuredRelease : 'dev'
EOF
echo "发布 release：$release_stamp"
if [ -n "$DEPLOY_CHANGELOG_FILE" ]; then
  changelog_output="$DEPLOY_CHANGELOG_FILE"
else
  changelog_temp_file=$(mktemp)
  changelog_output="$changelog_temp_file"
fi
if [ -z "$DEPLOY_CHANGELOG_FILE" ]; then
  "$SCRIPT_DIR/generate-release-changelog.sh" --to "$DEPLOY_REF" --output "$changelog_output"
fi
echo "本次变更摘要："
cat "$changelog_output"
python - "$archive_check_dir" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
catalog_path = root / "backend/fridgeboard/assets/item_catalog/catalog.json"
catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
missing = [
    item["path"]
    for item in catalog["icons"]
    if not (catalog_path.parent / item["path"]).is_file()
]
if missing:
    print("待发布归档缺少内置图标资产：", ", ".join(missing), file=sys.stderr)
    raise SystemExit(2)
print(f"内置图标资产校验通过：{len(catalog['icons'])} 个")
PY

echo "正在将源码归档传到服务器……"
# macOS tar 会默认把文件扩展属性写成 AppleDouble 元数据，远端解包后会产生
# `._*.py` 等伪迁移文件，导致 Alembic 将二进制元数据当作 Python 源码加载。
COPYFILE_DISABLE=1 tar -C "$archive_check_dir" -cf - . | ssh "$SSH_TARGET" \
  "mkdir -p '$DEPLOY_PATH' && tar -xf - -C '$DEPLOY_PATH'"

echo "正在远程备份数据库并重建容器……"
ssh "$SSH_TARGET" sh -s -- "$DEPLOY_PATH" <<'REMOTE_SCRIPT'
set -eu

deploy_path=$1
container_name=fridgeboard-app
cd "$deploy_path"
[ -f .env ] || { echo "服务器缺少生产环境配置：$deploy_path/.env" >&2; exit 1; }
chmod 600 .env
command -v docker >/dev/null 2>&1 || { echo "服务器找不到 docker" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "服务器找不到 docker compose" >&2; exit 1; }

if docker inspect "$container_name" >/dev/null 2>&1; then
  backup_name="/data/fridgeboard.db.backup-$(date +%Y%m%d-%H%M%S)"
  docker exec "$container_name" python -c \
    "import sqlite3; source=sqlite3.connect('/data/fridgeboard.db'); target=sqlite3.connect('$backup_name'); source.backup(target); target.close(); source.close()"
  docker exec "$container_name" chmod 600 "$backup_name"
  echo "已创建数据库备份：$backup_name"
fi

docker compose up -d --build --force-recreate fridgeboard

attempt=1
while [ "$attempt" -le 30 ]; do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$container_name" 2>/dev/null || true)
  if [ "$status" = healthy ]; then
    echo "容器健康：$status"
    docker inspect --format '镜像摘要：{{index .RepoDigests 0}}' "$container_name" 2>/dev/null || true
    exit 0
  fi
  if [ "$status" = unhealthy ]; then
    docker logs --tail 80 "$container_name" >&2 || true
    exit 1
  fi
  sleep 2
  attempt=$((attempt + 1))
done

docker logs --tail 80 "$container_name" >&2 || true
echo "容器在 60 秒内未变为 healthy" >&2
exit 1
REMOTE_SCRIPT

if [ "$SKIP_HEALTH_CHECK" -eq 0 ]; then
  command -v curl >/dev/null 2>&1 || { echo "找不到 curl，无法执行 HTTPS 健康检查" >&2; exit 1; }
  echo "正在检查 $HEALTH_URL ……"
  curl --fail --silent --show-error --max-time 20 "$HEALTH_URL"
  echo
fi

echo "发布完成。"
