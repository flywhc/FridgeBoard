#!/usr/bin/env sh
set -eu

java_major() {
  "$1/bin/java" -version 2>&1 | sed -n 's/.*version "\([0-9][0-9]*\).*/\1/p' | head -n 1
}

if [ "$(java_major "${JAVA_HOME:-/missing}")" != "21" ]; then
  JAVA_21_HOME=""
  if [ "$(uname -s)" = "Darwin" ] && command -v /usr/libexec/java_home >/dev/null 2>&1; then
    JAVA_21_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
    if [ "$(java_major "${JAVA_21_HOME:-/missing}")" != "21" ]; then
      JAVA_21_HOME=""
    fi
    if [ -z "$JAVA_21_HOME" ] && command -v mdfind >/dev/null 2>&1; then
      ANDROID_STUDIO="$(mdfind "kMDItemCFBundleIdentifier == 'com.google.android.studio'" | head -n 1)"
      if [ -n "$ANDROID_STUDIO" ] && [ -x "$ANDROID_STUDIO/Contents/jbr/Contents/Home/bin/java" ]; then
        JAVA_21_HOME="$ANDROID_STUDIO/Contents/jbr/Contents/Home"
      fi
    fi
  fi
  if [ -n "$JAVA_21_HOME" ]; then
    JAVA_HOME="$JAVA_21_HOME"
    export JAVA_HOME
  fi
fi

if [ -z "${JAVA_HOME:-}" ]; then
  printf '%s\n' '需要 JDK 21。请设置 JAVA_HOME，或在 Android Studio 的 Gradle JDK 中选择 Java 21。' >&2
  exit 1
fi

JAVA_MAJOR="$(java_major "$JAVA_HOME")"
if [ "$JAVA_MAJOR" != "21" ]; then
  printf '需要 JDK 21，当前 JAVA_HOME 是 Java %s。\n' "${JAVA_MAJOR:-未知}" >&2
  exit 1
fi

cd "$(dirname "$0")/../android"
TASK="${1:-assembleDebug}"
if [ "$#" -gt 0 ]; then
  shift
fi
./gradlew "$TASK" "$@"

if [ "$TASK" = "assembleDebug" ]; then
  APK_SOURCE="app/build/outputs/apk/debug/app-debug.apk"
  APK_TARGET="app/build/outputs/apk/debug/FridgeBoard-debug.apk"
  cp "$APK_SOURCE" "$APK_TARGET"
  printf 'APK: %s\n' "$APK_TARGET"
fi
