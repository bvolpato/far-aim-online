#!/bin/bash
# ==============================================================================
# Script Name: Deploy
# Usage:       ./.vibe/scripts/deploy.sh [options] [arguments]
# Description: Run deploy.sh
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec "$ROOT_DIR/deploy.sh" "$@"
