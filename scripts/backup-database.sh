#!/bin/sh
set -eu

project_dir=${1:-/opt/docker/oc-projects/oc-kindergarten}
env_file="$project_dir/.env"
if [ ! -f "$env_file" ]; then
  echo "Missing environment file: $env_file" >&2
  exit 1
fi
environment_name=$(sed -n 's/^KINDERGARTEN_ENV=//p' "$env_file" | tail -n 1)
case "$environment_name" in
  dev|prod) ;;
  *)
    echo "KINDERGARTEN_ENV must be dev or prod in $env_file" >&2
    exit 1
    ;;
esac
backup_root=${2:-/opt/persist/_backups/oc-kindergarten/$environment_name}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary="$backup_root/oc-kindergarten-$environment_name-$timestamp.dump.partial"
destination="$backup_root/oc-kindergarten-$environment_name-$timestamp.dump"

mkdir -p "$backup_root"
chmod 700 "$backup_root"
trap 'rm -f "$temporary"' EXIT INT TERM

cd "$project_dir"
docker compose exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "$temporary"
chmod 600 "$temporary"
mv "$temporary" "$destination"
trap - EXIT INT TERM
echo "$destination"
