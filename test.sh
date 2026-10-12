#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0
export CI="${CI:-true}"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

usage() {
    cat <<'EOF'
Run FAR/AIM Pro test suite.

Runs shared-data sync and integrity checks, Python lint/tests, web lint/unit/E2E,
TypeScript/build checks, shell validation, and Android lint/unit/build checks.

Usage:
  ./test.sh

Options:
  -h, --help      Show this help.

Available sessions:
  ./deploy.sh     Test and deploy web/mobile target.
  ./test.sh       Run shared, Python, web, browser, shell, and Android release checks.
EOF
}

case "${1:-}" in
    -h|--help)
        usage
        exit 0
        ;;
    "")
        ;;
    *)
        echo "Unknown arg: $1" >&2
        usage >&2
        exit 1
        ;;
esac

run_test() {
    local name="$1"
    local command="$2"
    local dir="${3:-$ROOT_DIR}"

    echo ""
    echo "==> $name"
    echo "----------------------------------------"

    if (cd "$dir" && eval "$command"); then
        echo -e "${GREEN}PASS${NC} $name"
    else
        echo -e "${RED}FAIL${NC} $name"
        FAILED=1
    fi
}

echo "Running FAR/AIM Pro test suite"
echo "=================================="

run_test "Sync shared data to mobile bundles" "./scripts/sync-data.sh all"
run_test "Shell script syntax" "(printf '%s\\0' test.sh deploy.sh; find scripts mobile -path '*/build' -prune -o -path '*/.venv' -prune -o -name '*.sh' -type f -print0) | xargs -0 -n1 bash -n"
run_test "Python lint" "uv run ruff check ." "$ROOT_DIR/scripts"
run_test "Python crawler formatting tests" "uv run pytest" "$ROOT_DIR/scripts"
run_test "Generated search indexes" "node scripts/build_inverted_index.js --check"
run_test "Web lint" "pnpm lint" "$ROOT_DIR/web"
run_test "Web unit tests" "pnpm test" "$ROOT_DIR/web"
run_test "TypeScript type check" "pnpm exec tsc --noEmit" "$ROOT_DIR/web"
run_test "Production build" "pnpm build" "$ROOT_DIR/web"
run_test "Install Playwright Chromium" "pnpm exec playwright install chromium" "$ROOT_DIR/web"
run_test "Web E2E tests" "pnpm test:e2e" "$ROOT_DIR/web"
run_test "Android lint, unit tests, and release builds" "./gradlew lintDebug testDebugUnitTest assembleDebug bundleRelease --stacktrace --no-daemon" "$ROOT_DIR/mobile/android"

echo ""
echo "=================================="
if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}All tests passed${NC}"
    exit 0
fi

echo -e "${RED}Some tests failed${NC}"
exit 1
