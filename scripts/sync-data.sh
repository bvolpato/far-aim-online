#!/bin/bash
# Sync data files to mobile platforms during build time
# This script copies JSON data from the shared data directory to platform-specific locations
# to avoid duplicating data in git while ensuring mobile apps have access to the data.

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

sync_ios() {
    log_info "Syncing data to iOS..."
    
    local IOS_DATA_DIR="$PROJECT_ROOT/mobile/ios/FARAIMPro/Resources/data"
    
    # Recreate copied data directories so removed upstream files do not linger in app bundles.
    rm -rf "$IOS_DATA_DIR/far" "$IOS_DATA_DIR/aim" "$IOS_DATA_DIR/quizzes" "$IOS_DATA_DIR/flashcards" "$IOS_DATA_DIR/advisory-circulars" "$IOS_DATA_DIR/search"
    mkdir -p "$IOS_DATA_DIR/far"
    mkdir -p "$IOS_DATA_DIR/aim"
    mkdir -p "$IOS_DATA_DIR/quizzes"
    mkdir -p "$IOS_DATA_DIR/flashcards"
    mkdir -p "$IOS_DATA_DIR/advisory-circulars"
    mkdir -p "$IOS_DATA_DIR/search"
    
    # Copy complete FAR corpus so mobile coverage matches web and store copy.
    cp "$DATA_DIR/far/part"*.json "$IOS_DATA_DIR/far/"
    cp "$DATA_DIR/far/index.json" "$IOS_DATA_DIR/far/"
    cp "$DATA_DIR/far/pilot-index.json" "$IOS_DATA_DIR/far/"
    mkdir -p "$IOS_DATA_DIR/far/images"
    if [ -d "$FAR_IMAGES_DIR" ]; then
        cp -R "$FAR_IMAGES_DIR/." "$IOS_DATA_DIR/far/images/"
    fi
    
    # Copy AIM data (all chapters)
    for chapter in "$DATA_DIR/aim/chapter"*.json; do
        if [ -f "$chapter" ]; then
            cp "$chapter" "$IOS_DATA_DIR/aim/"
        fi
    done
    cp "$DATA_DIR/aim/index.json" "$IOS_DATA_DIR/aim/"
    cp "$DATA_DIR/aim/pcg.json" "$IOS_DATA_DIR/aim/"
    mkdir -p "$IOS_DATA_DIR/aim/images"
    cp -R "$AIM_IMAGES_DIR/." "$IOS_DATA_DIR/aim/images/"
    
    # Copy quizzes
    cp "$DATA_DIR/quizzes/"*.json "$IOS_DATA_DIR/quizzes/"
    
    # Copy flashcards
    cp "$DATA_DIR/flashcards/"*.json "$IOS_DATA_DIR/flashcards/"

    # Copy FAA Advisory Circular metadata and extracted offline content
    cp -R "$DATA_DIR/advisory-circulars/." "$IOS_DATA_DIR/advisory-circulars/"
    cp "$PROJECT_ROOT/web/public/inverted-index-ac.json" "$IOS_DATA_DIR/search/"

    cp "$DATA_DIR/study-paths.json" "$IOS_DATA_DIR/"
    cp "$DATA_DIR/source-status.json" "$IOS_DATA_DIR/"
    
    log_info "iOS data sync complete: $IOS_DATA_DIR"
}

sync_android() {
    log_info "Syncing data to Android..."
    
    local ANDROID_ASSETS_DIR="$PROJECT_ROOT/mobile/android/app/src/main/assets"
    
    # Recreate copied data directories so removed upstream files do not linger in app bundles.
    rm -rf "$ANDROID_ASSETS_DIR/far" "$ANDROID_ASSETS_DIR/aim" "$ANDROID_ASSETS_DIR/quizzes" "$ANDROID_ASSETS_DIR/flashcards" "$ANDROID_ASSETS_DIR/advisory-circulars" "$ANDROID_ASSETS_DIR/search"
    rm -f "$ANDROID_ASSETS_DIR/study-paths.json" "$ANDROID_ASSETS_DIR/source-status.json"
    mkdir -p "$ANDROID_ASSETS_DIR/far"
    mkdir -p "$ANDROID_ASSETS_DIR/aim"
    mkdir -p "$ANDROID_ASSETS_DIR/quizzes"
    mkdir -p "$ANDROID_ASSETS_DIR/flashcards"
    mkdir -p "$ANDROID_ASSETS_DIR/advisory-circulars"
    mkdir -p "$ANDROID_ASSETS_DIR/search"
    
    # Copy complete FAR corpus so mobile coverage matches web and store copy.
    cp "$DATA_DIR/far/part"*.json "$ANDROID_ASSETS_DIR/far/"
    cp "$DATA_DIR/far/index.json" "$ANDROID_ASSETS_DIR/far/"
    cp "$DATA_DIR/far/pilot-index.json" "$ANDROID_ASSETS_DIR/far/"
    mkdir -p "$ANDROID_ASSETS_DIR/far/images"
    if [ -d "$FAR_IMAGES_DIR" ]; then
        cp -R "$FAR_IMAGES_DIR/." "$ANDROID_ASSETS_DIR/far/images/"
    fi
    
    # Copy AIM data (all chapters)
    for chapter in "$DATA_DIR/aim/chapter"*.json; do
        if [ -f "$chapter" ]; then
            cp "$chapter" "$ANDROID_ASSETS_DIR/aim/"
        fi
    done
    cp "$DATA_DIR/aim/index.json" "$ANDROID_ASSETS_DIR/aim/"
    cp "$DATA_DIR/aim/pcg.json" "$ANDROID_ASSETS_DIR/aim/"
    mkdir -p "$ANDROID_ASSETS_DIR/aim/images"
    cp -R "$AIM_IMAGES_DIR/." "$ANDROID_ASSETS_DIR/aim/images/"
    
    # Copy quizzes
    cp "$DATA_DIR/quizzes/"*.json "$ANDROID_ASSETS_DIR/quizzes/"
    
    # Copy flashcards
    cp "$DATA_DIR/flashcards/"*.json "$ANDROID_ASSETS_DIR/flashcards/"

    # Copy FAA Advisory Circular metadata and extracted offline content
    cp -R "$DATA_DIR/advisory-circulars/." "$ANDROID_ASSETS_DIR/advisory-circulars/"
    cp "$PROJECT_ROOT/web/public/inverted-index-ac.json" "$ANDROID_ASSETS_DIR/search/"

    cp "$DATA_DIR/study-paths.json" "$ANDROID_ASSETS_DIR/"
    cp "$DATA_DIR/source-status.json" "$ANDROID_ASSETS_DIR/"
    
    log_info "Android data sync complete: $ANDROID_ASSETS_DIR"
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
