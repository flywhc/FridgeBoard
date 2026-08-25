#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
用法：
  scripts/generate-release-changelog.sh [选项]

选项：
  --from REF       起始引用；省略时使用目标提交之前最近的 tag
  --to REF         目标提交，默认 HEAD
  --output FILE    将摘要写入文件；省略时输出到 stdout
  -h, --help       显示帮助

摘要按提交标题自动归类，不改写提交原文，也不读取业务数据或密钥。
EOF
}

FROM_REF=""
TO_REF="HEAD"
OUTPUT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      [[ $# -ge 2 ]] || { echo "缺少 --from 的参数" >&2; exit 2; }
      FROM_REF=$2
      shift 2
      ;;
    --to)
      [[ $# -ge 2 ]] || { echo "缺少 --to 的参数" >&2; exit 2; }
      TO_REF=$2
      shift 2
      ;;
    --output)
      [[ $# -ge 2 ]] || { echo "缺少 --output 的参数" >&2; exit 2; }
      OUTPUT_FILE=$2
      shift 2
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

case "$TO_REF" in
  ''|*[!A-Za-z0-9._/@:-]*)
    echo "目标 Git 引用包含不安全字符：$TO_REF" >&2
    exit 2
    ;;
esac
case "$FROM_REF" in
  ''|*[!A-Za-z0-9._/@:-]*)
    [[ -z "$FROM_REF" ]] || {
      echo "起始 Git 引用包含不安全字符：$FROM_REF" >&2
      exit 2
    }
    ;;
esac

git rev-parse --verify "$TO_REF^{commit}" >/dev/null 2>&1 || {
  echo "找不到目标 Git 提交或引用：$TO_REF" >&2
  exit 2
}

if [[ -z "$FROM_REF" ]]; then
  FROM_REF="$(git describe --tags --abbrev=0 "$TO_REF^" 2>/dev/null || true)"
fi
if [[ -n "$FROM_REF" ]]; then
  git rev-parse --verify "$FROM_REF^{commit}" >/dev/null 2>&1 || {
    echo "找不到起始 Git 提交或引用：$FROM_REF" >&2
    exit 2
  }
  LOG_RANGE="$FROM_REF..$TO_REF"
  RANGE_LABEL="$FROM_REF..$TO_REF"
else
  LOG_RANGE="$TO_REF"
  RANGE_LABEL="历史起点..$TO_REF"
fi

generate() {
  local subject hash category
  local -i category_index=0
  local -i total=0
  local -a category_names=(新增 修复 改进 工程 文档 其他)
  local -a category_counts=(0 0 0 0 0 0)
  local -a category_lines=("" "" "" "" "" "")

  printf '# 发布变更摘要\n\n'
  printf -- '- 变更范围：`%s`\n' "$RANGE_LABEL"
  printf -- '- 生成方式：根据 Git 提交标题自动归类\n\n'

  while IFS=$'\t' read -r subject hash; do
    [[ -n "$subject" ]] || continue
    case "$subject" in
      feat:*|feat\(*|新增*|增加*|支持*) category_index=0 ;;
      fix:*|fix\(*|修复*|解决*) category_index=1 ;;
      refactor:*|refactor\(*|重构*|优化*|性能*) category_index=2 ;;
      docs:*|docs\(*|文档*|记录*) category_index=4 ;;
      test:*|test\(*|测试*|ci:*|ci\(*|构建*|发布*) category_index=3 ;;
      *) category_index=5 ;;
    esac
    category_counts[$category_index]=$(( category_counts[$category_index] + 1 ))
    category_lines[$category_index]="${category_lines[$category_index]}- ${subject} (${hash})\n"
    total+=1
  done < <(git log --no-merges --format='%s%x09%h' "$LOG_RANGE")

  if (( total == 0 )); then
    printf '%s\n' '本次发布范围没有新增提交。'
    return
  fi

  local current_index
  for current_index in 0 1 2 3 4 5; do
    if (( category_counts[$current_index] > 0 )); then
      printf '## %s（%s）\n\n' "${category_names[$current_index]}" "${category_counts[$current_index]} 条"
      printf '%b\n' "${category_lines[$current_index]}"
    fi
  done
}

if [[ -n "$OUTPUT_FILE" ]]; then
  output_parent="$(dirname -- "$OUTPUT_FILE")"
  [[ -d "$output_parent" ]] || mkdir -p "$output_parent"
  generate > "$OUTPUT_FILE"
  echo "已生成 Changelog：$OUTPUT_FILE" >&2
else
  generate
fi
