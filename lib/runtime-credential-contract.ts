import { createHash, randomBytes } from 'node:crypto';

const RUNTIME_CREDENTIAL_PREFIX = 'ockg_rt_';
const RUNTIME_CREDENTIAL_PATTERN = /^ockg_rt_[A-Za-z0-9_-]{43}$/;

export interface IssuedRuntimeCredential {
  token: string;
  tokenHash: string;
}

export function normalizeRuntimeCredentialToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return RUNTIME_CREDENTIAL_PATTERN.test(token) ? token : null;
}

export function hashRuntimeCredentialToken(value: unknown): string | null {
  const token = normalizeRuntimeCredentialToken(value);
  if (!token) return null;
  return createHash('sha256')
    .update(`oc-kindergarten-runtime-credential-v1:${token}`)
    .digest('hex');
}

export function generateRuntimeCredential(): IssuedRuntimeCredential {
  const token = `${RUNTIME_CREDENTIAL_PREFIX}${randomBytes(32).toString('base64url')}`;
  const tokenHash = hashRuntimeCredentialToken(token);
  if (!tokenHash) throw new Error('生成的 runtime credential 格式无效');
  return { token, tokenHash };
}
