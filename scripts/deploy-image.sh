#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
用法：
  scripts/deploy-image.sh [选项]

选项：
  --config FILE          配置文件，默认 .deploy.env
  --image IMAGE          覆盖配置中的 FRIDGEBOARD_IMAGE
  --host HOST            覆盖配置中的 DEPLOY_HOST
  --user USER            覆盖配置中的 DEPLOY_USER
  --path PATH            覆盖配置中的 DEPLOY_PATH
  --health-url URL       覆盖配置中的 HEALTH_URL
  --skip-health-check    只发布，不请求健康检查地址
  --dry-run              只检查参数并打印计划，不连接服务器
  -h, --help             显示帮助

私有 GHCR 镜像可设置 GHCR_USERNAME 和 GHCR_TOKEN。SSH 凭据沿用本机 ssh 配置。
EOF
}

DEPLOY_CONFIG_FILE="${DEPLOY_CONFIG_FILE:-.deploy.env}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --config)
      [ "$#" -ge 2 ] || { echo "缺少 --config 的参数" >&2; exit 2; }
      DEPLOY_CONFIG_FILE=$2
      shift 2
      ;;
    *)
      break
      ;;
  esac
done

[ -f "$DEPLOY_CONFIG_FILE" ] || {
  echo "找不到发布配置文件：$DEPLOY_CONFIG_FILE" >&2
  echo "请复制 .deploy.env.example 为 .deploy.env，并补充本地凭据。" >&2
  exit 2
}
set -a
. "$DEPLOY_CONFIG_FILE"
set +a

IMAGE_REF="${FRIDGEBOARD_IMAGE:-ghcr.io/flywhc/fridgeboard:main}"
DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-$(id -un)}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/fridgeboard}"
HEALTH_URL="${HEALTH_URL:-https://fridge.flycn.fyi/healthz}"
SKIP_HEALTH_CHECK=0
DRY_RUN=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --image)
      [ "$#" -ge 2 ] || { echo "缺少 --image 的参数" >&2; exit 2; }
      IMAGE_REF=$2
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

case "$IMAGE_REF" in
  ''|*[!A-Za-z0-9./_:@-]*)
    echo "镜像引用包含不安全字符：$IMAGE_REF" >&2
    exit 2
    ;;
esac

[ -n "$DEPLOY_HOST" ] || {
  echo "请设置 DEPLOY_HOST，或使用 --host 指定 SSH 主机" >&2
  exit 2
}

case "$DEPLOY_USER" in
  ''|*[!A-Za-z0-9._-]*)
    echo "SSH 用户名包含不安全字符：$DEPLOY_USER" >&2
    exit 2
    ;;
esac

case "$DEPLOY_PATH" in
  ''|*[!A-Za-z0-9._/-]*)
    echo "DEPLOY_PATH 必须是只含安全字符的绝对路径：$DEPLOY_PATH" >&2
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
echo "发布镜像：$IMAGE_REF"
echo "健康检查：$HEALTH_PLAN"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry-run：未连接服务器，未执行发布。"
  exit 0
fi

command -v ssh >/dev/null 2>&1 || { echo "找不到 ssh" >&2; exit 1; }

if [ -n "${GHCR_TOKEN:-}" ]; then
  GHCR_USERNAME="${GHCR_USERNAME:-flywhc}"
  case "$GHCR_USERNAME" in
    ''|*[!A-Za-z0-9._-]*)
      echo "GHCR_USERNAME 包含不安全字符：$GHCR_USERNAME" >&2
      exit 2
      ;;
  esac
  echo "正在登录 GHCR（令牌不会写入本机文件或命令行）……"
  if ! printf '%s' "$GHCR_TOKEN" | ssh "$SSH_TARGET" \
    "docker login ghcr.io --username '$GHCR_USERNAME' --password-stdin"; then
    echo "GHCR 登录失败" >&2
    exit 1
  fi
fi

cleanup_remote_login() {
  if [ -n "${GHCR_TOKEN:-}" ]; then
    ssh "$SSH_TARGET" "docker logout ghcr.io" >/dev/null 2>&1 || true
  fi
}
trap cleanup_remote_login EXIT

echo "正在远程备份数据库、拉取镜像并重建容器……"
ssh "$SSH_TARGET" sh -s -- "$DEPLOY_PATH" "$IMAGE_REF" <<'REMOTE_SCRIPT'
set -eu

deploy_path=$1
image_ref=$2
container_name=fridgeboard-app
override_file="$deploy_path/.compose.image.override.yaml"

cd "$deploy_path"
command -v docker >/dev/null 2>&1 || { echo "服务器找不到 docker" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "服务器找不到 docker compose" >&2; exit 1; }

umask 077
printf '%s\n' \
  'services:' \
  '  fridgeboard:' \
  "    image: $image_ref" > "$override_file"
trap 'rm -f "$override_file"' EXIT

if docker inspect "$container_name" >/dev/null 2>&1; then
  backup_name="/data/fridgeboard.db.backup-$(date +%Y%m%d-%H%M%S)"
  docker exec "$container_name" python -c \
    "import sqlite3; source=sqlite3.connect('/data/fridgeboard.db'); target=sqlite3.connect('$backup_name'); source.backup(target); target.close(); source.close()"
  docker exec "$container_name" chmod 600 "$backup_name"
  echo "已创建数据库备份：$backup_name"
fi

docker compose -f compose.yaml -f "$override_file" pull fridgeboard
docker compose -f compose.yaml -f "$override_file" up -d --no-build --force-recreate fridgeboard

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
