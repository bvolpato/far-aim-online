#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
REPO_ROOT="$(cd "$PROJECT_DIR/../.." && pwd)"
BUILD_DIR="$PROJECT_DIR/build/release"
ARCHIVE_PATH="$BUILD_DIR/FARAIMPro.xcarchive"
EXPORT_PATH="$BUILD_DIR/export"
EXPORT_OPTIONS_PLIST="$BUILD_DIR/ExportOptions.plist"
PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"

PROJECT="FARAIMPro.xcodeproj"
SCHEME="FARAIMPro"
BUNDLE_ID="${IOS_BUNDLE_ID:-com.faraimpro.ios}"
EXPORT_METHOD="${IOS_EXPORT_METHOD:-app-store-connect}"
CODE_SIGN_IDENTITY="${IOS_CODE_SIGN_IDENTITY:-Apple Distribution}"
SKIP_SYNC=false
SKIP_SIM_BUILD=false

usage() {
  cat <<'USAGE'
Usage: mobile/ios/release.sh [--skip-sync] [--skip-simulator-build]

Builds signed App Store IPA. Must run on macOS with Xcode.

Required env:
  IOS_TEAM_ID
  IOS_PROFILE_NAME
  IOS_BUILD_NUMBER       unique App Store build number
  RELEASE_CREDENTIALS_MANIFEST_GENERATION  reviewed private manifest generation

Certificate/profile input:
  Generation-pinned files fetched from the private GCS signing bucket through
  gcloud user login. Quarantined historical credentials cannot sign releases.
  Public CI only builds unsigned artifacts.

Optional env:
  IOS_BUNDLE_ID            default: com.faraimpro.ios
  IOS_EXPORT_METHOD        default: app-store-connect
  IOS_MARKETING_VERSION
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --skip-sync)
      SKIP_SYNC=true
      ;;
    --skip-simulator-build)
      SKIP_SIM_BUILD=true
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: required command not found: $1" >&2
    exit 1
  }
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "error: required environment variable '$name' is not set" >&2
    exit 1
  fi
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: iOS release builds require macOS with Xcode" >&2
  exit 1
fi

require_cmd xcodebuild
require_cmd security
require_cmd xcrun
require_cmd /usr/libexec/PlistBuddy
require_env IOS_TEAM_ID
require_env IOS_PROFILE_NAME
require_env IOS_BUILD_NUMBER

if [[ "${RELEASE_CREDENTIALS_PLATFORM:-}" != ios ]]; then
  require_cmd uv
  exec uv run --script "$REPO_ROOT/scripts/release_credentials.py" \
    --platform ios -- "$PROJECT_DIR/release.sh" "$@"
fi

require_env RELEASE_CREDENTIALS_DIR
require_env IOS_CERTIFICATE_PATH
require_env IOS_PROVISIONING_PROFILE_PATH
require_env IOS_P12_PASSWORD_FILE
SIGNING_DIR="$RELEASE_CREDENTIALS_DIR"
KEYCHAIN_PATH="$SIGNING_DIR/release.keychain-db"
CERT_PATH="$IOS_CERTIFICATE_PATH"
PROFILE_PATH="$IOS_PROVISIONING_PROFILE_PATH"
KEYCHAIN_CREATED=0
INSTALLED_PROFILE=""
PROFILE_BACKUP=""
ORIGINAL_KEYCHAINS=()
while IFS= read -r keychain; do
  ORIGINAL_KEYCHAINS+=("$keychain")
done < <(security list-keychains -d user | sed -E 's/^ *"//; s/" *$//')
ORIGINAL_DEFAULT=$(security default-keychain -d user | sed -E 's/^ *"//; s/" *$//')

cleanup() {
  if [[ "$KEYCHAIN_CREATED" -eq 1 ]]; then
    security list-keychains -d user -s "${ORIGINAL_KEYCHAINS[@]}" >/dev/null 2>&1 || true
    security default-keychain -d user -s "$ORIGINAL_DEFAULT" >/dev/null 2>&1 || true
    security delete-keychain "$KEYCHAIN_PATH" >/dev/null 2>&1 || true
  fi
  if [[ -n "$INSTALLED_PROFILE" ]]; then
    if [[ -n "$PROFILE_BACKUP" ]]; then
      cp "$PROFILE_BACKUP" "$INSTALLED_PROFILE"
    else
      rm -f -- "$INSTALLED_PROFILE"
    fi
  fi
  rm -f -- "$EXPORT_OPTIONS_PLIST"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

XCODE_VERSION="$(xcodebuild -version | awk '/^Xcode / { print $2; exit }')"
XCODE_MAJOR="${XCODE_VERSION%%.*}"
if [[ ! "$XCODE_MAJOR" =~ ^[0-9]+$ || "$XCODE_MAJOR" -lt 26 ]]; then
  echo "error: Xcode 26 or later is required for App Store uploads (found ${XCODE_VERSION:-unknown})" >&2
  exit 1
fi

IOS_SDK_VERSION="$(xcrun --sdk iphoneos --show-sdk-version)"
IOS_SDK_MAJOR="${IOS_SDK_VERSION%%.*}"
if [[ ! "$IOS_SDK_MAJOR" =~ ^[0-9]+$ || "$IOS_SDK_MAJOR" -lt 26 ]]; then
  echo "error: iOS 26 SDK or later is required for App Store uploads (found ${IOS_SDK_VERSION:-unknown})" >&2
  exit 1
fi

if [[ "$SKIP_SYNC" = false ]]; then
  "$REPO_ROOT/scripts/sync-data.sh" ios
fi

mkdir -p "$BUILD_DIR" "$EXPORT_PATH" "$PROFILE_DIR"
rm -rf -- "${ARCHIVE_PATH:?}" "${EXPORT_PATH:?}"
mkdir -p "$EXPORT_PATH"

[[ -f "$CERT_PATH" ]] || {
  echo "error: missing signing certificate: $CERT_PATH" >&2
  exit 1
}
[[ -f "$PROFILE_PATH" ]] || {
  echo "error: missing provisioning profile: $PROFILE_PATH" >&2
  exit 1
}

[[ -f "$IOS_P12_PASSWORD_FILE" && "$(wc -c < "$IOS_P12_PASSWORD_FILE")" -le 4096 ]] || {
  echo "error: a verified P12 password file is required" >&2
  exit 1
}
IOS_P12_PASSWORD=$(cat "$IOS_P12_PASSWORD_FILE")
[[ -n "$IOS_P12_PASSWORD" && ! -e "$KEYCHAIN_PATH" ]] || {
  echo "error: signing password is empty or temporary keychain already exists" >&2
  exit 1
}
security create-keychain -p "" "$KEYCHAIN_PATH"
KEYCHAIN_CREATED=1
security list-keychains -d user -s "$KEYCHAIN_PATH" "${ORIGINAL_KEYCHAINS[@]}"
security default-keychain -d user -s "$KEYCHAIN_PATH"
security unlock-keychain -p "" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 3600 "$KEYCHAIN_PATH"
security import "$CERT_PATH" -k "$KEYCHAIN_PATH" -P "$IOS_P12_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null 2>&1 || {
  echo "error: importing the verified signing certificate failed" >&2
  exit 1
}
unset IOS_P12_PASSWORD
security set-key-partition-list -S apple-tool:,apple: -s -k "" "$KEYCHAIN_PATH" >/dev/null

PROFILE_PLIST="$SIGNING_DIR/profile.plist"
security cms -D -i "$PROFILE_PATH" > "$PROFILE_PLIST"
PROFILE_UUID=$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$PROFILE_PLIST")
[[ "$PROFILE_UUID" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]] || {
  echo "error: provisioning profile has an invalid UUID" >&2
  exit 1
}
INSTALLED_PROFILE="$PROFILE_DIR/$PROFILE_UUID.mobileprovision"
if [[ -e "$INSTALLED_PROFILE" ]]; then
  PROFILE_BACKUP="$SIGNING_DIR/profile-before.mobileprovision"
  cp "$INSTALLED_PROFILE" "$PROFILE_BACKUP"
fi
cp "$PROFILE_PATH" "$INSTALLED_PROFILE"

cat > "$EXPORT_OPTIONS_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>$EXPORT_METHOD</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>teamID</key>
    <string>$IOS_TEAM_ID</string>
    <key>provisioningProfiles</key>
    <dict>
        <key>$BUNDLE_ID</key>
        <string>$IOS_PROFILE_NAME</string>
    </dict>
</dict>
</plist>
PLIST

XCODE_COMMON_ARGS=(
  -project "$PROJECT"
  -scheme "$SCHEME"
  -configuration Release
)

VERSION_ARGS=("CURRENT_PROJECT_VERSION=$IOS_BUILD_NUMBER")
if [[ -n "${IOS_MARKETING_VERSION:-}" ]]; then
  VERSION_ARGS+=("MARKETING_VERSION=$IOS_MARKETING_VERSION")
fi

cd "$PROJECT_DIR"

if [[ "$SKIP_SIM_BUILD" = false ]]; then
  SIM_DESTINATION="${IOS_SIM_DESTINATION:-platform=iOS Simulator,name=iPhone 17,OS=26.5}"
  xcodebuild clean test \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration Debug \
    -destination "$SIM_DESTINATION" \
    CODE_SIGNING_ALLOWED=NO \
    "${VERSION_ARGS[@]}"
fi

xcodebuild archive \
  "${XCODE_COMMON_ARGS[@]}" \
  -sdk iphoneos \
  -archivePath "$ARCHIVE_PATH" \
  CODE_SIGNING_ALLOWED=YES \
  CODE_SIGN_STYLE=Manual \
  PROVISIONING_PROFILE_SPECIFIER="$IOS_PROFILE_NAME" \
  CODE_SIGN_IDENTITY="$CODE_SIGN_IDENTITY" \
  DEVELOPMENT_TEAM="$IOS_TEAM_ID" \
  "${VERSION_ARGS[@]}"

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" \
  -exportPath "$EXPORT_PATH"

IPA_PATH=$(find "$EXPORT_PATH" -name '*.ipa' -type f | sort | head -n 1 || true)
[[ -n "$IPA_PATH" ]] || {
  echo "error: IPA not generated" >&2
  exit 1
}

BUNDLE_VERSION=$(/usr/libexec/PlistBuddy -c "Print :ApplicationProperties:CFBundleVersion" "$ARCHIVE_PATH/Info.plist")
SHORT_VERSION=$(/usr/libexec/PlistBuddy -c "Print :ApplicationProperties:CFBundleShortVersionString" "$ARCHIVE_PATH/Info.plist")

echo "ipa: $IPA_PATH"
echo "version: $SHORT_VERSION ($BUNDLE_VERSION)"
