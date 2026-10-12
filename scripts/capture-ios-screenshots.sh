#!/usr/bin/env bash
set -euo pipefail

# Dir configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IOS_PROJECT_DIR="$REPO_ROOT/mobile/ios"
BUILD_DIR="$IOS_PROJECT_DIR/build/simulator"
APP_PATH="$BUILD_DIR/Build/Products/Debug-iphonesimulator/FARAIMPro.app"

IPHONE_DIR="$REPO_ROOT/store/ios/screenshots/iphone"
IPAD_DIR="$REPO_ROOT/store/ios/screenshots/ipad"

mkdir -p "$IPHONE_DIR" "$IPAD_DIR"

echo "[INFO] Cleaning and building FARAIMPro for simulator..."
cd "$IOS_PROJECT_DIR"
xcodebuild clean build \
  -project FARAIMPro.xcodeproj \
  -scheme FARAIMPro \
  -destination 'platform=iOS Simulator,name=iPhone 13 Pro Max' \
  -configuration Debug \
  -derivedDataPath "$BUILD_DIR" \
  CODE_SIGNING_ALLOWED=NO

if [ ! -d "$APP_PATH" ]; then
  echo "[ERROR] Built app not found at $APP_PATH"
  exit 1
fi
echo "[INFO] Build succeeded: $APP_PATH"

capture_screenshots_for_device() {
  local device_name="$1"
  local output_dir="$2"
  local is_ipad="$3"
  
  echo "[INFO] Detecting simulator ID for '$device_name'..."
  local device_id
  device_id=$(xcrun simctl list devices available | grep "$device_name" | head -1 | sed 's/.*(\([A-Z0-9-]*\)).*/\1/')
  
  if [ -z "$device_id" ]; then
    echo "[ERROR] Device '$device_name' not found in available simulators."
    exit 1
  fi
  echo "[INFO] Using device: $device_name ($device_id)"
  
  echo "[INFO] Booting simulator..."
  xcrun simctl boot "$device_id" || true
  sleep 15
  
  echo "[INFO] Installing application..."
  xcrun simctl install "$device_id" "$APP_PATH"
  
  echo "[INFO] Setting up clean status bar and terminating conflicts..."
  xcrun simctl status_bar "$device_id" override --time "09:41" --batteryState charged --batteryLevel 100 || true
  xcrun simctl terminate "$device_id" com.imageid.ios || true
  
  echo "[INFO] Warming up application..."
  xcrun simctl launch "$device_id" com.faraimpro.ios >/dev/null 2>&1 || true
  sleep 6
  xcrun simctl terminate "$device_id" com.faraimpro.ios || true
  sleep 2
  
  capture_route() {
    local route="$1"
    local filename="$2"
    local query="${3:-}"
    
    echo "  -> Capturing route '$route' to '$filename'..."
    xcrun simctl terminate "$device_id" com.faraimpro.ios || true
    if [ -n "$query" ]; then
      xcrun simctl launch "$device_id" com.faraimpro.ios --initial-route "$route" --initial-query "$query"
    else
      xcrun simctl launch "$device_id" com.faraimpro.ios --initial-route "$route"
    fi
    sleep 8
    xcrun simctl io "$device_id" screenshot "$output_dir/$filename"
  }
  
  if [ "$is_ipad" = false ]; then
    # iPhone Screenshots
    capture_route home 01_home.png
    capture_route far 02_far.png
    capture_route far-part-61 02b_far_part61.png
    capture_route aim 03_aim.png
    capture_route study 04_study.png
    capture_route more 05_more.png
    capture_route advisory-circulars 06_advisory_circulars.png
    capture_route search 07_search.png medical
    capture_route updates 08_updates.png
  else
    # iPad Screenshots
    capture_route home 01_home.png
    capture_route far 02_far.png
    capture_route far-part-61 02b_far_part61.png
    capture_route aim 03_aim.png
    capture_route study 04_study.png
    capture_route advisory-circulars 05_advisory_circulars.png
    capture_route glossary 06_glossary.png
    capture_route search 07_search.png medical
    capture_route updates 08_updates.png
  fi
  
  echo "[INFO] Shutting down simulator..."
  xcrun simctl shutdown "$device_id" || true
}

# Capture iPhone (6.5" / iPhone 13 Pro Max)
capture_screenshots_for_device "iPhone 13 Pro Max" "$IPHONE_DIR" false

# Capture iPad (12.9" / iPad Air 13-inch M3)
capture_screenshots_for_device "iPad Air 13-inch (M3)" "$IPAD_DIR" true

echo "[INFO] All screenshots updated successfully!"
