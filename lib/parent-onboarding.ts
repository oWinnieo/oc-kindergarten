import { eq, sql } from 'drizzle-orm';

import {
  BETA_MIGRATION_NOTICE_VERSION,
  betaAcknowledgementTimestamp,
  currentBetaCohort,
  type BetaParticipationView,
} from './beta-participation';
import { getDatabaseClient } from './db/client';
import { betaParticipants, parentUsers } from './db/schema';
import type { ParentProfilePatch } from './parent-profile-contract';
import type { ParentUserView } from './parent-users';

function parentRowToView(row: typeof parentUsers.$inferSelect): ParentUserView {
  return {
    id: row.id,
    ...(row.email ? { email: row.email } : {}),
    displayName: row.displayName,
    ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
    ...(row.timezone ? { timezone: row.timezone } : {}),
    ...(row.language ? { language: row.language } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function betaRowToView(
  row: typeof betaParticipants.$inferSelect,
): BetaParticipationView {
  return {
    cohort: row.cohort,
    migrationEligible: row.migrationEligible,
    noticeVersion: row.noticeVersion,
    ...(row.acknowledgedAt
      ? { acknowledgedAt: row.acknowledgedAt.toISOString() }
      : {}),
  };
}

export async function updateParentOnboarding(
  parentUserId: string,
  patch: ParentProfilePatch,
  migrationEligible: boolean,
): Promise<{
  parent: ParentUserView;
  betaParticipation: BetaParticipationView;
} | null> {
  const cohort = currentBetaCohort();
  const now = new Date();
  const acknowledgementTimestamp = betaAcknowledgementTimestamp(now);
  const profileUpdates: Partial<typeof parentUsers.$inferInsert> = {
    updatedAt: now,
  };
  if (patch.displayName !== undefined) {
    profileUpdates.displayName = patch.displayName;
  }
  if (patch.avatarUrl !== undefined) profileUpdates.avatarUrl = patch.avatarUrl;
  if (patch.timezone !== undefined) profileUpdates.timezone = patch.timezone;
  if (patch.language !== undefined) profileUpdates.language = patch.language;

  const { database } = getDatabaseClient();
  return database.transaction(async (transaction) => {
    const parentRows = await transaction
      .update(parentUsers)
      .set(profileUpdates)
      .where(eq(parentUsers.id, parentUserId))
      .returning();
    const parentRow = parentRows[0];
    if (!parentRow) return null;

    const betaRows = await transaction
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
                  THEN COALESCE(${betaParticipants.acknowledgedAt}, ${acknowledgementTimestamp})
                ELSE ${acknowledgementTimestamp}
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
    const betaRow = betaRows[0];
    if (!betaRow) throw new Error('内测迁移选择写入后未返回记录');
    return {
      parent: parentRowToView(parentRow),
      betaParticipation: betaRowToView(betaRow),
    };
  });
}
