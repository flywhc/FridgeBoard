#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
用法：
  scripts/mobile-release.sh build [--platform android|ios|all] [选项]
  scripts/mobile-release.sh publish [--platform android|ios|all] [选项]
  scripts/mobile-release.sh build-and-publish [选项]

选项：
  --platform PLATFORM       默认 all
  --version VERSION         默认读取 frontend/package.json
  --release RELEASE         12 位发布标识；默认当前 UTC 时间（yymmddhhMMss）
  --build-number NUMBER     默认当前 Unix 时间戳；Android 必须是正整数
  --out-dir DIR             默认 output/mobile-release
  --notes-file FILE         上传到 flycn 的发布说明文件
  --aab                     同时生成 Android AAB（仅构建，不上传）
  --dry-run                 只检查参数和打印计划，不构建、不上传

Android 签名环境：
  FRIDGEBOARD_ANDROID_KEYSTORE_PROPERTIES
  或 FRIDGEBOARD_ANDROID_KEYSTORE_BASE64、FRIDGEBOARD_ANDROID_KEY_ALIAS、
  FRIDGEBOARD_ANDROID_KEY_PASSWORD（可选 FRIDGEBOARD_ANDROID_STORE_PASSWORD）

iOS 签名环境：
  FRIDGEBOARD_IOS_TEAM_ID、FRIDGEBOARD_IOS_EXPORT_METHOD（默认 ad-hoc）
  可选 FRIDGEBOARD_IOS_PROVISIONING_PROFILE_SPECIFIER、FRIDGEBOARD_IOS_CODE_SIGN_IDENTITY、
  FRIDGEBOARD_ALLOW_PROVISIONING_UPDATES=1

flycn 发布环境：
  FLYCN_PUBLISH_TOKEN、FLYCN_APP_SLUG（默认 fridgeboard）、
  FLYCN_BASE_URL（默认 https://app.flycn.fyi）

EOF
}

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
PACKAGE_VERSION="$(node -p "require('$FRONTEND_DIR/package.json').version")"
COMMAND="${1:-}"
shift || true
PLATFORM="all"
VERSION="${FRIDGEBOARD_APP_VERSION:-$PACKAGE_VERSION}"
RELEASE="${FRIDGEBOARD_APP_RELEASE:-$(date -u '+%y%m%d%H%M%S')}"
BUILD_NUMBER="${FRIDGEBOARD_BUILD_NUMBER:-$(date +%s)}"
OUT_DIR="$ROOT_DIR/${FRIDGEBOARD_MOBILE_RELEASE_DIR:-output/mobile-release}"
NOTES_FILE="${FRIDGEBOARD_RELEASE_NOTES_FILE:-}"
DRY_RUN=0
BUILD_AAB=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --release) RELEASE="$2"; shift 2 ;;
    --build-number) BUILD_NUMBER="$2"; shift 2 ;;
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    --notes-file) NOTES_FILE="$2"; shift 2 ;;
    --aab) BUILD_AAB=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$COMMAND" in
  build|publish|build-and-publish) ;;
  *) usage >&2; exit 2 ;;
esac
case "$PLATFORM" in
  android|ios|all) ;;
  *) echo "不支持的平台：$PLATFORM" >&2; exit 2 ;;
esac
if [[ "$COMMAND" == "publish" || "$COMMAND" == "build-and-publish" ]] && [[ "$PLATFORM" == "android" ]]; then
  echo "Android APK 不再通过 flycn 发布；请推送 v* tag 使用 android-release.yml。" >&2
  exit 2
fi
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "版本号必须是三段数字版本（MAJOR.MINOR.PATCH）：$VERSION" >&2
  exit 2
fi
if [[ "$VERSION" != "$PACKAGE_VERSION" ]]; then
  echo "版本号必须与 frontend/package.json 一致：$VERSION != $PACKAGE_VERSION" >&2
  exit 2
fi
if [[ ! "$RELEASE" =~ ^[0-9]{12}$ ]]; then
  echo "release 必须是 12 位 yymmddhhMMss 数字：$RELEASE" >&2
  exit 2
fi
if [[ ! "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
  echo "构建号必须是正整数：$BUILD_NUMBER" >&2
  exit 2
fi
if [[ "$BUILD_NUMBER" -gt 2100000000 ]]; then
  echo "Android versionCode 不能超过 2100000000：$BUILD_NUMBER" >&2
  exit 2
fi

ANDROID_ARTIFACT=""
IOS_ARTIFACT=""
ANDROID_AAB=""
SIGNING_TEMP_DIR=""
ANDROID_SIGNING_PROPERTIES=""

cleanup() {
  if [[ -n "$SIGNING_TEMP_DIR" && -d "$SIGNING_TEMP_DIR" ]]; then
    rm -rf "$SIGNING_TEMP_DIR"
  fi
}
trap cleanup EXIT

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ '
    printf '%q ' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

run_in_frontend() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '+ (cd %q && ' "$FRONTEND_DIR"
    printf '%q ' "$@"
    printf ')\n'
    return 0
  fi
  (cd "$FRONTEND_DIR" && "$@")
}

resolve_android_signing() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    ANDROID_SIGNING_PROPERTIES="/tmp/fridgeboard-release/keystore.properties"
    return
  fi
  if [[ -n "${FRIDGEBOARD_ANDROID_KEYSTORE_PROPERTIES:-}" ]]; then
    ANDROID_SIGNING_PROPERTIES="$FRIDGEBOARD_ANDROID_KEYSTORE_PROPERTIES"
  elif [[ -n "${FRIDGEBOARD_ANDROID_KEYSTORE_BASE64:-}" ]]; then
    : "${FRIDGEBOARD_ANDROID_KEY_ALIAS:?缺少 FRIDGEBOARD_ANDROID_KEY_ALIAS}"
    : "${FRIDGEBOARD_ANDROID_KEY_PASSWORD:?缺少 FRIDGEBOARD_ANDROID_KEY_PASSWORD}"
    SIGNING_TEMP_DIR="$(mktemp -d)"
    if ! printf '%s' "$FRIDGEBOARD_ANDROID_KEYSTORE_BASE64" | base64 --decode >"$SIGNING_TEMP_DIR/release.jks" 2>/dev/null; then
      printf '%s' "$FRIDGEBOARD_ANDROID_KEYSTORE_BASE64" | base64 -D >"$SIGNING_TEMP_DIR/release.jks"
    fi
    cat >"$SIGNING_TEMP_DIR/keystore.properties" <<EOF
storeFile=$SIGNING_TEMP_DIR/release.jks
storePassword=${FRIDGEBOARD_ANDROID_STORE_PASSWORD:-$FRIDGEBOARD_ANDROID_KEY_PASSWORD}
keyAlias=$FRIDGEBOARD_ANDROID_KEY_ALIAS
keyPassword=$FRIDGEBOARD_ANDROID_KEY_PASSWORD
EOF
    chmod 600 "$SIGNING_TEMP_DIR/release.jks" "$SIGNING_TEMP_DIR/keystore.properties"
    ANDROID_SIGNING_PROPERTIES="$SIGNING_TEMP_DIR/keystore.properties"
  elif [[ -f "$FRONTEND_DIR/android/keystore.properties" ]]; then
    ANDROID_SIGNING_PROPERTIES="$FRONTEND_DIR/android/keystore.properties"
  else
    echo "未找到 Android release 签名材料；请配置 FRIDGEBOARD_ANDROID_KEYSTORE_PROPERTIES 或 *_KEYSTORE_BASE64。" >&2
    exit 1
  fi
  ANDROID_SIGNING_PROPERTIES="$(CDPATH= cd -- "$(dirname -- "$ANDROID_SIGNING_PROPERTIES")" && pwd)/$(basename -- "$ANDROID_SIGNING_PROPERTIES")"
  [[ -f "$ANDROID_SIGNING_PROPERTIES" ]] || {
    echo "Android keystore properties 文件不存在：$ANDROID_SIGNING_PROPERTIES" >&2
    exit 1
  }
}

prepare_web_assets() {
  export VITE_APP_RELEASE="$RELEASE"
  run npm run --prefix "$FRONTEND_DIR" build
  if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
    run_in_frontend npx cap sync android
  fi
  if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
    run_in_frontend npx cap sync ios
  fi
}

build_android() {
  resolve_android_signing
  export FRIDGEBOARD_ANDROID_KEYSTORE_PROPERTIES="$ANDROID_SIGNING_PROPERTIES"
  export FRIDGEBOARD_ANDROID_VERSION_CODE="$BUILD_NUMBER"
  export FRIDGEBOARD_APP_VERSION="$VERSION"
  local tasks=(assembleRelease)
  [[ "$BUILD_AAB" -eq 1 ]] && tasks+=(bundleRelease)
  run "$FRONTEND_DIR/scripts/build-android.sh" "${tasks[@]}"
  if [[ "$DRY_RUN" -eq 1 ]]; then return; fi
  mkdir -p "$OUT_DIR"
  local source="$FRONTEND_DIR/android/app/build/outputs/apk/release/app-release.apk"
  [[ -f "$source" ]] || { echo "未找到 Android release APK：$source" >&2; exit 1; }
  ANDROID_ARTIFACT="$OUT_DIR/FridgeBoard-$VERSION-android-$BUILD_NUMBER.apk"
  cp "$source" "$ANDROID_ARTIFACT"
  node "$ROOT_DIR/scripts/verify-mobile-artifact.mjs" --platform android --path "$ANDROID_ARTIFACT" --version "$VERSION" --build-number "$BUILD_NUMBER"
  if [[ "$BUILD_AAB" -eq 1 ]]; then
    local aab_source="$FRONTEND_DIR/android/app/build/outputs/bundle/release/app-release.aab"
    [[ -f "$aab_source" ]] || { echo "未找到 Android release AAB：$aab_source" >&2; exit 1; }
    ANDROID_AAB="$OUT_DIR/FridgeBoard-$VERSION-android.aab"
    cp "$aab_source" "$ANDROID_AAB"
  fi
}

build_ios() {
  local team_id="${FRIDGEBOARD_IOS_TEAM_ID:-TEAM_ID_REQUIRED_FOR_REAL_BUILD}"
  local export_method="${FRIDGEBOARD_IOS_EXPORT_METHOD:-ad-hoc}"
  local profile_specifier="${FRIDGEBOARD_IOS_PROVISIONING_PROFILE_SPECIFIER:-}"
  local code_sign_identity="${FRIDGEBOARD_IOS_CODE_SIGN_IDENTITY:-}"
  local signing_style="automatic"
  if [[ "$DRY_RUN" -eq 0 && -z "${FRIDGEBOARD_IOS_TEAM_ID:-}" ]]; then
    echo "缺少 FRIDGEBOARD_IOS_TEAM_ID；IPA 必须使用可分发签名身份" >&2
    exit 1
  fi
  if [[ -n "$profile_specifier" ]]; then
    [[ "$profile_specifier" =~ ^[A-Za-z0-9._\ -]+$ ]] || {
      echo "FRIDGEBOARD_IOS_PROVISIONING_PROFILE_SPECIFIER 含有不支持的字符" >&2
      exit 1
    }
    signing_style="manual"
  elif [[ -n "$code_sign_identity" ]]; then
    echo "配置 FRIDGEBOARD_IOS_CODE_SIGN_IDENTITY 时必须同时配置 provisioning profile" >&2
    exit 1
  fi
  export FRIDGEBOARD_APP_VERSION="$VERSION"
  local archive_dir="$OUT_DIR/ios-archive"
  local export_dir="$OUT_DIR/ios-export"
  local export_options="$OUT_DIR/ExportOptions.plist"
  local archive_args=(-project "$FRONTEND_DIR/ios/App/App.xcodeproj" -scheme App -configuration Release -sdk iphoneos -archivePath "$archive_dir/FridgeBoard.xcarchive" MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" DEVELOPMENT_TEAM="$team_id")
  if [[ "$signing_style" == "manual" ]]; then
    archive_args+=(CODE_SIGN_STYLE=Manual PROVISIONING_PROFILE_SPECIFIER="$profile_specifier")
    [[ -n "$code_sign_identity" ]] && archive_args+=(CODE_SIGN_IDENTITY="$code_sign_identity")
  fi
  [[ "${FRIDGEBOARD_ALLOW_PROVISIONING_UPDATES:-0}" == "1" ]] && archive_args+=(-allowProvisioningUpdates)
  if [[ "$DRY_RUN" -eq 1 ]]; then
    run xcodebuild "${archive_args[@]}" archive
    return
  fi
  mkdir -p "$OUT_DIR" "$archive_dir" "$export_dir"
  cat >"$export_options" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>${export_method}</string>
  <key>signingStyle</key><string>${signing_style}</string>
  <key>teamID</key><string>${team_id}</string>
EOF
  if [[ "$signing_style" == "manual" ]]; then
    cat >>"$export_options" <<EOF
  <key>provisioningProfiles</key><dict>
    <key>com.fridgeboard.app</key><string>${profile_specifier}</string>
  </dict>
EOF
  fi
  cat >>"$export_options" <<'EOF'
  <key>compileBitcode</key><false/>
</dict></plist>
EOF
  xcodebuild "${archive_args[@]}" archive
  local export_args=(-exportArchive -archivePath "$archive_dir/FridgeBoard.xcarchive" -exportOptionsPlist "$export_options" -exportPath "$export_dir")
  [[ "${FRIDGEBOARD_ALLOW_PROVISIONING_UPDATES:-0}" == "1" ]] && export_args+=(-allowProvisioningUpdates)
  xcodebuild "${export_args[@]}"
  local source
  source="$(find "$export_dir" -type f -name '*.ipa' -print -quit)"
  [[ -n "$source" ]] || { echo "未找到 iOS IPA：$export_dir" >&2; exit 1; }
  IOS_ARTIFACT="$OUT_DIR/FridgeBoard-$VERSION-ios.ipa"
  cp "$source" "$IOS_ARTIFACT"
  node "$ROOT_DIR/scripts/verify-mobile-artifact.mjs" --platform ios --path "$IOS_ARTIFACT" --version "$VERSION" --build-number "$BUILD_NUMBER"
}

publish_artifact() {
  local platform="$1" variant="$2" file_path="$3"
  if [[ "$DRY_RUN" -eq 0 && ! -f "$file_path" ]]; then
    echo "待发布产物不存在：$file_path" >&2
    exit 1
  fi
  if [[ "$DRY_RUN" -eq 0 ]]; then
    : "${FLYCN_PUBLISH_TOKEN:?缺少 FLYCN_PUBLISH_TOKEN；不会尝试匿名上传}"
  fi
  local base_url="${FLYCN_BASE_URL:-https://app.flycn.fyi}"
  local slug="${FLYCN_APP_SLUG:-fridgeboard}"
  local notes=""
  if [[ -n "$NOTES_FILE" ]]; then
    [[ -f "$NOTES_FILE" ]] || { echo "发布说明文件不存在：$NOTES_FILE" >&2; exit 1; }
    notes="$(<"$NOTES_FILE")"
  fi
  echo "发布 ${platform}/${variant}：$(basename -- "$file_path")"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "  POST $base_url/api/apps/$slug/releases"
    return
  fi
  /usr/bin/curl --fail-with-body --silent --show-error --request POST \
    --url "$base_url/api/apps/$slug/releases" \
    --header "Authorization: Bearer $FLYCN_PUBLISH_TOKEN" \
    --form-string "platform=$platform" \
    --form-string "variant=$variant" \
    --form-string "version=$VERSION" \
    --form-string "build_number=$BUILD_NUMBER" \
    --form-string "release_notes=$notes" \
    --form "artifact=@$file_path"
  echo
}

if [[ "$COMMAND" == "build" || "$COMMAND" == "build-and-publish" ]]; then
  mkdir -p "$OUT_DIR"
  prepare_web_assets
  if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then build_android; fi
  if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then build_ios; fi
fi

if [[ "$COMMAND" == "publish" || "$COMMAND" == "build-and-publish" ]]; then
  [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]] && IOS_ARTIFACT="${IOS_ARTIFACT:-$OUT_DIR/FridgeBoard-$VERSION-ios.ipa}"
  [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]] && publish_artifact ios universal "$IOS_ARTIFACT"
fi

echo "移动发布流程完成。版本=${VERSION}，release=${RELEASE}，构建号=${BUILD_NUMBER}，产物目录=${OUT_DIR}"
