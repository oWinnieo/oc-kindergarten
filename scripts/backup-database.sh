#!/bin/sh
set -eu

project_dir=${1:-/opt/docker/oc-projects/oc-kindergarten}
backup_root=${2:-/opt/persist/_backups/oc-kindergarten}
compose_project=${COMPOSE_PROJECT_NAME:-oc-oc-kindergarten}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
temporary="$backup_root/oc-kindergarten-$timestamp.dump.partial"
destination="$backup_root/oc-kindergarten-$timestamp.dump"

mkdir -p "$backup_root"
chmod 700 "$backup_root"
trap 'rm -f "$temporary"' EXIT INT TERM

cd "$project_dir"
docker compose -p "$compose_project" exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "$temporary"
chmod 600 "$temporary"
mv "$temporary" "$destination"
trap - EXIT INT TERM
echo "$destination"
