#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
limulator_env_file="${LIMULATOR_ENV_FILE:-$repo_root/.limulator/dev.env}"
uv_args=(run --no-project)

if [[ -f "$limulator_env_file" ]]; then
    uv_args+=(--env-file "$limulator_env_file")
elif [[ -n "${LIMULATOR_ENV_FILE:-}" ]]; then
    printf 'Limulator environment file does not exist: %s\n' "$limulator_env_file" >&2
    exit 1
fi

# Let uv load local configuration without evaluating it as shell code.
# shellcheck disable=SC2016 # Expand variables in the child shell after uv loads the file.
exec uv "${uv_args[@]}" bash -c '
    set -euo pipefail
    for variable in LIMULATOR_PROJECT LIMULATOR_HOME LIMULATOR_BACKEND LIMULATOR_PREFIX LIMULATOR_DEVICE; do
        if [[ -z "${!variable:-}" ]]; then
            printf "Set %s in the environment or .limulator/dev.env.\n" "$variable" >&2
            exit 1
        fi
    done
    for variable in LIMULATOR_PROJECT LIMULATOR_HOME LIMULATOR_BACKEND LIMULATOR_PREFIX; do
        if [[ "${!variable}" != /* ]]; then
            printf "%s must be an absolute path.\n" "$variable" >&2
            exit 1
        fi
    done
    exec uv run --no-sync --project "$LIMULATOR_PROJECT" limulator \
        --device "$LIMULATOR_DEVICE" "$@"
' far-aim-limulator "$@"
