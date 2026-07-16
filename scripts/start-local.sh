#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.local.compose"
CSV_TEMPLATE="${REPO_ROOT}/localDevelopment/postgres/prefect-api-keys-table.example.csv"
CSV_FILE="${REPO_ROOT}/localDevelopment/postgres/prefect-api-keys-table.local.csv"
PREPARE_ONLY=false

if [[ "${1:-}" == "--prepare-only" ]]; then
  PREPARE_ONLY=true
  shift
fi

generate_password() {
  python3 - <<'PY'
import secrets
import string

alphabet = string.ascii_letters + string.digits
print(''.join(secrets.choice(alphabet) for _ in range(32)))
PY
}

ensure_env_file() {
  if [[ -f "${ENV_FILE}" ]]; then
    return
  fi

  cat > "${ENV_FILE}" <<EOF
LOCAL_POSTGRES_PASSWORD=$(generate_password)
EOF

  echo "Created ${ENV_FILE} with a generated LOCAL_POSTGRES_PASSWORD."
}

ensure_local_csv() {
  if [[ -f "${CSV_FILE}" ]]; then
    return
  fi

  cp "${CSV_TEMPLATE}" "${CSV_FILE}"
  echo "Created ${CSV_FILE}. Add local Prefect API key rows before relying on authenticated requests."
}

print_next_steps() {
  local password
  password="$(grep '^LOCAL_POSTGRES_PASSWORD=' "${ENV_FILE}" | cut -d'=' -f2-)"

  echo
  echo "Local development files are ready:"
  echo "  Env file: ${ENV_FILE}"
  echo "  API key CSV: ${CSV_FILE}"
  echo
  echo "Generated local Postgres password: ${password}"
  echo
  echo "Next steps:"
  echo "  1. Add one or more local API key rows to ${CSV_FILE}."
  echo "  2. If Postgres was already initialized, run 'docker compose down -v' before restarting so seed data reloads."
  echo "  3. Re-run this script without --prepare-only to start the local stack."
}

run_compose() {
  local compose_cmd=()

  if docker compose version >/dev/null 2>&1; then
    compose_cmd=(docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    compose_cmd=(docker-compose)
  else
    echo "Docker Compose is required but was not found." >&2
    exit 1
  fi

  "${compose_cmd[@]}" --env-file "${ENV_FILE}" up --build "$@"
}

ensure_env_file
ensure_local_csv
print_next_steps

if [[ "${PREPARE_ONLY}" == true ]]; then
  exit 0
fi

run_compose "$@"
