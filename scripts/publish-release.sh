#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
用法：
  scripts/publish-release.sh --version VERSION [选项]

选项：
  --version VERSION       产品版本，必须与 frontend/package.json 一致
  --build-number NUMBER   Android versionCode，默认当前 Unix 时间戳
  --release RELEASE       12 位 release，默认当前 UTC 时间
  --ref REF               发布提交，默认 HEAD
  --dry-run               只检查参数，不创建 tag、部署或触发 workflow
  -h, --help              显示帮助

环境变量：
  FRIDGEBOARD_FLYCN_CLIENT_SECRET
                         生产环境已有的 Flycn 服务间密钥，用于清除发布缓存
  FRIDGEBOARD_PUBLIC_BASE_URL
                         默认 https://fridge.flycn.fyi
EOF
}

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
VERSION=""
BUILD_NUMBER="$(date +%s)"
RELEASE="$(date -u '+%y%m%d%H%M%S')"
REF="HEAD"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --build-number) BUILD_NUMBER="$2"; shift 2 ;;
    --release) RELEASE="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "$VERSION" ]] || { echo "必须指定 --version" >&2; exit 2; }
PACKAGE_VERSION="$(node -p "require('$ROOT_DIR/frontend/package.json').version")"
[[ "$VERSION" == "$PACKAGE_VERSION" ]] || {
  echo "版本号必须与 frontend/package.json 一致：$VERSION != $PACKAGE_VERSION" >&2
  exit 2
}
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "版本号格式无效" >&2; exit 2; }
[[ "$RELEASE" =~ ^[0-9]{12}$ ]] || { echo "release 必须是 12 位数字" >&2; exit 2; }
[[ "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ && "$BUILD_NUMBER" -le 2100000000 ]] || {
  echo "Android versionCode 必须是 1 到 2100000000 的正整数" >&2
  exit 2
}

command -v git >/dev/null 2>&1 || { echo "找不到 git" >&2; exit 1; }
command -v gh >/dev/null 2>&1 || { echo "找不到 gh" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "找不到 curl" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "找不到 jq" >&2; exit 1; }
git rev-parse --verify "$REF^{commit}" >/dev/null 2>&1 || {
  echo "找不到 Git 提交或引用：$REF" >&2
  exit 2
}

COMMIT="$(git rev-parse "$REF^{commit}")"
TAG="v$VERSION"
CACHE_TOKEN="${FRIDGEBOARD_FLYCN_CLIENT_SECRET:-}"
PUBLIC_BASE_URL="${FRIDGEBOARD_PUBLIC_BASE_URL:-https://fridge.flycn.fyi}"
METADATA_URL="$PUBLIC_BASE_URL/api/mobile/android/releases/latest"
CLEAR_CACHE_URL="$PUBLIC_BASE_URL/api/internal/android/releases/cache/clear"

[[ -n "$CACHE_TOKEN" || "$DRY_RUN" -eq 1 ]] || {
  echo "缺少 FRIDGEBOARD_FLYCN_CLIENT_SECRET，无法清除生产元数据缓存" >&2
  exit 1
}

echo "发布提交：$COMMIT"
echo "产品版本：$VERSION"
echo "Android versionCode：$BUILD_NUMBER"
echo "统一 release：$RELEASE"
echo "发布标签：$TAG"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry-run：将创建/推送标签、部署服务器、触发一次 workflow 并清除元数据缓存。"
  exit 0
fi

[[ -z "$(git status --short)" ]] || {
  echo "工作区必须干净，发布前请先提交改动" >&2
  exit 2
}

if git show-ref --verify --quiet "refs/tags/$TAG"; then
  [[ "$(git rev-list -n 1 "$TAG")" == "$COMMIT" ]] || {
    echo "本地标签 $TAG 未指向发布提交" >&2
    exit 2
  }
else
  git tag -a "$TAG" "$COMMIT" -m "发布 FridgeBoard $VERSION"
fi
if ! git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  git push origin "$TAG"
fi

"$ROOT_DIR/scripts/deploy-image.sh" --ref "$COMMIT" --release "$RELEASE"

gh workflow run android-release.yml --repo flywhc/FridgeBoard --ref "$TAG" \
  -f "version=$VERSION" -f "release=$RELEASE" -f "build_number=$BUILD_NUMBER"
sleep 3
RUN_ID="$(gh run list --repo flywhc/FridgeBoard --workflow android-release.yml \
  --event workflow_dispatch --limit 10 --json databaseId,headSha,event \
  --jq ".[] | select(.headSha == \"$COMMIT\" and .event == \"workflow_dispatch\") | .databaseId" \
  | head -n 1)"
[[ -n "$RUN_ID" ]] || { echo "找不到刚触发的 Android workflow" >&2; exit 1; }
gh run watch "$RUN_ID" --repo flywhc/FridgeBoard --exit-status

curl --fail --silent --show-error --max-time 20 -X POST \
  -H "X-Android-Release-Cache-Token: $CACHE_TOKEN" "$CLEAR_CACHE_URL" >/dev/null

metadata="$(curl --fail --silent --show-error --max-time 20 "$METADATA_URL")"
[[ "$(jq -r .version <<<"$metadata")" == "$VERSION" ]] || { echo "线上版本校验失败" >&2; exit 1; }
[[ "$(jq -r .release <<<"$metadata")" == "$RELEASE" ]] || { echo "线上 release 校验失败" >&2; exit 1; }
[[ "$(jq -r .build_number <<<"$metadata")" == "$BUILD_NUMBER" ]] || {
  echo "线上 Android 构建号校验失败" >&2
  exit 1
}
echo "发布完成，线上元数据已与统一 release 对齐。"
