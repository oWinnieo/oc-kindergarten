#!/usr/bin/env bash
set -Eeuo pipefail

report_failure() {
  local status="$?"
  printf 'enrollment_api_verification_failed_line=%s status=%s\n' \
    "${BASH_LINENO[0]:-unknown}" "${status}" >&2
  return "${status}"
}
trap report_failure ERR

PROJECT_DIR="${1:-/opt/docker/oc-projects/oc-kindergarten}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://kindergarten-dev.rococo.dev}"
cd "${PROJECT_DIR}"

test_stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
test_subject="enrollment-verification-${test_stamp}"
other_subject="enrollment-other-parent-${test_stamp}"
test_native_agent="verification-${test_stamp}"
parent_id=""
other_parent_id=""
sse_tmp_dir=""
sse_first_pid=""
sse_second_pid=""

stop_sse_captures() {
  local pid
  for pid in "${sse_first_pid}" "${sse_second_pid}"; do
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
      kill "${pid}" 2>/dev/null || true
    fi
    if [[ -n "${pid}" ]]; then
      wait "${pid}" 2>/dev/null || true
    fi
  done
  sse_first_pid=""
  sse_second_pid=""
}

wait_for_pattern() {
  local file="$1"
  local pattern="$2"
  local attempt
  for ((attempt = 0; attempt < 60; attempt += 1)); do
    if [[ -f "${file}" ]] && grep -Fq -- "${pattern}" "${file}"; then
      return 0
    fi
    sleep 0.25
  done
  echo "Timed out waiting for ${pattern} in ${file}" >&2
  return 1
}

cleanup() {
  stop_sse_captures
  if [[ -n "${sse_tmp_dir}" ]]; then
    rm -f -- \
      "${sse_tmp_dir}/auth-cookies.txt" \
      "${sse_tmp_dir}/registry-tab-1.sse" \
      "${sse_tmp_dir}/registry-tab-2.sse"
    rmdir "${sse_tmp_dir}" 2>/dev/null || true
  fi
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
DELETE FROM agent_action_commands
WHERE agent_id IN (
  SELECT p.agent_id FROM agent_profiles p
  JOIN agent_enrollments e ON e.id = p.enrollment_id
  WHERE e.parent_user_id IN (:'parent_id'::uuid, :'other_parent_id'::uuid)
);
DELETE FROM agent_event_cursors
WHERE agent_id IN (
  SELECT p.agent_id FROM agent_profiles p
  JOIN agent_enrollments e ON e.id = p.enrollment_id
  WHERE e.parent_user_id IN (:'parent_id'::uuid, :'other_parent_id'::uuid)
);
DELETE FROM agent_latest_states
WHERE agent_id IN (
  SELECT p.agent_id FROM agent_profiles p
  JOIN agent_enrollments e ON e.id = p.enrollment_id
  WHERE e.parent_user_id IN (:'parent_id'::uuid, :'other_parent_id'::uuid)
);
DELETE FROM agent_event_log
WHERE agent_id IN (
  SELECT p.agent_id FROM agent_profiles p
  JOIN agent_enrollments e ON e.id = p.enrollment_id
  WHERE e.parent_user_id IN (:'parent_id'::uuid, :'other_parent_id'::uuid)
);
DELETE FROM event_outbox
WHERE aggregate_id IN (
  SELECT p.agent_id FROM agent_profiles p
  JOIN agent_enrollments e ON e.id = p.enrollment_id
  WHERE e.parent_user_id IN (:'parent_id'::uuid, :'other_parent_id'::uuid)
);
DELETE FROM runtime_credentials
WHERE binding_id IN (
  SELECT id FROM provider_agent_bindings
  WHERE provider = 'openclaw' AND native_agent_id = :'native_agent'
);
DELETE FROM provider_agent_bindings
WHERE provider = 'openclaw' AND native_agent_id = :'native_agent';
DELETE FROM agent_profiles
WHERE enrollment_id IN (
  SELECT id FROM agent_enrollments
  WHERE parent_user_id IN (:'parent_id'::uuid, :'other_parent_id'::uuid)
);
DELETE FROM agent_enrollments
WHERE parent_user_id IN (:'parent_id'::uuid, :'other_parent_id'::uuid);
DELETE FROM parent_users
WHERE id IN (:'parent_id'::uuid, :'other_parent_id'::uuid);
COMMIT;
SQL
}
trap cleanup EXIT INT TERM

sse_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/oc-kindergarten-enrollment-verify.XXXXXX")"

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

csrf_json="$(curl -fsS \
  -c "${sse_tmp_dir}/auth-cookies.txt" \
  "${PUBLIC_ORIGIN}/api/auth/csrf")"
csrf_token="$(printf '%s' "${csrf_json}" | jq -er '.csrfToken')"
signin_json="$(curl -fsS \
  -b "${sse_tmp_dir}/auth-cookies.txt" \
  -c "${sse_tmp_dir}/auth-cookies.txt" \
  -X POST \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "csrfToken=${csrf_token}" \
  --data-urlencode "callbackUrl=${PUBLIC_ORIGIN}/family" \
  --data-urlencode 'json=true' \
  "${PUBLIC_ORIGIN}/api/auth/signin/casdoor")"
signin_url="$(printf '%s' "${signin_json}" | jq -er '.url')"
casdoor_issuer="$(sed -n 's/^CASDOOR_ISSUER_URL=//p' .env | tail -n 1)"
if [[ -z "${casdoor_issuer}" ]]; then
  echo "Casdoor issuer is not configured" >&2
  exit 1
fi
casdoor_issuer="${casdoor_issuer%/}"
case "${signin_url}" in
  "${casdoor_issuer}"/*) ;;
  *)
    echo "Casdoor sign-in did not return the configured issuer" >&2
    exit 1
    ;;
esac
expected_auth_callback="$(jq -rn \
  --arg callback "${PUBLIC_ORIGIN}/api/auth/callback/casdoor" \
  '$callback | @uri')"
case "${signin_url}" in
  *"redirect_uri=${expected_auth_callback}"*) ;;
  *)
    echo "Casdoor sign-in returned an unexpected OAuth callback" >&2
    exit 1
    ;;
esac
grep -Eq 'next-auth\.callback-url.*%2Ffamily([[:space:]]|$)' \
  "${sse_tmp_dir}/auth-cookies.txt"

cancel_create_json="$(curl -fsS -X POST -H "Cookie: ${session_cookie}" "${PUBLIC_ORIGIN}/api/enrollments")"
cancel_enrollment_id="$(printf '%s' "${cancel_create_json}" | jq -er '.enrollment.id')"
cancel_result="$(curl -fsS -X POST \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${cancel_enrollment_id}/archive")"
test "$(printf '%s' "${cancel_result}" | jq -r '.enrollment.status')" = "archived"

create_json="$(curl -fsS -X POST -H "Cookie: ${session_cookie}" "${PUBLIC_ORIGIN}/api/enrollments")"
enrollment_id="$(printf '%s' "${create_json}" | jq -er '.enrollment.id')"

code_json="$(curl -fsS -X POST -H "Cookie: ${session_cookie}" "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/pairing-code")"
pairing_code="$(printf '%s' "${code_json}" | jq -er '.pairingCode')"

pair_json="$(jq -cn \
  --arg pairing_code "${pairing_code}" \
  --arg native_agent "${test_native_agent}" \
  '{schemaVersion:1,pairingCode:$pairing_code,discovery:{schemaVersion:1,provider:"openclaw",nativeAgentId:$native_agent,runtimeInstanceId:"verification-runtime",adapterVersion:"verification",profileDraft:{displayName:"Verification Agent",role:"Enrollment verification",capabilities:["verification"]}}}')"
pair_result="$(curl -fsS -X POST \
  -H 'Content-Type: application/json' \
  --data-binary "${pair_json}" \
  "${PUBLIC_ORIGIN}/api/runtime/enrollments/pair")"
test "$(printf '%s' "${pair_result}" | jq -r '.pairing.status')" = "pending_parent_confirmation"
runtime_credential="$(printf '%s' "${pair_result}" | jq -er '.pairing.credential.token')"
test "$(printf '%s' "${pair_result}" | jq -r '.pairing.credential.tokenType')" = "Bearer"
printf '%s' "${runtime_credential}" | grep -Eq '^ockg_rt_[A-Za-z0-9_-]{43}$'

credential_storage_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -v native_agent="${test_native_agent}" \
  -v runtime_credential="${runtime_credential}" \
  -At <<'SQL'
SELECT count(*)
FROM runtime_credentials c
JOIN provider_agent_bindings b ON b.id = c.binding_id
WHERE b.provider = 'openclaw'
  AND b.native_agent_id = :'native_agent'
  AND c.status = 'active'
  AND c.token_hash <> :'runtime_credential';
SQL
)"
test "${credential_storage_count}" = "1"

reused_code_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  --data-binary "${pair_json}" \
  "${PUBLIC_ORIGIN}/api/runtime/enrollments/pair")"
test "${reused_code_status}" = "404"

scoped_discovery_json="$(jq -cn \
  --arg native_agent "${test_native_agent}" \
  '{schemaVersion:1,provider:"openclaw",nativeAgentId:$native_agent,runtimeInstanceId:"verification-runtime",adapterVersion:"verification"}')"
scoped_discovery_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${runtime_credential}" \
  -H 'Content-Type: application/json' \
  --data-binary "${scoped_discovery_json}" \
  "${PUBLIC_ORIGIN}/api/runtime/agents/discover")"
test "${scoped_discovery_status}" = "202"

wrong_identity_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${runtime_credential}" \
  -H 'Content-Type: application/json' \
  --data-binary '{"schemaVersion":1,"provider":"openclaw","nativeAgentId":"another-agent"}' \
  "${PUBLIC_ORIGIN}/api/runtime/agents/discover")"
test "${wrong_identity_status}" = "401"

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
test "$(printf '%s' "${activate_result}" | jq -r '.enrollment.agent.appearancePreset')" = "classic"
agent_id="$(printf '%s' "${activate_result}" | jq -er '.enrollment.agent.agentId')"

owner_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT count(*) FROM agent_profiles WHERE agent_id = '${agent_id}' AND owner_id = '${parent_id}'::uuid AND registered_by = 'owner';")"
test "${owner_count}" = "1"

profile_revision_before="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT revision FROM agent_profiles WHERE agent_id = '${agent_id}';")"
registry_cursor_before="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT COALESCE(max(id), 0) FROM event_outbox;")"

other_parent_profile_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
  -H "Cookie: ${other_session_cookie}" \
  -H 'Content-Type: application/json' \
  --data-binary '{"displayName":"Cross-family edit","characterVariant":"boy","color":"#112233"}' \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/profile")"
test "${other_parent_profile_status}" = "404"

curl -sS -N --max-time 15 \
  -H "Last-Event-ID: registry:${registry_cursor_before}" \
  "${PUBLIC_ORIGIN}/api/agents/stream" \
  >"${sse_tmp_dir}/registry-tab-1.sse" &
sse_first_pid=$!
curl -sS -N --max-time 15 \
  -H "Last-Event-ID: registry:${registry_cursor_before}" \
  "${PUBLIC_ORIGIN}/api/agents/stream" \
  >"${sse_tmp_dir}/registry-tab-2.sse" &
sse_second_pid=$!
wait_for_pattern "${sse_tmp_dir}/registry-tab-1.sse" ': Agent Registry API v1 durable'
wait_for_pattern "${sse_tmp_dir}/registry-tab-2.sse" ': Agent Registry API v1 durable'

active_profile_result="$(curl -fsS -X PATCH \
  -H "Cookie: ${session_cookie}" \
  -H 'Content-Type: application/json' \
  --data-binary '{"displayName":"Verification Active Profile","characterVariant":"girl","appearancePreset":"berry","role":"Active profile verification","personalitySummary":"Checks owner profile updates","capabilities":["profile-update","sse"],"color":"#2a7db6"}' \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/profile")"
test "$(printf '%s' "${active_profile_result}" | jq -r '.enrollment.status')" = "active"
test "$(printf '%s' "${active_profile_result}" | jq -r '.enrollment.agent.displayName')" = "Verification Active Profile"
test "$(printf '%s' "${active_profile_result}" | jq -r '.enrollment.agent.characterVariant')" = "girl"
test "$(printf '%s' "${active_profile_result}" | jq -r '.enrollment.agent.appearancePreset')" = "berry"
test "$(printf '%s' "${active_profile_result}" | jq -r '.enrollment.agent.color')" = "#2a7db6"
test "$(printf '%s' "${active_profile_result}" | jq -r '.enrollment.agent.capabilities | join(",")')" = "profile-update,sse"
active_profile_revision="$(printf '%s' "${active_profile_result}" | jq -er '.enrollment.agent.revision')"
test "${active_profile_revision}" -gt "${profile_revision_before}"

wait_for_pattern "${sse_tmp_dir}/registry-tab-1.sse" '"displayName":"Verification Active Profile"'
wait_for_pattern "${sse_tmp_dir}/registry-tab-2.sse" '"displayName":"Verification Active Profile"'
wait_for_pattern "${sse_tmp_dir}/registry-tab-1.sse" '"appearancePreset":"berry"'
wait_for_pattern "${sse_tmp_dir}/registry-tab-2.sse" '"appearancePreset":"berry"'
wait_for_pattern "${sse_tmp_dir}/registry-tab-1.sse" "\"revision\":${active_profile_revision}"
wait_for_pattern "${sse_tmp_dir}/registry-tab-2.sse" "\"revision\":${active_profile_revision}"
stop_sse_captures

active_profile_db_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT count(*) FROM agent_profiles WHERE agent_id = '${agent_id}' AND display_name = 'Verification Active Profile' AND character_variant = 'girl' AND appearance_preset = 'berry' AND role = 'Active profile verification' AND personality_summary = 'Checks owner profile updates' AND capabilities = '[\"profile-update\", \"sse\"]'::jsonb AND color = '#2a7db6' AND revision = ${active_profile_revision};")"
test "${active_profile_db_count}" = "1"

active_profile_sync_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT count(*) FROM agent_enrollments e JOIN provider_agent_bindings b ON b.agent_id = '${agent_id}' WHERE e.id = '${enrollment_id}' AND e.draft_profile->>'displayName' = 'Verification Active Profile' AND e.draft_profile->>'characterVariant' = 'girl' AND e.draft_profile->>'appearancePreset' = 'berry' AND b.discovery_draft->>'displayName' = 'Verification Active Profile' AND b.discovery_draft->>'characterVariant' = 'girl' AND b.discovery_draft->>'appearancePreset' = 'berry';")"
test "${active_profile_sync_count}" = "1"

active_profile_outbox_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT count(*) FROM event_outbox WHERE id > ${registry_cursor_before} AND topic = 'agent.registry' AND aggregate_id = '${agent_id}' AND payload->>'type' = 'agent.profile.upserted' AND payload->>'revision' = '${active_profile_revision}' AND payload#>>'{profile,displayName}' = 'Verification Active Profile' AND payload#>>'{profile,appearancePreset}' = 'berry' AND published_at IS NOT NULL;")"
test "${active_profile_outbox_count}" = "1"

active_registry_profile_count="$(curl -fsS "${PUBLIC_ORIGIN}/api/agents" | \
  jq --arg agent_id "${agent_id}" --argjson revision "${active_profile_revision}" '[.profiles[] | select(.agentId == $agent_id and .displayName == "Verification Active Profile" and .characterVariant == "girl" and .appearancePreset == "berry" and .color == "#2a7db6" and .revision == $revision)] | length')"
test "${active_registry_profile_count}" = "1"

action_request_id="verification-action-${test_stamp}"
action_json="$(jq -cn \
  --arg request_id "${action_request_id}" \
  '{schemaVersion:1,action:"researching",requestId:$request_id}')"
action_result="$(curl -fsS -X POST \
  -H "Cookie: ${session_cookie}" \
  -H 'Content-Type: application/json' \
  --data-binary "${action_json}" \
  "${PUBLIC_ORIGIN}/api/agents/${agent_id}/actions")"
test "$(printf '%s' "${action_result}" | jq -r '.accepted')" = "1"
test "$(printf '%s' "${action_result}" | jq -r '.event.source')" = "command"

duplicate_action_result="$(curl -fsS -X POST \
  -H "Cookie: ${session_cookie}" \
  -H 'Content-Type: application/json' \
  --data-binary "${action_json}" \
  "${PUBLIC_ORIGIN}/api/agents/${agent_id}/actions")"
test "$(printf '%s' "${duplicate_action_result}" | jq -r '.accepted')" = "0"

other_parent_action_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Cookie: ${other_session_cookie}" \
  -H 'Content-Type: application/json' \
  --data-binary "$(jq -cn --arg request_id "other-${action_request_id}" '{schemaVersion:1,action:"idle",requestId:$request_id}')" \
  "${PUBLIC_ORIGIN}/api/agents/${agent_id}/actions")"
test "${other_parent_action_status}" = "403"

signed_out_activity_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/activity")"
test "${signed_out_activity_status}" = "401"

invalid_activity_cursor_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/activity?cursor=private")"
test "${invalid_activity_cursor_status}" = "400"

other_parent_activity_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Cookie: ${other_session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/activity")"
test "${other_parent_activity_status}" = "404"

command_activity_result="$(curl -fsS \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/activity?limit=5")"
test "$(printf '%s' "${command_activity_result}" | jq -r '.schemaVersion')" = "1"
test "$(printf '%s' "${command_activity_result}" | jq -r '.items | length')" = "1"
test "$(printf '%s' "${command_activity_result}" | jq -r '.items[0].kind')" = "command"
test "$(printf '%s' "${command_activity_result}" | jq -r '.items[0].title')" = '已收到“阅读”指令'
test "$(printf '%s' "${command_activity_result}" | jq -r '.items[0].detail')" = "准备前往阅读角"
test "$(printf '%s' "${command_activity_result}" | jq -r '.items[0] | has("payload") or has("source") or has("metadata")')" = "false"

command_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT count(*) FROM agent_action_commands WHERE request_id = '${action_request_id}' AND actor_parent_user_id = '${parent_id}'::uuid AND action = 'researching';")"
test "${command_count}" = "1"

other_parent_suspend_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Cookie: ${other_session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/suspend")"
test "${other_parent_suspend_status}" = "404"

suspend_result="$(curl -fsS -X POST \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/suspend")"
test "$(printf '%s' "${suspend_result}" | jq -r '.enrollment.status')" = "suspended"

suspended_profile_revision_before="$(printf '%s' "${suspend_result}" | jq -er '.enrollment.agent.revision')"
suspended_registry_cursor_before="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT COALESCE(max(id), 0) FROM event_outbox;")"

suspended_profile_result="$(curl -fsS -X PATCH \
  -H "Cookie: ${session_cookie}" \
  -H 'Content-Type: application/json' \
  --data-binary '{"displayName":"Verification Suspended Profile","characterVariant":"genderless","appearancePreset":"meadow","role":"Suspended profile verification","capabilities":["profile-update"],"color":"#6576d8"}' \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/profile")"
test "$(printf '%s' "${suspended_profile_result}" | jq -r '.enrollment.status')" = "suspended"
test "$(printf '%s' "${suspended_profile_result}" | jq -r '.enrollment.agent.displayName')" = "Verification Suspended Profile"
test "$(printf '%s' "${suspended_profile_result}" | jq -r '.enrollment.agent.appearancePreset')" = "meadow"
suspended_profile_revision="$(printf '%s' "${suspended_profile_result}" | jq -er '.enrollment.agent.revision')"
test "${suspended_profile_revision}" -gt "${suspended_profile_revision_before}"

suspended_profile_outbox_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT count(*) FROM event_outbox WHERE id > ${suspended_registry_cursor_before} AND topic = 'agent.registry' AND aggregate_id = '${agent_id}';")"
test "${suspended_profile_outbox_count}" = "0"

suspended_profile_sync_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT count(*) FROM agent_profiles p JOIN agent_enrollments e ON e.id = p.enrollment_id JOIN provider_agent_bindings b ON b.agent_id = p.agent_id WHERE p.agent_id = '${agent_id}' AND p.revision = ${suspended_profile_revision} AND p.display_name = 'Verification Suspended Profile' AND p.appearance_preset = 'meadow' AND e.draft_profile->>'displayName' = 'Verification Suspended Profile' AND e.draft_profile->>'appearancePreset' = 'meadow' AND b.discovery_draft->>'displayName' = 'Verification Suspended Profile' AND b.discovery_draft->>'appearancePreset' = 'meadow';")"
test "${suspended_profile_sync_count}" = "1"

suspended_registry_count="$(curl -fsS "${PUBLIC_ORIGIN}/api/agents" | \
  jq --arg agent_id "${agent_id}" '[.profiles[] | select(.agentId == $agent_id)] | length')"
test "${suspended_registry_count}" = "0"

suspended_action_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Cookie: ${session_cookie}" \
  -H 'Content-Type: application/json' \
  --data-binary "$(jq -cn --arg request_id "suspended-${action_request_id}" '{schemaVersion:1,action:"idle",requestId:$request_id}')" \
  "${PUBLIC_ORIGIN}/api/agents/${agent_id}/actions")"
test "${suspended_action_status}" = "409"

suspended_event_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${agent_token}" \
  -H 'Content-Type: application/json' \
  --data-binary "$(jq -cn --arg agent_id "${agent_id}" --arg event_id "suspended-event-${test_stamp}" '{schemaVersion:1,eventId:$event_id,type:"agent.state",agentId:$agent_id,source:"replay",observedAt:"2026-07-19T00:00:00.000Z",sequence:1,state:"idle"}')" \
  "${PUBLIC_ORIGIN}/api/agent-events")"
test "${suspended_event_status}" = "409"

resume_result="$(curl -fsS -X POST \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/resume")"
test "$(printf '%s' "${resume_result}" | jq -r '.enrollment.status')" = "active"

resumed_registry_count="$(curl -fsS "${PUBLIC_ORIGIN}/api/agents" | \
  jq --arg agent_id "${agent_id}" --argjson revision "${suspended_profile_revision}" '[.profiles[] | select(.agentId == $agent_id and .displayName == "Verification Suspended Profile" and .characterVariant == "genderless" and .appearancePreset == "meadow" and .color == "#6576d8" and .revision > $revision)] | length')"
test "${resumed_registry_count}" = "1"

pre_archive_event_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${agent_token}" \
  -H 'Content-Type: application/json' \
  --data-binary "$(jq -cn --arg agent_id "${agent_id}" --arg event_id "pre-archive-event-${test_stamp}" '{schemaVersion:1,eventId:$event_id,type:"agent.state",agentId:$agent_id,source:"replay",observedAt:"2026-07-19T00:01:00.000Z",sequence:1,state:"writing"}')" \
  "${PUBLIC_ORIGIN}/api/agent-events")"
test "${pre_archive_event_status}" = "200"

activity_first_page="$(curl -fsS \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/activity?limit=1")"
test "$(printf '%s' "${activity_first_page}" | jq -r '.items | length')" = "1"
test "$(printf '%s' "${activity_first_page}" | jq -r '.items[0].title')" = "开始写画活动"
test "$(printf '%s' "${activity_first_page}" | jq -r '.items[0].detail')" = "前往写画桌"
activity_first_cursor="$(printf '%s' "${activity_first_page}" | jq -er '.items[0].cursor')"
activity_next_cursor="$(printf '%s' "${activity_first_page}" | jq -er '.nextCursor')"
test "${activity_first_cursor}" = "${activity_next_cursor}"

activity_second_page="$(curl -fsS \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/activity?limit=1&cursor=${activity_next_cursor}")"
test "$(printf '%s' "${activity_second_page}" | jq -r '.items | length')" = "1"
test "$(printf '%s' "${activity_second_page}" | jq -r '.items[0].kind')" = "command"
test "$(printf '%s' "${activity_second_page}" | jq -r '.items[0].cursor')" != "${activity_first_cursor}"
test "$(printf '%s' "${activity_second_page}" | jq -r '.nextCursor')" = "null"

archive_result="$(curl -fsS -X POST \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/archive")"
test "$(printf '%s' "${archive_result}" | jq -r '.enrollment.status')" = "archived"

archived_activity_result="$(curl -fsS \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/activity?limit=5")"
test "$(printf '%s' "${archived_activity_result}" | jq -r '.items | length')" = "2"
test "$(printf '%s' "${archived_activity_result}" | jq -r '.items[0].title')" = "开始写画活动"

repeat_archive_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/archive")"
test "${repeat_archive_status}" = "200"

archive_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT count(*) FROM agent_profiles p JOIN agent_enrollments e ON e.id = p.enrollment_id JOIN provider_agent_bindings b ON b.agent_id = p.agent_id WHERE p.agent_id = '${agent_id}' AND p.archived_at IS NOT NULL AND e.status = 'archived' AND b.status = 'revoked';")"
test "${archive_count}" = "1"

archived_scoped_credential_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${runtime_credential}" \
  -H 'Content-Type: application/json' \
  --data-binary "${scoped_discovery_json}" \
  "${PUBLIC_ORIGIN}/api/runtime/agents/discover")"
test "${archived_scoped_credential_status}" = "401"

archived_registry_count="$(curl -fsS "${PUBLIC_ORIGIN}/api/agents" | \
  jq --arg agent_id "${agent_id}" '[.profiles[] | select(.agentId == $agent_id)] | length')"
test "${archived_registry_count}" = "0"

archived_latest_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -At -c "SELECT count(*) FROM agent_latest_states WHERE agent_id = '${agent_id}';")"
test "${archived_latest_count}" = "0"

archived_event_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${agent_token}" \
  -H 'Content-Type: application/json' \
  --data-binary "$(jq -cn --arg agent_id "${agent_id}" --arg event_id "archived-event-${test_stamp}" '{schemaVersion:1,eventId:$event_id,type:"agent.state",agentId:$agent_id,source:"replay",observedAt:"2026-07-19T00:02:00.000Z",sequence:2,state:"idle"}')" \
  "${PUBLIC_ORIGIN}/api/agent-events")"
test "${archived_event_status}" = "409"

archived_profile_status="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
  -H "Cookie: ${session_cookie}" \
  -H 'Content-Type: application/json' \
  --data-binary '{"displayName":"Archived edit","characterVariant":"boy","color":"#112233"}' \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/profile")"
test "${archived_profile_status}" = "409"

other_claim_create_json="$(curl -fsS -X POST \
  -H "Cookie: ${other_session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments")"
other_claim_enrollment_id="$(printf '%s' "${other_claim_create_json}" | jq -er '.enrollment.id')"
other_claim_code_json="$(curl -fsS -X POST \
  -H "Cookie: ${other_session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${other_claim_enrollment_id}/pairing-code")"
other_claim_pairing_code="$(printf '%s' "${other_claim_code_json}" | jq -er '.pairingCode')"
other_claim_pair_json="$(jq -cn \
  --arg pairing_code "${other_claim_pairing_code}" \
  --arg native_agent "${test_native_agent}" \
  '{schemaVersion:1,pairingCode:$pairing_code,discovery:{schemaVersion:1,provider:"openclaw",nativeAgentId:$native_agent,profileDraft:{displayName:"Cross-owner claim"}}}')"
other_claim_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  --data-binary "${other_claim_pair_json}" \
  "${PUBLIC_ORIGIN}/api/runtime/enrollments/pair")"
test "${other_claim_status}" = "409"

other_parent_restore_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Cookie: ${other_session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/restore")"
test "${other_parent_restore_status}" = "404"

restore_result="$(curl -fsS -X POST \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/restore")"
test "$(printf '%s' "${restore_result}" | jq -r '.enrollment.status')" = "suspended"

repeat_restore_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/restore")"
test "${repeat_restore_status}" = "200"

restored_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -v ON_ERROR_STOP=1 \
  -At -c "SELECT count(*) FROM agent_profiles p JOIN agent_enrollments e ON e.id = p.enrollment_id JOIN provider_agent_bindings b ON b.agent_id = p.agent_id WHERE p.agent_id = '${agent_id}' AND p.archived_at IS NULL AND e.status = 'suspended' AND b.status = 'active';")"
test "${restored_count}" = "1"

restored_scoped_credential_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${runtime_credential}" \
  -H 'Content-Type: application/json' \
  --data-binary "${scoped_discovery_json}" \
  "${PUBLIC_ORIGIN}/api/runtime/agents/discover")"
test "${restored_scoped_credential_status}" = "202"

restored_registry_count="$(curl -fsS "${PUBLIC_ORIGIN}/api/agents" | \
  jq --arg agent_id "${agent_id}" '[.profiles[] | select(.agentId == $agent_id)] | length')"
test "${restored_registry_count}" = "0"

restored_event_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${agent_token}" \
  -H 'Content-Type: application/json' \
  --data-binary "$(jq -cn --arg agent_id "${agent_id}" --arg event_id "restored-suspended-event-${test_stamp}" '{schemaVersion:1,eventId:$event_id,type:"agent.state",agentId:$agent_id,source:"replay",observedAt:"2026-07-19T00:03:00.000Z",sequence:2,state:"idle"}')" \
  "${PUBLIC_ORIGIN}/api/agent-events")"
test "${restored_event_status}" = "409"

post_restore_resume_result="$(curl -fsS -X POST \
  -H "Cookie: ${session_cookie}" \
  "${PUBLIC_ORIGIN}/api/enrollments/${enrollment_id}/resume")"
test "$(printf '%s' "${post_restore_resume_result}" | jq -r '.enrollment.status')" = "active"

post_restore_registry_count="$(curl -fsS "${PUBLIC_ORIGIN}/api/agents" | \
  jq --arg agent_id "${agent_id}" '[.profiles[] | select(.agentId == $agent_id)] | length')"
test "${post_restore_registry_count}" = "1"

post_restore_event_status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer ${agent_token}" \
  -H 'Content-Type: application/json' \
  --data-binary "$(jq -cn --arg agent_id "${agent_id}" --arg event_id "post-restore-event-${test_stamp}" '{schemaVersion:1,eventId:$event_id,type:"agent.state",agentId:$agent_id,source:"replay",observedAt:"2026-07-19T00:04:00.000Z",sequence:2,state:"idle"}')" \
  "${PUBLIC_ORIGIN}/api/agent-events")"
test "${post_restore_event_status}" = "200"

post_restore_latest_count="$(docker compose exec -T postgres psql \
  -U "${POSTGRES_USER:-oc_kindergarten_user}" \
  -d "${POSTGRES_DB:-oc_kindergarten}" \
  -At -c "SELECT count(*) FROM agent_latest_states WHERE agent_id = '${agent_id}' AND state = 'idle';")"
test "${post_restore_latest_count}" = "1"

printf 'enrollment_api_verification=passed\n'
printf 'create_pair_activate_owner_lifecycle=passed\n'
printf 'single_use_and_cross_parent_isolation=passed\n'
printf 'owner_action_idempotency_and_suspension=passed\n'
printf 'active_and_suspended_profile_updates=passed\n'
printf 'profile_revision_registry_outbox_and_dual_sse=passed\n'
printf 'casdoor_direct_signin_family_callback=passed\n'
printf 'owner_pending_enrollment_cancellation=passed\n'
printf 'owner_archive_restore_and_identity_guard=passed\n'
printf 'scoped_credential_archive_restore_guard=passed\n'
printf 'owner_activity_timeline_privacy_and_pagination=passed\n'
