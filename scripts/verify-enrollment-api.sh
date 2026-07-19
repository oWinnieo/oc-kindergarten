#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-/opt/docker/oc-projects/oc-kindergarten}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://kindergarten-dev.rococo.dev}"
cd "${PROJECT_DIR}"

test_stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
test_subject="enrollment-verification-${test_stamp}"
other_subject="enrollment-other-parent-${test_stamp}"
test_native_agent="verification-${test_stamp}"
parent_id=""
other_parent_id=""

cleanup() {
  if [[ -z "${parent_id}" ]]; then return; fi
  local cleanup_other_parent_id="${other_parent_id:-${parent_id}}"
  docker compose exec -T postgres psql \
    -U "${POSTGRES_USER:-oc_kindergarten_user}" \
    -d "${POSTGRES_DB:-oc_kindergarten}" \
    -v ON_ERROR_STOP=1 \
    -v parent_id="${parent_id}" \
    -v other_parent_id="${cleanup_other_parent_id}" \
    -v native_agent="${test_native_agent}" >/dev/null <<'SQL'
BEGIN;
DELETE FROM agent_event_cursors
WHERE agent_id IN (
  SELECT p.agent_id FROM agent_profiles p
  JOIN agent_enrollments e ON e.id = p.enrollment_id
  WHERE e.parent_user_id = :'parent_id'::uuid
);
DELETE FROM agent_latest_states
WHERE agent_id IN (
  SELECT p.agent_id FROM agent_profiles p
  JOIN agent_enrollments e ON e.id = p.enrollment_id
  WHERE e.parent_user_id = :'parent_id'::uuid
);
DELETE FROM agent_event_log
WHERE agent_id IN (
  SELECT p.agent_id FROM agent_profiles p
  JOIN agent_enrollments e ON e.id = p.enrollment_id
  WHERE e.parent_user_id = :'parent_id'::uuid
);
DELETE FROM event_outbox
WHERE aggregate_id IN (
  SELECT p.agent_id FROM agent_profiles p
  JOIN agent_enrollments e ON e.id = p.enrollment_id
  WHERE e.parent_user_id = :'parent_id'::uuid
);
DELETE FROM provider_agent_bindings
WHERE provider = 'openclaw' AND native_agent_id = :'native_agent';
DELETE FROM agent_profiles
WHERE enrollment_id IN (
  SELECT id FROM agent_enrollments WHERE parent_user_id = :'parent_id'::uuid
);
DELETE FROM agent_enrollments WHERE parent_user_id = :'parent_id'::uuid;
DELETE FROM parent_users
WHERE id IN (:'parent_id'::uuid, :'other_parent_id'::uuid);
COMMIT;
SQL
}
trap cleanup EXIT INT TERM

parent_id="$({
  docker compose exec -T postgres psql \
    -U "${POSTGRES_USER:-oc_kindergarten_user}" \
    -d "${POSTGRES_DB:-oc_kindergarten}" \
    -v ON_ERROR_STOP=1 \
    -At -c "INSERT INTO parent_users (oidc_issuer,oidc_subject,display_name) VALUES ('https://verification.invalid', '${test_subject}', 'Enrollment Verification') RETURNING id;"
} | head -n 1)"

other_parent_id="$({
  docker compose exec -T postgres psql \
    -U "${POSTGRES_USER:-oc_kindergarten_user}" \
    -d "${POSTGRES_DB:-oc_kindergarten}" \
    -v ON_ERROR_STOP=1 \
    -At -c "INSERT INTO parent_users (oidc_issuer,oidc_subject,display_name) VALUES ('https://verification.invalid', '${other_subject}', 'Other Verification Parent') RETURNING id;"
} | head -n 1)"

encode_session() {
  docker compose run --rm -T --no-deps \
    -e TEST_PARENT_ID="$1" migrate node - <<'NODE'
const { encode } = require('next-auth/jwt');
encode({
  secret: process.env.NEXTAUTH_SECRET,
  maxAge: 600,
  token: {
    parentUserId: process.env.TEST_PARENT_ID,
    oidcIssuer: 'https://verification.invalid',
    oidcSubject: 'enrollment-verification',
    name: 'Enrollment Verification',
    sub: 'enrollment-verification',
  },
}).then((token) => process.stdout.write(token));
NODE
}

session_token="$(encode_session "${parent_id}")"
other_session_token="$(encode_session "${other_parent_id}")"
session_cookie="__Secure-next-auth.session-token=${session_token}"
other_session_cookie="__Secure-next-auth.session-token=${other_session_token}"
agent_token="$(sed -n 's/^OC_KINDERGARTEN_AGENT_EVENT_TOKEN=//p' .env | tail -n 1)"
if [[ -z "${agent_token}" ]]; then
  echo "Agent event token is not configured" >&2
  exit 1
fi

create_json="$(curl -fsS -X POST -H "Cookie: ${session_cookie}" "${PUBLIC_ORIGIN}/api/enrollments")"
enrollment_id="$(printf '%s' "${create_json}" | jq -er '.enrollment.id')"

code_json="$(curl -fsS -X POST -H "Cookie: ${session_cookie}" "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/pairing-code")"
pairing_code="$(printf '%s' "${code_json}" | jq -er '.pairingCode')"

pair_json="$(jq -cn \
  --arg pairing_code "${pairing_code}" \
  --arg native_agent "${test_native_agent}" \
  '{schemaVersion:1,pairingCode:$pairing_code,discovery:{schemaVersion:1,provider:"openclaw",nativeAgentId:$native_agent,runtimeInstanceId:"verification-runtime",adapterVersion:"verification",profileDraft:{displayName:"Verification Agent",role:"Enrollment verification",capabilities:["verification"]}}}')"
pair_result="$(curl -fsS -X POST \
  -H "Authorization: Bearer ${agent_token}" \
  -H 'Content-Type: application/json' \
  --data-binary "${pair_json}" \
  "${PUBLIC_ORIGIN}/api/runtime/enrollments/pair")"
test "$(printf '%s' "${pair_result}" | jq -r '.pairing.status')" = "pending_parent_confirmation"

reused_code_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${agent_token}" \
  -H 'Content-Type: application/json' \
  --data-binary "${pair_json}" \
  "${PUBLIC_ORIGIN}/api/runtime/enrollments/pair")"
test "${reused_code_status}" = "404"

other_parent_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Cookie: ${other_session_cookie}" \
  -H 'Content-Type: application/json' \
  --data-binary '{"displayName":"Verification Agent","characterVariant":"genderless"}' \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/activate")"
test "${other_parent_status}" = "404"

activate_result="$(curl -fsS -X POST \
  -H "Cookie: ${session_cookie}" \
  -H 'Content-Type: application/json' \
  --data-binary '{"displayName":"Verification Agent","characterVariant":"genderless","role":"Enrollment verification","capabilities":["verification"],"color":"#6576d8"}' \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/activate")"
test "$(printf '%s' "${activate_result}" | jq -r '.enrollment.status')" = "active"
agent_id="$(printf '%s' "${activate_result}" | jq -er '.enrollment.agent.agentId')"

owner_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT count(*) FROM agent_profiles WHERE agent_id = '${agent_id}' AND owner_id = '${parent_id}'::uuid AND registered_by = 'owner';")"
test "${owner_count}" = "1"

curl -fsS -X DELETE \
  -H "Authorization: Bearer ${agent_token}" \
  "${PUBLIC_ORIGIN}/api/agents?agentId=${agent_id}" >/dev/null

printf 'enrollment_api_verification=passed\n'
printf 'create_pair_activate_owner_archive=passed\n'
printf 'single_use_and_cross_parent_isolation=passed\n'
