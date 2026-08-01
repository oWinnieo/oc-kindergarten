import { timingSafeEqual } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';

import { getDatabaseClient } from './db/client';
import {
  providerAgentBindings,
  runtimeCredentials,
} from './db/schema';
import { hashRuntimeCredentialToken } from './runtime-credential-contract';
import type { RuntimeIdentity } from './provider-binding-contract';

export function runtimeCredentialScopeMatches(
  binding: RuntimeIdentity,
  credentialRuntimeInstanceId: string,
  scope: RuntimeIdentity,
): boolean {
  return (
    binding.provider === scope.provider &&
    binding.runtimeInstanceId === scope.runtimeInstanceId &&
    binding.nativeAgentId === scope.nativeAgentId &&
    credentialRuntimeInstanceId === scope.runtimeInstanceId
  );
}

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
  scope: RuntimeIdentity,
): Promise<boolean> {
  if (authorizeAgentEventRequest(request)) return true;
  const tokenHash = hashRuntimeCredentialToken(bearerToken(request));
  if (!tokenHash) return false;
  const { database } = getDatabaseClient();
  const rows = await database
    .select({
      id: runtimeCredentials.id,
      credentialRuntimeInstanceId: runtimeCredentials.runtimeInstanceId,
      provider: providerAgentBindings.provider,
      bindingRuntimeInstanceId: providerAgentBindings.runtimeInstanceId,
      nativeAgentId: providerAgentBindings.nativeAgentId,
    })
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
        eq(
          providerAgentBindings.runtimeInstanceId,
          scope.runtimeInstanceId,
        ),
        eq(providerAgentBindings.nativeAgentId, scope.nativeAgentId),
        eq(runtimeCredentials.runtimeInstanceId, scope.runtimeInstanceId),
      ),
    )
    .limit(1);
  const credential = rows[0];
  if (
    !credential ||
    !runtimeCredentialScopeMatches(
      {
        provider: credential.provider as RuntimeIdentity['provider'],
        runtimeInstanceId: credential.bindingRuntimeInstanceId,
        nativeAgentId: credential.nativeAgentId,
      },
      credential.credentialRuntimeInstanceId,
      scope,
    )
  ) {
    return false;
  }
  const now = new Date();
  await database
    .update(runtimeCredentials)
    .set({
      lastUsedAt: now,
      updatedAt: now,
    })
    .where(eq(runtimeCredentials.id, credential.id));
  return true;
}
