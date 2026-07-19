#!/bin/sh
set -eu

project_dir=${1:-/opt/docker/oc-projects/oc-kindergarten}
env_file="$project_dir/.env"
backup_root=/opt/persist/_backups/oc-kindergarten
postgres_data=/opt/persist/oc-kindergarten/postgres

if [ ! -f "$env_file" ]; then
  echo "Missing environment file: $env_file" >&2
  exit 1
fi

owner_uid=$(stat -c '%u' "$env_file")
owner_gid=$(stat -c '%g' "$env_file")
mkdir -p "$backup_root" "$postgres_data"
chmod 700 "$backup_root" "$postgres_data"
chown 999:999 "$postgres_data"

if ! grep -q '^POSTGRES_PASSWORD=' "$env_file"; then
  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  cp --preserve=mode,ownership,timestamps "$env_file" "$backup_root/env-before-database-$timestamp"
  chmod 600 "$backup_root/env-before-database-$timestamp"
fi

postgres_user=$(sed -n 's/^POSTGRES_USER=//p' "$env_file" | tail -n 1)
postgres_user=${postgres_user:-oc_kindergarten_user}
postgres_database=$(sed -n 's/^POSTGRES_DB=//p' "$env_file" | tail -n 1)
postgres_database=${postgres_database:-oc_kindergarten}
postgres_password=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$env_file" | tail -n 1)
postgres_password=${postgres_password:-$(openssl rand -hex 32)}

set_env_value() {
  key=$1
  value=$2
  temporary=$(mktemp)
  grep -v "^${key}=" "$env_file" > "$temporary" || true
  printf '%s=%s\n' "$key" "$value" >> "$temporary"
  install -m 600 -o "$owner_uid" -g "$owner_gid" "$temporary" "$env_file"
  rm -f "$temporary"
}

set_env_value POSTGRES_USER "$postgres_user"
set_env_value POSTGRES_PASSWORD "$postgres_password"
set_env_value POSTGRES_DB "$postgres_database"
set_env_value DATABASE_URL "postgresql://${postgres_user}:${postgres_password}@postgres:5432/${postgres_database}"
set_env_value DATABASE_POOL_MAX "10"

echo "Database environment and persistent directory are ready."
