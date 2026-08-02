# OC Kindergarten Development Plan

## Completed: Hermes H1 provider-neutral baseline and H2 plugin beta.1

Status: implemented and locally accepted on 2026-08-01. The standalone local
plugin tag `v0.1.0-beta.1` points to
`9e32d7619c5b9b331704c725ff43ef5bebd8a0e6`; remote publication and external
user observation remain H4 gates.

Implemented scope:

1. Binding and credential identity is
   `(provider, runtimeInstanceId, nativeAgentId)`; migration `0009` explicitly
   namespaces legacy rows and corrects historical credential scope values.
2. `/api/runtime/events` dispatches strict provider wire events through a
   registry while `/api/openclaw/events` remains compatible.
3. Hermes Bridge v1 rejects prompt, history, args, result, raw error and unknown
   fields; duplicate bridge IDs are idempotent and active bindings auto-enter.
4. The standalone Hermes plugin uses profile-scoped credentials, clone-safe
   identities, a bounded serial outbox, controlled retry, non-sensitive status
   and explicit reply sharing opt-in.
5. The server runtime suite, typecheck, production build, local PostgreSQL
   migration replay, eight plugin tests and Hermes `0.19.1` disposable profile
   loading all passed.

Next gate: finish provider-aware onboarding, publish the fixed plugin tag, run
owner acceptance against a disposable paired Hermes profile, then observe one
external user for 24–72 hours.

## Completed: OpenClaw plugin beta.3 multi-Agent credentials

Status: completed and accepted on production on 2026-07-23. Plugin tag
`v0.5.0-beta.3` points to `8de9bd06e963`. `pi-home` completed this acceptance
before its later beta.4 upgrade.

Goal: allow one OpenClaw Gateway to pair multiple Agents without one pairing
overwriting another Agent's scoped credential.

Implemented and accepted scope:

1. Replace the plugin's single `token` setting with a credential store keyed by
   `provider + nativeAgentId` or stable binding identity.
2. Make `openclaw kindergarten pair --agent <id>` update only that Agent's
   credential and preserve every other paired Agent.
3. Resolve the correct credential from the lifecycle hook's Agent context; do
   not fall back to another Agent's scoped token.
4. Migrate the existing single-token beta.2 configuration without printing or
   reissuing secret values. Keep legacy/internal global-token compatibility
   isolated from external beta credentials.
5. Add automated coverage for two Agents on one Gateway: pairing order,
   Gateway restart persistence, credential rotation, archive/revoke isolation,
   restore/resume, and deletion of one Agent without affecting the other.
6. Publish a fixed beta tag, upgrade `pi-home`, then repeat production
   acceptance with disposable Agents and complete cleanup.

Release result: the single-scoped-Agent beta.2 gate is lifted for beta.3.
Legacy/internal global tokens remain isolated compatibility credentials and
must still not be distributed to beta users.

## Completed: beta.4 credential operations and reload ergonomics

Status: released and accepted on `pi-home` on 2026-07-29. Annotated tag
`v0.5.0-beta.4` points to `26a7aa9db71eb5718afca42e1871054fe5f61c53`;
`pi-home` is running that fixed tag.

Goal: make credential state and Gateway activation obvious to operators without
ever exposing secret values.

Preparation and acceptance scope:

1. Add a non-secret credential status command that lists only
   `provider + nativeAgentId`, configuration source, and presence/absence.
2. Make post-pair/post-unpair Gateway reload behavior explicit and testable.
   OpenClaw CLI config mutation records restart intent, but a separately running
   Gateway did not restart during beta.3 acceptance; onboarding currently
   appends an explicit `openclaw gateway restart`.
3. Add integration coverage for automatic beta.2 scoped-token migration on a
   multi-Agent OpenClaw config, including network failure and retry guidance.
4. Add install/update regression coverage for HTTPS Git tags on hosts without a
   GitHub SSH key.
5. Keep rotation, revoke isolation, restore/resume, deletion isolation, secret
   redaction, and complete cleanup as release gates.

Release result: non-secret human/JSON status, explicit
`restart_required | restart_failed | applied | unknown` activation state, safe
apply retry, HTTPS install/upgrade protection and beta.2/beta.3 migration
coverage passed. The `pi-home` upgrade preserved the exact two-Agent credential
store, completed a real Gateway restart and deep RPC readiness check, and ran
successful `frontend` and `fullstack` lifecycle tasks that both returned to
`idle`. A disposable server profile then upgraded a real single-Agent beta.2
scoped credential to beta.4, removed the legacy field, preserved the value
without printing a hash or fingerprint, and reused the migrated credential
after a second Gateway start. The remaining closeout gates are the running
24–72 hour observation and an external user's independent onboarding.
