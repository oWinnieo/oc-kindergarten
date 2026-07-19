import { and, eq } from 'drizzle-orm';

import { getDatabaseClient } from './db/client';
import { parentUsers } from './db/schema';
import type { ParentProfilePatch } from './parent-profile-contract';

export interface ParentUserView {
  id: string;
  email?: string;
  displayName: string;
  avatarUrl?: string;
  timezone?: string;
  language?: string;
  createdAt: string;
  updatedAt: string;
}

interface OidcParentInput {
  issuer: string;
  subject: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

type ParentUserRow = typeof parentUsers.$inferSelect;

function rowToView(row: ParentUserRow): ParentUserView {
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

function normalizedIssuer(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('OIDC issuer 必须是 HTTP(S) URL');
  }
  return url.toString().replace(/\/$/, '');
}

function limited(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

export async function upsertParentUserFromOidc(
  input: OidcParentInput,
): Promise<ParentUserView> {
  const issuer = normalizedIssuer(input.issuer);
  const subject = input.subject.trim();
  if (!subject || subject.length > 255) {
    throw new Error('OIDC subject 无效');
  }
  const email = limited(input.email, 320);
  const suggestedName =
    limited(input.displayName, 48) ??
    limited(email?.split('@')[0], 48) ??
    '新家长';
  const avatarUrl = limited(input.avatarUrl, 2048);
  const now = new Date();
  const { database } = getDatabaseClient();
  const rows = await database
    .insert(parentUsers)
    .values({
      oidcIssuer: issuer,
      oidcSubject: subject,
      email,
      displayName: suggestedName,
      avatarUrl,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [parentUsers.oidcIssuer, parentUsers.oidcSubject],
      set: {
        email: email ?? null,
        updatedAt: now,
      },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('家长身份写入后未返回记录');
  return rowToView(row);
}

export async function getParentUserById(
  parentUserId: string,
): Promise<ParentUserView | null> {
  const { database } = getDatabaseClient();
  const rows = await database
    .select()
    .from(parentUsers)
    .where(eq(parentUsers.id, parentUserId))
    .limit(1);
  return rows[0] ? rowToView(rows[0]) : null;
}

export async function getParentUserByOidcIdentity(
  issuerValue: string,
  subject: string,
): Promise<ParentUserView | null> {
  const issuer = normalizedIssuer(issuerValue);
  const { database } = getDatabaseClient();
  const rows = await database
    .select()
    .from(parentUsers)
    .where(
      and(
        eq(parentUsers.oidcIssuer, issuer),
        eq(parentUsers.oidcSubject, subject),
      ),
    )
    .limit(1);
  return rows[0] ? rowToView(rows[0]) : null;
}

export async function updateParentUserProfile(
  parentUserId: string,
  patch: ParentProfilePatch,
): Promise<ParentUserView | null> {
  const updates: Partial<typeof parentUsers.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.displayName !== undefined) updates.displayName = patch.displayName;
  if (patch.avatarUrl !== undefined) updates.avatarUrl = patch.avatarUrl;
  if (patch.timezone !== undefined) updates.timezone = patch.timezone;
  if (patch.language !== undefined) updates.language = patch.language;

  const { database } = getDatabaseClient();
  const rows = await database
    .update(parentUsers)
    .set(updates)
    .where(eq(parentUsers.id, parentUserId))
    .returning();
  return rows[0] ? rowToView(rows[0]) : null;
}
