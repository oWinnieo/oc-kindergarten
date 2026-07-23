import { timingSafeEqual } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';

import { getDatabaseClient } from './db/client';
import {
  providerAgentBindings,
  runtimeCredentials,
} from './db/schema';
import { hashRuntimeCredentialToken } from './runtime-credential-contract';

function equalToken(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function authorizeAgentEventRequest(request: Request): boolean {
  const expected = process.env.OC_KINDERGARTEN_AGENT_EVENT_TOKEN?.trim();
  if (!expected) return false;
  const actual = bearerToken(request);
  return actual.length > 0 && equalToken(actual, expected);
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
}

export async function authorizeRuntimeCredentialRequest(
  request: Request,
  scope: {
    provider: string;
    nativeAgentId: string;
    runtimeInstanceId?: string;
  },
): Promise<boolean> {
  if (authorizeAgentEventRequest(request)) return true;
  const tokenHash = hashRuntimeCredentialToken(bearerToken(request));
  if (!tokenHash) return false;
  const { database } = getDatabaseClient();
  const rows = await database
    .select({ id: runtimeCredentials.id })
    .from(runtimeCredentials)
    .innerJoin(
      providerAgentBindings,
      eq(runtimeCredentials.bindingId, providerAgentBindings.id),
    )
    .where(
      and(
        eq(runtimeCredentials.tokenHash, tokenHash),
        eq(runtimeCredentials.status, 'active'),
        ne(providerAgentBindings.status, 'revoked'),
        eq(providerAgentBindings.provider, scope.provider),
        eq(providerAgentBindings.nativeAgentId, scope.nativeAgentId),
      ),
    )
    .limit(1);
  const credential = rows[0];
  if (!credential) return false;
  const now = new Date();
  await database
    .update(runtimeCredentials)
    .set({
      lastUsedAt: now,
      updatedAt: now,
      ...(scope.runtimeInstanceId === undefined
        ? {}
        : { runtimeInstanceId: scope.runtimeInstanceId }),
    })
    .where(eq(runtimeCredentials.id, credential.id));
  return true;
}
