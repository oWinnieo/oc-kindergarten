#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-/opt/docker/oc-projects/oc-kindergarten}"
CASDOOR_POSTGRES_CONTAINER="${CASDOOR_POSTGRES_CONTAINER:-rococo-postgres}"
CASDOOR_DATABASE="${CASDOOR_DATABASE:-casdoor_db}"
ENV_FILE="${PROJECT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Environment file not found: ${ENV_FILE}" >&2
  exit 1
fi
if ! docker inspect "${CASDOOR_POSTGRES_CONTAINER}" >/dev/null 2>&1; then
  echo "Casdoor PostgreSQL container not found: ${CASDOOR_POSTGRES_CONTAINER}" >&2
  exit 1
fi

new_client_id="$(openssl rand -hex 16)"
new_client_secret="$(openssl rand -hex 32)"

docker exec -i \
  -e NEW_CLIENT_ID="${new_client_id}" \
  -e NEW_CLIENT_SECRET="${new_client_secret}" \
  "${CASDOOR_POSTGRES_CONTAINER}" sh -lc \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -v new_client_id="$NEW_CLIENT_ID" -v new_client_secret="$NEW_CLIENT_SECRET"' \
  sh "${CASDOOR_DATABASE}" <<'SQL'
BEGIN;

INSERT INTO organization
SELECT (jsonb_populate_record(
  NULL::organization,
  to_jsonb(source_org) || jsonb_build_object(
    'name', 'OCKindergarten',
    'created_time', to_char(current_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'display_name', 'OC Kindergarten',
    'website_url', 'https://kindergarten-dev.rococo.dev',
    'default_application', 'oc-kindergarten',
    'password_type', 'bcrypt',
    'password_salt', '',
    'password_options', '["AtLeast8","Aa123"]',
    'password_obfuscator_type', '',
    'password_obfuscator_key', '',
    'master_password', '',
    'default_password', '',
    'master_verification_code', '',
    'enable_soft_deletion', true,
    'is_profile_public', false,
    'use_email_as_username', true,
    'disable_signin', false
  )
)).*
FROM organization AS source_org
WHERE source_org.owner = 'admin'
  AND source_org.name = 'RococoOrg'
  AND NOT EXISTS (
    SELECT 1 FROM organization
    WHERE owner = 'admin' AND name = 'OCKindergarten'
  );

INSERT INTO application
SELECT (jsonb_populate_record(
  NULL::application,
  to_jsonb(source_app) || jsonb_build_object(
    'name', 'oc-kindergarten',
    'created_time', to_char(current_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'display_name', 'OC Kindergarten',
    'homepage_url', 'https://kindergarten-dev.rococo.dev',
    'description', 'Independent parent identity for the OC Kindergarten community',
    'organization', 'OCKindergarten',
    'default_group', '',
    'client_id', :'new_client_id',
    'client_secret', :'new_client_secret',
    'redirect_uris', '["https://kindergarten-dev.rococo.dev/api/auth/callback/casdoor"]',
    'is_shared', false,
    'enable_password', true,
    'enable_sign_up', true,
    'disable_signin', false,
    'signup_items', (
      SELECT jsonb_agg(
        CASE
          WHEN item->>'name' = 'Invitation code'
            THEN item || '{"visible":false,"required":false}'::jsonb
          ELSE item
        END
        ORDER BY item_order
      )::text
      FROM jsonb_array_elements(source_app.signup_items::jsonb)
        WITH ORDINALITY AS signup_item(item, item_order)
    )
  )
)).*
FROM application AS source_app
WHERE source_app.owner = 'admin'
  AND source_app.name = 'Rococo'
  AND NOT EXISTS (
    SELECT 1 FROM application
    WHERE owner = 'admin' AND name = 'oc-kindergarten'
  );

DO $$
BEGIN
  IF (SELECT count(*) FROM organization WHERE owner = 'admin' AND name = 'OCKindergarten') <> 1 THEN
    RAISE EXCEPTION 'OCKindergarten organization was not created exactly once';
  END IF;
  IF (SELECT count(*) FROM application WHERE owner = 'admin' AND name = 'oc-kindergarten') <> 1 THEN
    RAISE EXCEPTION 'oc-kindergarten application was not created exactly once';
  END IF;
END $$;

COMMIT;
SQL

credentials="$(
  docker exec "${CASDOOR_POSTGRES_CONTAINER}" sh -lc \
    'psql -U "$POSTGRES_USER" -d "$1" -AtF "|" -c "select client_id,client_secret from application where owner=chr(97)||chr(100)||chr(109)||chr(105)||chr(110) and name=chr(111)||chr(99)||chr(45)||chr(107)||chr(105)||chr(110)||chr(100)||chr(101)||chr(114)||chr(103)||chr(97)||chr(114)||chr(116)||chr(101)||chr(110);"' \
    sh "${CASDOOR_DATABASE}"
)"
case "${credentials}" in
  *'|'*) ;;
  *) echo "Casdoor application credentials unavailable" >&2; exit 1 ;;
esac

existing_nextauth_secret="$(sed -n 's/^NEXTAUTH_SECRET=//p' "${ENV_FILE}" | tail -n 1)"
export KG_CASDOOR_CLIENT_ID="${credentials%%|*}"
export KG_CASDOOR_CLIENT_SECRET="${credentials#*|}"
export KG_NEXTAUTH_SECRET="${existing_nextauth_secret:-$(openssl rand -hex 32)}"
export KG_ENV_FILE="${ENV_FILE}"

python3 - <<'PY'
import os
from pathlib import Path

path = Path(os.environ['KG_ENV_FILE'])
updates = {
    'NEXTAUTH_URL': 'https://kindergarten-dev.rococo.dev',
    'NEXTAUTH_SECRET': os.environ['KG_NEXTAUTH_SECRET'],
    'CASDOOR_ISSUER_URL': 'https://casdoor.rococo.dev',
    'CASDOOR_CLIENT_ID': os.environ['KG_CASDOOR_CLIENT_ID'],
    'CASDOOR_CLIENT_SECRET': os.environ['KG_CASDOOR_CLIENT_SECRET'],
}
lines = path.read_text().splitlines()
seen = set()
output = []
for line in lines:
    key = line.split('=', 1)[0] if '=' in line and not line.lstrip().startswith('#') else None
    if key in updates:
        output.append(f'{key}={updates[key]}')
        seen.add(key)
    else:
        output.append(line)
if seen != set(updates):
    output.extend(['', '# Independent Casdoor parent OIDC'])
    output.extend(f'{key}={value}' for key, value in updates.items() if key not in seen)
temporary = path.with_suffix('.env.casdoor.tmp')
temporary.write_text('\n'.join(output) + '\n')
os.chmod(temporary, 0o600)
os.replace(temporary, path)
PY

unset KG_CASDOOR_CLIENT_ID KG_CASDOOR_CLIENT_SECRET KG_NEXTAUTH_SECRET KG_ENV_FILE
chmod 600 "${ENV_FILE}"

docker exec "${CASDOOR_POSTGRES_CONTAINER}" sh -lc \
  'psql -U "$POSTGRES_USER" -d "$1" -AtF "|" -c "select o.name,o.display_name,o.default_application,o.password_type,o.is_profile_public,a.name,a.organization,a.homepage_url,a.redirect_uris,a.enable_sign_up,a.default_group from organization o join application a on a.organization=o.name where o.owner=chr(97)||chr(100)||chr(109)||chr(105)||chr(110) and o.name=chr(79)||chr(67)||chr(75)||chr(105)||chr(110)||chr(100)||chr(101)||chr(114)||chr(103)||chr(97)||chr(114)||chr(116)||chr(101)||chr(110) and a.owner=o.owner and a.name=chr(111)||chr(99)||chr(45)||chr(107)||chr(105)||chr(110)||chr(100)||chr(101)||chr(114)||chr(103)||chr(97)||chr(114)||chr(116)||chr(101)||chr(110);"' \
  sh "${CASDOOR_DATABASE}"

ENV_FILE="${ENV_FILE}" python3 -c 'from pathlib import Path; import os; p=Path(os.environ["ENV_FILE"]); keys={line.split("=",1)[0] for line in p.read_text().splitlines() if "=" in line}; required={"NEXTAUTH_URL","NEXTAUTH_SECRET","CASDOOR_ISSUER_URL","CASDOOR_CLIENT_ID","CASDOOR_CLIENT_SECRET"}; print("auth_env_complete="+str(required <= keys)); print("env_mode="+oct(p.stat().st_mode & 0o777))'
