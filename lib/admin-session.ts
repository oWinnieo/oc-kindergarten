import { createHmac, timingSafeEqual } from 'node:crypto';
import 'server-only';

export const ADMIN_SESSION_COOKIE = 'oc_kindergarten_admin';
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 8;

function equalValue(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function adminToken(): string | null {
  return process.env.OC_KINDERGARTEN_ADMIN_TOKEN?.trim() || null;
}

export function isAdminConfigured(): boolean {
  return adminToken() !== null;
}

function sessionSignature(token: string): string {
  const secret =
    process.env.OC_KINDERGARTEN_ADMIN_SESSION_SECRET?.trim() || token;
  return createHmac('sha256', secret)
    .update(`oc-kindergarten-admin-session-v1:${token}`)
    .digest('base64url');
}

export function isAdminToken(candidate: string): boolean {
  const expected = adminToken();
  return Boolean(expected && candidate && equalValue(candidate, expected));
}

export function createAdminSessionValue(): string | null {
  const token = adminToken();
  return token ? sessionSignature(token) : null;
}

export function isAdminSession(candidate: string | undefined): boolean {
  const expected = createAdminSessionValue();
  return Boolean(expected && candidate && equalValue(candidate, expected));
}

export function authorizeAdminRequest(request: Request): boolean {
  const authorization = request.headers.get('authorization') ?? '';
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  if (bearer && isAdminToken(bearer)) return true;

  const cookie = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === ADMIN_SESSION_COOKIE)?.[1];
  return isAdminSession(cookie);
}
