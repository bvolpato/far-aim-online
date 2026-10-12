#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
UNSIGNED=false
UNSIGNED_DIR=""

usage() {
  cat <<'USAGE'
Usage: mobile/android/release.sh [--unsigned]

Builds release APK/AAB files. --unsigned requires no signing credentials.
Signed releases fetch generation-pinned files from the private GCS signing bucket
using gcloud user login. Public CI only builds unsigned artifacts.

Required for signed release:
  RELEASE_CREDENTIALS_MANIFEST_GENERATION  reviewed private manifest generation
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --unsigned) UNSIGNED=true ;;
    --help|-h) usage; exit 0 ;;
    *) echo "error: unknown argument: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "$UNSIGNED" = false && "${RELEASE_CREDENTIALS_PLATFORM:-}" != android ]]; then
  command -v uv >/dev/null || { echo "error: uv is required for private signing inputs" >&2; exit 1; }
  exec uv run --script "$REPO_ROOT/scripts/release_credentials.py" \
    --platform android -- "$SCRIPT_DIR/release.sh" "$@"
fi

cleanup() {
  if [[ -n "$UNSIGNED_DIR" ]]; then
    rm -rf -- "$UNSIGNED_DIR"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

command -v java >/dev/null || { echo "error: Java 17+ is required" >&2; exit 1; }
JAVA_VERSION="$(java -version 2>&1 | sed -n '1s/.*version "\([^"]*\)".*/\1/p')"
JAVA_MAJOR="${JAVA_VERSION%%.*}"
[[ "$JAVA_MAJOR" =~ ^[0-9]+$ && "$JAVA_MAJOR" -ge 17 ]] || {
  echo "error: Java 17+ is required" >&2
  exit 1
}

if [[ "$UNSIGNED" = true ]]; then
  UNSIGNED_DIR="$(mktemp -d "${TMPDIR:-/tmp}/far-aim-online-unsigned.XXXXXXXX")"
  export ANDROID_KEYSTORE_PROPERTIES_PATH="$UNSIGNED_DIR/no-signing.properties"
else
  [[ -f "${ANDROID_KEYSTORE_PROPERTIES_PATH:-}" && -f "${ANDROID_KEYSTORE_PATH:-}" ]] || {
    echo "error: verified private Android signing files are required" >&2
    exit 1
  }
fi

"$REPO_ROOT/scripts/sync-data.sh" android

cd "$SCRIPT_DIR"
./gradlew testDebugUnitTest --stacktrace --no-daemon
./gradlew clean assembleRelease bundleRelease --stacktrace --no-daemon

APK_PATH=$(find app/build/outputs/apk/release -name '*.apk' -type f | sort | head -n 1 || true)
AAB_PATH=$(find app/build/outputs/bundle/release -name '*.aab' -type f | sort | head -n 1 || true)
[[ -n "$APK_PATH" && -n "$AAB_PATH" ]] || { echo "error: release APK/AAB not generated" >&2; exit 1; }
if [[ "$UNSIGNED" = false && "$APK_PATH" == *unsigned* ]]; then
  echo "error: signed build produced an unsigned APK" >&2
  exit 1
fi
printf 'apk: %s/%s\naab: %s/%s\n' "$SCRIPT_DIR" "$APK_PATH" "$SCRIPT_DIR" "$AAB_PATH"
