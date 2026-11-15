#!/usr/bin/env bash
set -euo pipefail

IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$IOS_DIR/../.." && pwd)"
BUILD_ROOT="$IOS_DIR/build/linux"
LIMULATOR_ROOT="${LIMULATOR_DATA_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/limulator}"
XTOOL="${FARAIM_XTOOL:-$LIMULATOR_ROOT/tools/bin/xtool}"
SWIFT="${FARAIM_SWIFT:-$LIMULATOR_ROOT/swiftly/toolchains/6.4.1/usr/bin/swift}"
COMMAND="${1:-build}"
CONFIGURATION="${2:-release}"

usage() {
  cat <<'USAGE'
Usage: mobile/ios/build-linux.sh doctor | build [debug|release]

Build the native arm64 iOS app from Linux with the prepared xtool/Apple SDK.
No signing identity, Apple login, installation, or upload is performed.
Set FARAIM_XTOOL and FARAIM_SWIFT to use explicit tool paths.
IOS_BUILD_NUMBER overrides the native project's build number.
USAGE
}

case "$COMMAND" in
  -h|--help) usage; exit 0 ;;
  doctor|build) ;;
  *) usage >&2; exit 2 ;;
esac
[[ $# -le 2 && "$CONFIGURATION" =~ ^(debug|release)$ ]] || { usage >&2; exit 2; }
[[ "$(uname -s)" == Linux ]] || { echo 'error: this workflow requires Linux' >&2; exit 1; }
[[ -x "$XTOOL" && -x "$SWIFT" ]] || {
  echo 'error: prepared xtool and Swift 6.4.1 are required; set FARAIM_XTOOL/FARAIM_SWIFT or prepare the Limulator toolchain' >&2
  exit 1
}
for tool in jq flock node sha256sum; do
  command -v "$tool" >/dev/null || { echo "error: missing required command: $tool" >&2; exit 1; }
done
TOOL_VERSION="$("$XTOOL" --version)"
[[ "$TOOL_VERSION" == 'xtool commit e3c615391817cde2512a38118a064f834ff64a32' ]] || {
  echo "error: unexpected xtool revision: $TOOL_VERSION" >&2; exit 1
}
SWIFT_VERSION="$("$SWIFT" --version)"
[[ "$SWIFT_VERSION" == 'Swift version 6.4.1 '* ]] || { echo "error: Swift 6.4.1 is required: $SWIFT_VERSION" >&2; exit 1; }
SDK_METADATA="$("$XTOOL" sdk status --triple arm64-apple-ios --build-metadata)"
jq -e '.DTSDKName == "iphoneos27.2" and .DTPlatformVersion == "27.2" and .DTXcodeBuild == "27B52"' <<<"$SDK_METADATA" >/dev/null || {
  echo 'error: the prepared SDK must come from stable Xcode 27.2 (27B52)' >&2; exit 1
}
printf '%s\n%s\n%s\n' "$TOOL_VERSION" "$SWIFT_VERSION" "$SDK_METADATA"
[[ "$COMMAND" != doctor ]] || exit 0

mkdir -p "$BUILD_ROOT"
exec 9>"$BUILD_ROOT/.lock"
flock -n 9 || { echo 'error: another FAR/AIM Linux build is running' >&2; exit 1; }
SOURCE_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
SOURCE_DIRTY=false
[[ -z "$(git -C "$REPO_ROOT" status --porcelain)" ]] || SOURCE_DIRTY=true

node "$REPO_ROOT/scripts/build_inverted_index.js" --check
"$REPO_ROOT/scripts/sync-data.sh" ios
"$SWIFT" build --package-path "$IOS_DIR/linux-tools" --scratch-path "$BUILD_ROOT/tools" -c release
TOOLS_BIN="$("$SWIFT" build --package-path "$IOS_DIR/linux-tools" --scratch-path "$BUILD_ROOT/tools" -c release --show-bin-path)"
"$TOOLS_BIN/prepare-faraim" prepare "$IOS_DIR" "$BUILD_ROOT/resources"
mkdir -p "$BUILD_ROOT/package"
for name in Package.swift FARAIMPro; do
  target="$BUILD_ROOT/package/$name"
  [[ ! -e "$target" || -L "$target" ]] || { echo "error: expected generated symlink: $target" >&2; exit 1; }
  ln -sfn "$IOS_DIR/$name" "$target"
done
cp "$BUILD_ROOT/resources/xtool.yml" "$BUILD_ROOT/package/xtool.yml"
cd "$BUILD_ROOT/package"
"$XTOOL" dev build --configuration "$CONFIGURATION" --triple arm64-apple-ios
APP="$BUILD_ROOT/package/xtool/FARAIMPro.app"
"$TOOLS_BIN/prepare-faraim" verify "$IOS_DIR" "$APP"
printf '%s\n' "$SDK_METADATA" > "$BUILD_ROOT/sdk-metadata.json"
[[ "$(git -C "$REPO_ROOT" rev-parse HEAD)" == "$SOURCE_SHA" ]] || {
  echo 'error: Git HEAD changed during the build; rebuild to record accurate provenance' >&2; exit 1
}
[[ -z "$(git -C "$REPO_ROOT" status --porcelain)" ]] || SOURCE_DIRTY=true
BINARY_SHA="$(sha256sum "$APP/FARAIMPro" | cut -d ' ' -f 1)"
jq -n --arg sourceCommit "$SOURCE_SHA" --argjson sourceDirty "$SOURCE_DIRTY" \
  --arg xtool "$TOOL_VERSION" --arg swift "$SWIFT_VERSION" --arg configuration "$CONFIGURATION" \
  --arg binarySha256 "$BINARY_SHA" --argjson sdk "$SDK_METADATA" \
  '{sourceCommit:$sourceCommit,sourceDirty:$sourceDirty,xtool:$xtool,swift:$swift,configuration:$configuration,
    binarySha256:$binarySha256,sdk:$sdk,signing:"unsigned",runtimeVerified:false}' \
  > "$BUILD_ROOT/provenance.json"
printf 'App: %s\nProvenance: %s\n' "$APP" "$BUILD_ROOT/provenance.json"
