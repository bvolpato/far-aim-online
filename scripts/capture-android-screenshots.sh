#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <output_dir> <tab_count> <tab5_name> [tab6_name]" >&2
  exit 2
fi

OUTPUT_DIR="$1"
TAB_COUNT="$2"
TAB5_NAME="$3"
TAB6_NAME="${4:-}"

PACKAGE_NAME="com.faraimpro.app"
MAIN_ACTIVITY="$PACKAGE_NAME/.MainActivity"
BOOT_TIMEOUT_S="${ANDROID_SCREENSHOT_BOOT_TIMEOUT_S:-240}"
SERVICE_TIMEOUT_S="${ANDROID_SCREENSHOT_SERVICE_TIMEOUT_S:-90}"
PACKAGE_MANAGER_TIMEOUT_S="${ANDROID_SCREENSHOT_PACKAGE_MANAGER_TIMEOUT_S:-120}"
INSTALL_TIMEOUT_S="${ANDROID_SCREENSHOT_INSTALL_TIMEOUT_S:-120}"
INSTALL_ATTEMPTS="${ANDROID_SCREENSHOT_INSTALL_ATTEMPTS:-3}"
SCREENSHOT_WM_SIZE="${ANDROID_SCREENSHOT_WM_SIZE:-}"

log() {
  echo "[capture] $*"
}

wait_for_boot_complete() {
  log "Waiting for Android boot..."
  local end_ts=$((SECONDS + BOOT_TIMEOUT_S))
  while (( SECONDS < end_ts )); do
    local booted
    booted="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    if [[ "$booted" == "1" ]]; then
      return 0
    fi
    sleep 2
  done
  echo "Android boot did not complete" >&2
  return 1
}

wait_for_service() {
  local service_name="$1"
  local timeout_s="${2:-$SERVICE_TIMEOUT_S}"
  log "Waiting for Android ${service_name} service..."
  local end_ts=$((SECONDS + timeout_s))
  while (( SECONDS < end_ts )); do
    local service_status
    service_status="$(timeout 5 adb shell service check "$service_name" 2>/dev/null || true)"
    if [[ "${service_status,,}" == *"found"* ]]; then
      return 0
    fi
    sleep 2
  done
  echo "Android ${service_name} service did not become ready" >&2
  return 1
}

wait_for_package_manager_ready() {
  local timeout_s="${1:-$PACKAGE_MANAGER_TIMEOUT_S}"
  log "Waiting for Android package manager..."
  local end_ts=$((SECONDS + timeout_s))
  local ready_count=0
  while (( SECONDS < end_ts )); do
    local packages
    packages="$(timeout 15 adb shell cmd package list packages android 2>/dev/null | tr -d '\r' || true)"
    if [[ "$packages" == *"package:android"* ]]; then
      ready_count=$((ready_count + 1))
      if (( ready_count >= 3 )); then
        return 0
      fi
    else
      ready_count=0
    fi
    sleep 3
  done
  echo "Android package manager did not become ready" >&2
  return 1
}

recover_adb_device() {
  log "Recovering adb/device services."
  adb reconnect || true
  adb kill-server || true
  adb start-server || true
  adb wait-for-device
  wait_for_boot_complete
  wait_for_activity_manager
  wait_for_service input "$SERVICE_TIMEOUT_S"
  wait_for_service package "$SERVICE_TIMEOUT_S"
  wait_for_package_manager_ready "$PACKAGE_MANAGER_TIMEOUT_S" || true
}

wait_for_activity_manager() {
  wait_for_service activity "$SERVICE_TIMEOUT_S"
}

ui_dump() {
  timeout 8 adb shell uiautomator dump /sdcard/window_dump.xml >/dev/null 2>&1 || true
  timeout 5 adb shell cat /sdcard/window_dump.xml 2>/dev/null | tr -d '\r' || true
}

has_blocker_ui_with_dump() {
  local dump="$1"
  local lower_dump="${dump,,}"
  [[ "$lower_dump" == *"isn't responding"* ]] ||
    [[ "$lower_dump" == *"isnt responding"* ]] ||
    [[ "$lower_dump" == *"not responding"* ]] ||
    [[ "$lower_dump" == *"close app"* ]]
}

tap_text_button_from_dump() {
  local dump="$1"
  local label="$2"
  local node bounds x1 y1 x2 y2 x y

  node="$(echo "$dump" | sed 's/></>\n</g' | grep "text=\"$label\"" | head -n 1 || true)"
  if [[ -z "$node" ]]; then
    return 1
  fi

  bounds="$(echo "$node" | sed -n 's/.*bounds="\[\([0-9]\+\),\([0-9]\+\)\]\[\([0-9]\+\),\([0-9]\+\)\]".*/\1 \2 \3 \4/p')"
  if [[ -z "$bounds" ]]; then
    return 1
  fi

  read -r x1 y1 x2 y2 <<<"$bounds"
  x=$(( (x1 + x2) / 2 ))
  y=$(( (y1 + y2) / 2 ))
  adb shell input tap "$x" "$y"
  sleep 1
  return 0
}

dismiss_blockers() {
  local dump
  dump="$(ui_dump)"
  if ! has_blocker_ui_with_dump "$dump"; then
    return 1
  fi

  log "Blocker UI detected. Recovering."
  if tap_text_button_from_dump "$dump" "Wait"; then
    sleep 5
    return 0
  fi
  if tap_text_button_from_dump "$dump" "Close app"; then
    sleep 5
    return 0
  fi
  if tap_text_button_from_dump "$dump" "GOT IT"; then
    sleep 2
    return 0
  fi
  if tap_text_button_from_dump "$dump" "OK"; then
    sleep 2
    return 0
  fi
  adb shell input keyevent KEYCODE_BACK || true
  sleep 2
  return 0
}

is_app_foreground() {
  local activities windows
  activities="$(adb shell dumpsys activity activities 2>/dev/null | tr -d '\r' || true)"
  if [[ "$activities" == *"ResumedActivity"*"$PACKAGE_NAME"* ]]; then
    return 0
  fi
  windows="$(adb shell dumpsys window windows 2>/dev/null | tr -d '\r' || true)"
  [[ "$windows" == *"mCurrentFocus"*"$PACKAGE_NAME"* ]] ||
    [[ "$windows" == *"mFocusedApp"*"$PACKAGE_NAME"* ]] ||
    [[ "$windows" == *"imeLayeringTarget"*"$PACKAGE_NAME"* ]] ||
    [[ "$windows" == *"imeInputTarget"*"$PACKAGE_NAME"* ]] ||
    [[ "$windows" == *"imeControlTarget"*"$PACKAGE_NAME"* ]] ||
    [[ "$windows" == *"mInputMethodTarget"*"$PACKAGE_NAME"* ]] ||
    [[ "$windows" == *"mInputMethodInputTarget"*"$PACKAGE_NAME"* ]] ||
    [[ "$windows" == *"inputMethodControlTarget"*"$PACKAGE_NAME"* ]]
}

wait_for_app_foreground() {
  local timeout_s="$1"
  local end_ts
  end_ts=$((SECONDS + timeout_s))
  while (( SECONDS < end_ts )); do
    if is_app_foreground; then
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_for_any_text() {
  local timeout_s="$1"
  shift
  local end_ts
  end_ts=$((SECONDS + timeout_s))
  while (( SECONDS < end_ts )); do
    local dump
    dump="$(ui_dump)"
    if has_blocker_ui_with_dump "$dump"; then
      dismiss_blockers || true
      sleep 2
      continue
    fi
    for label in "$@"; do
      if [[ "$dump" == *"$label"* ]]; then
        return 0
      fi
    done
    sleep 1
  done
  return 1
}

save_debug_state() {
  local name="${1%.png}"
  timeout 15 adb exec-out screencap -p > "$OUTPUT_DIR/debug-${name}.png" || true
  ui_dump > "$OUTPUT_DIR/debug-${name}.xml" || true
  timeout 10 adb shell dumpsys activity activities > "$OUTPUT_DIR/debug-${name}-activity.txt" 2>/dev/null || true
  timeout 10 adb shell dumpsys window windows > "$OUTPUT_DIR/debug-${name}-window.txt" 2>/dev/null || true
  timeout 10 adb logcat -d > "$OUTPUT_DIR/debug-${name}-logcat.txt" 2>/dev/null || true
}

save_failure_debug_state() {
  local exit_code=$?
  if (( exit_code != 0 )); then
    log "Screenshot capture failed with exit ${exit_code}. Saving debug state."
    save_debug_state "failure"
  fi
  exit "$exit_code"
}

trap save_failure_debug_state EXIT

launch_app() {
  local initial_route="${1:-home}"
  for attempt in {1..4}; do
    log "Launching app attempt $attempt (${initial_route})..."
    adb shell am force-stop "$PACKAGE_NAME" || true
    sleep 1

    local start_output
    start_output="$(timeout 35 adb shell am start -W -S -n "$MAIN_ACTIVITY" -f 0x10008000 --es initial_route "$initial_route" 2>&1 || true)"
    echo "$start_output"

    if wait_for_app_foreground 40; then
      return 0
    fi
    if echo "$start_output" | grep -q "Activity: $MAIN_ACTIVITY"; then
      log "Activity started; foreground check did not confirm focus."
      sleep 10
      if wait_for_app_foreground 30; then
        return 0
      fi
    fi
    if echo "$start_output" | grep -qi "Status: timeout"; then
      log "Activity start timed out before foreground confirmation."
    fi
    sleep 2
  done
  return 1
}

ensure_screen() {
  local screen_name="$1"
  shift
  for attempt in {1..3}; do
    dismiss_blockers || true
    if ! is_app_foreground; then
      launch_app || true
    fi
    wait_for_app_foreground 12 || true
    if wait_for_any_text 12 "$@"; then
      return 0
    fi
    log "Expected text not visible for ${screen_name} (attempt ${attempt})"
    sleep 2
  done
  echo "Failed to reach stable screen: $screen_name" >&2
  return 1
}

capture_screen() {
  local file_name="$1"
  local min_bytes="$2"
  local tmp_file
  tmp_file="$(mktemp "${OUTPUT_DIR}/tmp-${file_name}.XXXXXX.png")"

  if dismiss_blockers; then
    rm -f "$tmp_file"
    return 1
  fi

  if ! timeout 15 adb exec-out screencap -p > "$tmp_file"; then
    rm -f "$tmp_file"
    return 1
  fi
  local size_bytes
  size_bytes="$(wc -c < "$tmp_file" | tr -d '[:space:]')"
  if (( size_bytes < min_bytes )); then
    echo "Screenshot too small ($size_bytes bytes): $file_name" >&2
    rm -f "$tmp_file"
    return 1
  fi

  mv "$tmp_file" "$OUTPUT_DIR/$file_name"
  return 0
}

capture_visible_screen() {
  local file_name="$1"
  local min_bytes="$2"
  local tmp_file
  tmp_file="$(mktemp "${OUTPUT_DIR}/tmp-${file_name}.XXXXXX.png")"

  if dismiss_blockers; then
    rm -f "$tmp_file"
    return 1
  fi

  if ! timeout 15 adb exec-out screencap -p > "$tmp_file"; then
    rm -f "$tmp_file"
    return 1
  fi
  local size_bytes
  size_bytes="$(wc -c < "$tmp_file" | tr -d '[:space:]')"
  if (( size_bytes < min_bytes )); then
    echo "Screenshot too small ($size_bytes bytes): $file_name" >&2
    rm -f "$tmp_file"
    return 1
  fi

  mv "$tmp_file" "$OUTPUT_DIR/$file_name"
  return 0
}

capture_with_retry() {
  local file_name="$1"
  local min_bytes="$2"
  shift 2
  for attempt in {1..3}; do
    if ensure_screen "$file_name" "$@" && capture_screen "$file_name" "$min_bytes"; then
      log "Captured $file_name"
      return 0
    fi
    sleep 2
  done
  echo "Failed to capture $file_name" >&2
  save_debug_state "$file_name"
  return 1
}

capture_route_with_retry() {
  local route="$1"
  local file_name="$2"
  local min_bytes="$3"
  shift 3

  for attempt in {1..3}; do
    if ! launch_app "$route"; then
      log "App did not reach foreground for ${file_name} (attempt ${attempt})"
      sleep 2
      continue
    fi
    if wait_for_any_text 45 "$@" && capture_visible_screen "$file_name" "$min_bytes"; then
      log "Captured $file_name"
      return 0
    fi
    sleep 2
  done

  echo "Failed to capture $file_name" >&2
  save_debug_state "$file_name"
  return 1
}

enter_search_query() {
  local width="$1"
  local height="$2"
  local search_y
  search_y=$((height * 18 / 100))

  adb shell input tap $((width / 2)) "$search_y"
  sleep 1
  adb shell input text medical
  sleep 4
  adb shell input keyevent KEYCODE_BACK || true
  sleep 2
}

capture_search_route_with_retry() {
  local file_name="$1"
  local min_bytes="$2"
  local width="$3"
  local height="$4"

  for attempt in {1..3}; do
    if ! launch_app "search"; then
      log "App did not reach foreground for ${file_name} (attempt ${attempt})"
      sleep 2
      continue
    fi
    if wait_for_any_text 45 "Filter FAR, AIM, Glossary, Advisory Circulars, and flashcards" "Search references and study cards..."; then
      enter_search_query "$width" "$height"
      if wait_for_any_text 45 "All 50" "FAR 43" "50 results" && capture_visible_screen "$file_name" "$min_bytes"; then
        log "Captured $file_name"
        return 0
      fi
    fi
    sleep 2
  done

  echo "Failed to capture $file_name" >&2
  save_debug_state "$file_name"
  return 1
}

tap_tab() {
  local tab_index="$1"
  local tab_y="$2"
  local tab_width="$3"
  local x
  x=$(( tab_width * (tab_index * 2 - 1) / 2 ))
  adb shell input tap "$x" "$tab_y"
  sleep 2
}

tap_tab_by_label() {
  local tab_label="$1"
  local tab_index="$2"
  local tab_y="$3"
  local tab_width="$4"
  local dump

  dismiss_blockers || true
  tap_tab "$tab_index" "$tab_y" "$tab_width"
  if wait_for_app_foreground 8; then
    return 0
  fi

  dump="$(ui_dump)"
  if tap_text_button_from_dump "$dump" "$tab_label"; then
    sleep 2
    return 0
  fi

  return 0
}

capture_with_retry_after_tap() {
  local file_name="$1"
  local min_bytes="$2"
  local tab_label="$3"
  local tab_index="$4"
  local tab_y="$5"
  local tab_width="$6"
  shift 6

  for attempt in {1..3}; do
    tap_tab_by_label "$tab_label" "$tab_index" "$tab_y" "$tab_width"
    if wait_for_any_text 45 "$@" && capture_visible_screen "$file_name" "$min_bytes"; then
      log "Captured $file_name"
      return 0
    fi
    log "Expected text not visible for ${file_name} after tapping ${tab_label} (attempt ${attempt})"
    dismiss_blockers || true
    sleep 2
  done

  echo "Failed to capture $file_name" >&2
  save_debug_state "$file_name"
  return 1
}

tap_far_part_card() {
  local width="$1"
  local height="$2"
  local card_y
  if (( width > height )); then
    card_y=$((height * 58 / 100))
  else
    card_y=$((height * 35 / 100))
  fi
  adb shell input tap $((width / 2)) "$card_y"
  sleep 2
}

capture_far_part61_detail() {
  for attempt in {1..5}; do
    if launch_app "far_part/61?query=" \
      && ensure_screen "02b_far_part61.png" "14 CFR Part 61" \
      && capture_visible_screen "02b_far_part61.png" 50000; then
      log "Captured 02b_far_part61.png"
      return 0
    fi
    sleep 2
  done

  echo "Failed to capture 02b_far_part61.png" >&2
  return 1
}

install_apk() {
  log "Installing APK..."
  for ((attempt = 1; attempt <= INSTALL_ATTEMPTS; attempt++)); do
    wait_for_service package "$SERVICE_TIMEOUT_S" || true
    wait_for_package_manager_ready "$PACKAGE_MANAGER_TIMEOUT_S" || true
    if timeout "$INSTALL_TIMEOUT_S" adb install -r "$APK_PATH"; then
      return 0
    fi
    log "APK install attempt $attempt failed. Waiting for package manager."
    if (( attempt == 2 )); then
      recover_adb_device
    else
      adb reconnect || true
      adb wait-for-device || true
    fi
    sleep $((attempt * 10))
  done
  echo "APK install failed after retries" >&2
  return 1
}

prepare_device() {
  adb wait-for-device
  wait_for_boot_complete
  wait_for_activity_manager
  wait_for_service input "$SERVICE_TIMEOUT_S"
  wait_for_service package "$SERVICE_TIMEOUT_S"
  wait_for_package_manager_ready "$PACKAGE_MANAGER_TIMEOUT_S"
  adb shell settings put global window_animation_scale 0 || true
  adb shell settings put global transition_animation_scale 0 || true
  adb shell settings put global animator_duration_scale 0 || true
  adb shell settings put global show_first_crash_dialog 0 || true
  adb shell settings put global show_process_crashes 0 || true
  adb shell settings put global send_action_app_error 0 || true
  adb shell settings put secure immersive_mode_confirmations confirmed || true
  adb shell input keyevent KEYCODE_WAKEUP || true
  adb shell wm dismiss-keyguard || true
  if [[ -n "$SCREENSHOT_WM_SIZE" ]]; then
    log "Setting Android window size to ${SCREENSHOT_WM_SIZE}..."
    adb shell wm size "$SCREENSHOT_WM_SIZE" || true
  fi
  sleep 2

  install_apk
  adb shell pm clear "$PACKAGE_NAME" || true
  adb logcat -c || true
  wait_for_activity_manager
  wait_for_service input 60
  wait_for_service package 60
}

main() {
  mkdir -p "$OUTPUT_DIR"
  prepare_device
  launch_app "home" || {
    save_debug_state "launch"
    return 1
  }

  local screen_size width height tab_y tab_width
  screen_size="$(adb shell wm size | grep -oE '[0-9]+x[0-9]+' | tail -1)"
  width="$(echo "$screen_size" | cut -d'x' -f1)"
  height="$(echo "$screen_size" | cut -d'x' -f2)"
  log "Screen size: ${width}x${height}"

  if [[ "$TAB_COUNT" == "5" ]]; then
    tab_y=$((height - 220))
  else
    tab_y=$((height - 120))
  fi
  tab_width=$((width / TAB_COUNT))

  capture_with_retry_after_tap "01_home.png" 50000 "Home" 1 "$tab_y" "$tab_width" "FAR/AIM PRO"

  capture_with_retry_after_tap "02_far.png" 50000 "FAR" 2 "$tab_y" "$tab_width" "Part 1"

  capture_far_part61_detail
  launch_app "home"

  capture_with_retry_after_tap "03_aim.png" 50000 "AIM" 3 "$tab_y" "$tab_width" "Air Navigation"

  if [[ "$TAB_COUNT" == "5" ]]; then
    capture_with_retry_after_tap "04_study.png" 50000 "Study" 4 "$tab_y" "$tab_width" "Certificate Paths"
    tap_tab 5 "$tab_y" "$tab_width"
    capture_with_retry "05_${TAB5_NAME}.png" 50000 "Tools" "FAR/AIM Pro" "Version 1.1.0"
    capture_route_with_retry "advisory_circulars" "06_advisory_circulars.png" 50000 "Advisory Circulars" "778 current FAA Advisory Circular records"
    capture_route_with_retry "updates" "07_updates.png" 50000 "Data Updates" "Source dates"
  else
    capture_route_with_retry "study" "04_study.png" 50000 "Certificate Paths"
    capture_route_with_retry "advisory_circulars" "05_advisory_circulars.png" 50000 "Advisory Circulars" "778 current FAA Advisory Circular records"
    capture_route_with_retry "glossary" "06_${TAB5_NAME}.png" 50000 "Search glossary terms..." "Pilot/Controller Glossary"
    capture_search_route_with_retry "07_${TAB6_NAME}.png" 30000 "$width" "$height"
    capture_route_with_retry "updates" "08_updates.png" 50000 "Data Updates" "Source dates"
  fi

  log "Screenshot capture complete."
  ls -la "$OUTPUT_DIR"
}

main "$@"
