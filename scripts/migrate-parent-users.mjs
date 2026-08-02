import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

export const APPLY_CONFIRMATION = 'MIGRATE_ELIGIBLE_BETA_PARENTS';
export const MIGRATION_NOTICE_VERSION = '2026-08-02-v1';

function identityKey(row) {
  return `${row.oidc_issuer}\u0000${row.oidc_subject}`;
}

export function planParentUserMigration(sourceRows, targetRows) {
  const targetById = new Map(targetRows.map((row) => [row.id, row]));
  const targetByIdentity = new Map(
    targetRows.map((row) => [identityKey(row), row]),
  );
  const inserts = [];
  let existing = 0;
  let uuidConflicts = 0;
  let identityConflicts = 0;

  for (const sourceRow of sourceRows) {
    const sameId = targetById.get(sourceRow.id);
    const sameIdentity = targetByIdentity.get(identityKey(sourceRow));
    if (!sameId && !sameIdentity) {
      inserts.push(sourceRow);
      continue;
    }
    if (
      sameId &&
      sameIdentity &&
      sameId.id === sameIdentity.id &&
      identityKey(sameId) === identityKey(sourceRow)
    ) {
      existing += 1;
      continue;
    }
    if (sameId && identityKey(sameId) !== identityKey(sourceRow)) {
      uuidConflicts += 1;
    }
    if (sameIdentity && sameIdentity.id !== sourceRow.id) {
      identityConflicts += 1;
    }
  }

  return {
    selected: sourceRows.length,
    inserts,
    insertCount: inserts.length,
    existing,
    uuidConflicts,
    identityConflicts,
    conflictCount: uuidConflicts + identityConflicts,
  };
}

function required(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function databaseEndpoint(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`${name} must use PostgreSQL`);
  }
  return `${url.protocol}//${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

function parseMode(argumentsList) {
  const apply = argumentsList.includes('--apply');
  const dryRun = argumentsList.includes('--dry-run');
  if (apply && dryRun) throw new Error('choose either --dry-run or --apply');
  const confirmationArgument = argumentsList.find((argument) =>
    argument.startsWith('--confirm='),
  );
  const confirmation = confirmationArgument?.slice('--confirm='.length);
  if (apply && confirmation !== APPLY_CONFIRMATION) {
    throw new Error(`--apply requires --confirm=${APPLY_CONFIRMATION}`);
  }
  const supportedArguments = new Set([
    '--dry-run',
    '--apply',
    ...(confirmationArgument ? [confirmationArgument] : []),
  ]);
  const unknown = argumentsList.find((argument) => !supportedArguments.has(argument));
  if (unknown) throw new Error(`unknown argument: ${unknown}`);
  return { apply };
}

function printPlan(plan, mode) {
  process.stdout.write(
    [
      `Mode: ${mode}`,
      `Eligible source users: ${plan.selected}`,
      `Ready to insert: ${plan.insertCount}`,
      `Already present: ${plan.existing}`,
      `UUID conflicts: ${plan.uuidConflicts}`,
      `Identity conflicts: ${plan.identityConflicts}`,
    ].join('\n') + '\n',
  );
}

export async function runParentUserMigration({
  environment = process.env,
  argumentsList = process.argv.slice(2),
} = {}) {
  const mode = parseMode(argumentsList);
  if (required(environment, 'SOURCE_KINDERGARTEN_ENV') !== 'dev') {
    throw new Error('SOURCE_KINDERGARTEN_ENV must be dev');
  }
  if (required(environment, 'TARGET_KINDERGARTEN_ENV') !== 'prod') {
    throw new Error('TARGET_KINDERGARTEN_ENV must be prod');
  }
  const sourceUrl = required(environment, 'SOURCE_DATABASE_URL');
  const targetUrl = required(environment, 'TARGET_DATABASE_URL');
  if (
    databaseEndpoint(sourceUrl, 'SOURCE_DATABASE_URL') ===
    databaseEndpoint(targetUrl, 'TARGET_DATABASE_URL')
  ) {
    throw new Error('source and target database endpoints must be different');
  }

  const source = postgres(sourceUrl, { max: 1, prepare: false });
  const target = postgres(targetUrl, { max: 1, prepare: false });
  try {
    const sourceRows = await source`
      SELECT
        parent.id::text,
        parent.oidc_issuer,
        parent.oidc_subject,
        parent.email,
        parent.display_name,
        parent.avatar_url,
        parent.timezone,
        parent.language,
        parent.created_at,
        parent.updated_at,
        beta.cohort,
        beta.notice_version,
        beta.acknowledged_at,
        beta.created_at AS beta_created_at,
        beta.updated_at AS beta_updated_at
      FROM parent_users AS parent
      INNER JOIN beta_participants AS beta
        ON beta.parent_user_id = parent.id
      WHERE beta.migration_eligible = TRUE
        AND beta.acknowledged_at IS NOT NULL
        AND beta.notice_version = ${MIGRATION_NOTICE_VERSION}
      ORDER BY parent.id
    `;
    const targetRows = await target`
      SELECT id::text, oidc_issuer, oidc_subject
      FROM parent_users
      ORDER BY id
    `;
    const targetSchema = await target`
      SELECT to_regclass('public.beta_participants')::text AS table_name
    `;
    if (!targetSchema[0]?.table_name) {
      throw new Error('target schema is missing beta_participants migration');
    }
    const plan = planParentUserMigration(sourceRows, targetRows);
    printPlan(plan, mode.apply ? 'apply' : 'dry-run');

    if (plan.conflictCount > 0) {
      throw new Error('migration stopped because identity conflicts require review');
    }
    if (!mode.apply) return plan;

    let insertedCount = 0;
    await target.begin(async (transaction) => {
      for (const row of plan.inserts) {
        await transaction`
          INSERT INTO parent_users (
            id, oidc_issuer, oidc_subject, email, display_name, avatar_url,
            timezone, language, created_at, updated_at
          ) VALUES (
            ${row.id}::uuid, ${row.oidc_issuer}, ${row.oidc_subject}, ${row.email},
            ${row.display_name}, ${row.avatar_url}, ${row.timezone}, ${row.language},
            ${row.created_at}, ${row.updated_at}
          )
        `;
        await transaction`
          INSERT INTO beta_participants (
            parent_user_id, cohort, migration_eligible, notice_version,
            acknowledged_at, created_at, updated_at
          ) VALUES (
            ${row.id}::uuid, ${row.cohort}, TRUE, ${row.notice_version},
            ${row.acknowledged_at}, ${row.beta_created_at}, ${row.beta_updated_at}
          )
        `;
      }
      const verification = plan.insertCount
        ? await transaction`
            SELECT count(*)::integer AS count
            FROM parent_users AS target_parent
            INNER JOIN beta_participants AS target_beta
              ON target_beta.parent_user_id = target_parent.id
            WHERE target_parent.id = ANY(${plan.inserts.map((row) => row.id)}::uuid[])
              AND target_beta.migration_eligible = TRUE
              AND target_beta.notice_version = ${MIGRATION_NOTICE_VERSION}
          `
        : [{ count: 0 }];
      insertedCount = verification[0]?.count ?? 0;
      if (insertedCount !== plan.insertCount) {
        throw new Error('in-transaction count verification failed');
      }
    });
    process.stdout.write(`Applied and verified: ${insertedCount}\n`);
    return plan;
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

const isMain = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isMain) {
  runParentUserMigration().catch((error) => {
    process.stderr.write(
      `Parent migration failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    process.exitCode = 1;
  });
}
