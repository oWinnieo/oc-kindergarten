import { eq, sql } from 'drizzle-orm';

import { getDatabaseClient } from './db/client';
import { betaParticipants } from './db/schema';

export const BETA_MIGRATION_NOTICE_VERSION = '2026-08-02-v1';

export interface BetaParticipationView {
  cohort: string;
  migrationEligible: boolean;
  noticeVersion: string;
  acknowledgedAt?: string;
}

export type BetaParticipationInputParseResult =
  | { ok: true; input: { migrationEligible: boolean } }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseBetaParticipationInput(
  value: unknown,
): BetaParticipationInputParseResult {
  if (!isRecord(value)) {
    return { ok: false, error: '内测迁移选择必须是对象' };
  }
  const unknownField = Object.keys(value).find(
    (field) => field !== 'migrationEligible',
  );
  if (unknownField) {
    return { ok: false, error: `内测迁移选择不允许字段：${unknownField}` };
  }
  if (typeof value.migrationEligible !== 'boolean') {
    return { ok: false, error: 'migrationEligible 必须是布尔值' };
  }
  return {
    ok: true,
    input: { migrationEligible: value.migrationEligible },
  };
}

export function currentBetaCohort(
  environment: Record<string, string | undefined> = process.env,
): string {
  const cohort = environment.BETA_COHORT?.trim() ?? '';
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(cohort)) {
    throw new Error('BETA_COHORT 未配置或格式无效');
  }
  return cohort;
}

type BetaParticipationRow = typeof betaParticipants.$inferSelect;

function rowToView(row: BetaParticipationRow): BetaParticipationView {
  return {
    cohort: row.cohort,
    migrationEligible: row.migrationEligible,
    noticeVersion: row.noticeVersion,
    ...(row.acknowledgedAt
      ? { acknowledgedAt: row.acknowledgedAt.toISOString() }
      : {}),
  };
}

export async function getBetaParticipation(
  parentUserId: string,
): Promise<BetaParticipationView> {
  const cohort = currentBetaCohort();
  const { database } = getDatabaseClient();
  const rows = await database
    .select()
    .from(betaParticipants)
    .where(eq(betaParticipants.parentUserId, parentUserId))
    .limit(1);
  if (rows[0]?.noticeVersion === BETA_MIGRATION_NOTICE_VERSION) {
    return rowToView(rows[0]);
  }
  return {
    cohort,
    migrationEligible: false,
    noticeVersion: BETA_MIGRATION_NOTICE_VERSION,
  };
}

export async function updateBetaParticipation(
  parentUserId: string,
  migrationEligible: boolean,
): Promise<BetaParticipationView> {
  const cohort = currentBetaCohort();
  const now = new Date();
  const { database } = getDatabaseClient();
  const rows = await database
    .insert(betaParticipants)
    .values({
      parentUserId,
      cohort,
      migrationEligible,
      noticeVersion: BETA_MIGRATION_NOTICE_VERSION,
      acknowledgedAt: migrationEligible ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: betaParticipants.parentUserId,
      set: {
        cohort,
        migrationEligible,
        noticeVersion: BETA_MIGRATION_NOTICE_VERSION,
        acknowledgedAt: migrationEligible
          ? sql`CASE
              WHEN ${betaParticipants.noticeVersion} = ${BETA_MIGRATION_NOTICE_VERSION}
                THEN COALESCE(${betaParticipants.acknowledgedAt}, ${now})
              ELSE ${now}
            END`
          : sql`CASE
              WHEN ${betaParticipants.noticeVersion} = ${BETA_MIGRATION_NOTICE_VERSION}
                THEN ${betaParticipants.acknowledgedAt}
              ELSE NULL
            END`,
        updatedAt: now,
      },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('内测迁移选择写入后未返回记录');
  return rowToView(row);
}
