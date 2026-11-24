#!/bin/bash
# Sync data files to mobile platforms during build time
# Uses incremental rsync when available to avoid deleting and re-copying ~200 MB on every build.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/data"
FAR_IMAGES_DIR="$PROJECT_ROOT/web/public/far/images"
AIM_IMAGES_DIR="$PROJECT_ROOT/web/public/aim/images"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

sync_dir() {
    local src="$1"
    local dst="$2"
    shift 2
    mkdir -p "$dst"
    if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete "$@" "$src/" "$dst/"
    else
        rm -rf "$dst"
        mkdir -p "$dst"
        cp -R "$src/." "$dst/"
    fi
}

sync_file() {
    local src="$1"
    local dst="$2"
    mkdir -p "$(dirname "$dst")"
    if command -v rsync >/dev/null 2>&1; then
        rsync -a "$src" "$dst"
    else
        cp "$src" "$dst"
    fi
}

sync_target() {
    local platform="$1"
    local target_dir="$2"
    local include_ac_exact="$3"

    log_info "Syncing data to $platform..."

    # FAR JSON files (excluding images directory inside target_dir/far)
    mkdir -p "$target_dir/far" "$target_dir/aim" "$target_dir/quizzes" "$target_dir/flashcards" "$target_dir/advisory-circulars" "$target_dir/search"
    if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete --exclude='/images/' --include='part*.json' --include='index.json' --include='pilot-index.json' --exclude='*' "$DATA_DIR/far/" "$target_dir/far/"
        if [ -d "$FAR_IMAGES_DIR" ]; then
            sync_dir "$FAR_IMAGES_DIR" "$target_dir/far/images"
        else
            rm -rf "$target_dir/far/images"
        fi

        rsync -a --delete --exclude='/images/' --include='chapter*.json' --include='index.json' --include='pcg.json' --exclude='*' "$DATA_DIR/aim/" "$target_dir/aim/"
        sync_dir "$AIM_IMAGES_DIR" "$target_dir/aim/images"

        rsync -a --delete --include='*.json' --exclude='*' "$DATA_DIR/quizzes/" "$target_dir/quizzes/"
        rsync -a --delete --include='*.json' --exclude='*' "$DATA_DIR/flashcards/" "$target_dir/flashcards/"
        sync_dir "$DATA_DIR/advisory-circulars" "$target_dir/advisory-circulars"

        if [ "$include_ac_exact" = "1" ]; then
            rsync -a --delete --include='inverted-index-ac.json' --include='inverted-index-ac-exact.json' --exclude='*' "$PROJECT_ROOT/web/public/" "$target_dir/search/"
        else
            rsync -a --delete --include='inverted-index-ac.json' --exclude='*' "$PROJECT_ROOT/web/public/" "$target_dir/search/"
        fi

        sync_file "$DATA_DIR/study-paths.json" "$target_dir/study-paths.json"
        sync_file "$DATA_DIR/source-status.json" "$target_dir/source-status.json"
    else
        rm -rf "$target_dir/far" "$target_dir/aim" "$target_dir/quizzes" "$target_dir/flashcards" "$target_dir/advisory-circulars" "$target_dir/search"
        rm -f "$target_dir/study-paths.json" "$target_dir/source-status.json"
        mkdir -p "$target_dir/far" "$target_dir/aim" "$target_dir/quizzes" "$target_dir/flashcards" "$target_dir/advisory-circulars" "$target_dir/search"

        cp "$DATA_DIR/far/part"*.json "$target_dir/far/"
        cp "$DATA_DIR/far/index.json" "$target_dir/far/"
        cp "$DATA_DIR/far/pilot-index.json" "$target_dir/far/"
        mkdir -p "$target_dir/far/images"
        if [ -d "$FAR_IMAGES_DIR" ]; then
            cp -R "$FAR_IMAGES_DIR/." "$target_dir/far/images/"
        fi

        for chapter in "$DATA_DIR/aim/chapter"*.json; do
            if [ -f "$chapter" ]; then
                cp "$chapter" "$target_dir/aim/"
            fi
        done
        cp "$DATA_DIR/aim/index.json" "$target_dir/aim/"
        cp "$DATA_DIR/aim/pcg.json" "$target_dir/aim/"
        mkdir -p "$target_dir/aim/images"
        cp -R "$AIM_IMAGES_DIR/." "$target_dir/aim/images/"

        cp "$DATA_DIR/quizzes/"*.json "$target_dir/quizzes/"
        cp "$DATA_DIR/flashcards/"*.json "$target_dir/flashcards/"
        cp -R "$DATA_DIR/advisory-circulars/." "$target_dir/advisory-circulars/"
        cp "$PROJECT_ROOT/web/public/inverted-index-ac.json" "$target_dir/search/"
        if [ "$include_ac_exact" = "1" ]; then
            cp "$PROJECT_ROOT/web/public/inverted-index-ac-exact.json" "$target_dir/search/"
        fi
        cp "$DATA_DIR/study-paths.json" "$target_dir/"
        cp "$DATA_DIR/source-status.json" "$target_dir/"
    fi

    log_info "$platform data sync complete: $target_dir"
}

sync_ios() {
    sync_target "iOS" "$PROJECT_ROOT/mobile/ios/FARAIMPro/Resources/data" "1"
}

sync_android() {
    sync_target "Android" "$PROJECT_ROOT/mobile/android/app/src/main/assets" "0"
}

clean_ios() {
    log_info "Cleaning iOS data..."
    local IOS_DATA_DIR="$PROJECT_ROOT/mobile/ios/FARAIMPro/Resources/data"
    rm -rf "$IOS_DATA_DIR"
    log_info "iOS data cleaned"
}

clean_android() {
    log_info "Cleaning Android data..."
    local ANDROID_ASSETS_DIR="$PROJECT_ROOT/mobile/android/app/src/main/assets"
    rm -rf "$ANDROID_ASSETS_DIR/far" "$ANDROID_ASSETS_DIR/aim" "$ANDROID_ASSETS_DIR/quizzes" "$ANDROID_ASSETS_DIR/flashcards" "$ANDROID_ASSETS_DIR/advisory-circulars" "$ANDROID_ASSETS_DIR/search"
    rm -f "$ANDROID_ASSETS_DIR/study-paths.json" "$ANDROID_ASSETS_DIR/source-status.json"
    log_info "Android data cleaned"
}

usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  ios       Sync data to iOS"
    echo "  android   Sync data to Android"
    echo "  all       Sync data to both platforms (default)"
    echo "  clean     Remove synced data from both platforms"
    echo "  clean-ios Remove synced data from iOS"
    echo "  clean-android Remove synced data from Android"
    echo ""
    echo "This script copies JSON data from data/ to mobile platform directories."
    echo "The copied data should NOT be committed to git - add to .gitignore."
}

case "${1:-all}" in
    ios)
        sync_ios
        ;;
    android)
        sync_android
        ;;
    all)
        sync_ios
        sync_android
        ;;
    clean)
        clean_ios
        clean_android
        ;;
    clean-ios)
        clean_ios
        ;;
    clean-android)
        clean_android
        ;;
    -h|--help)
        usage
        ;;
    *)
        log_error "Unknown command: $1"
        usage
        exit 1
        ;;
esac
