import { NextResponse } from 'next/server';

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionValue,
  isAdminConfigured,
  isAdminSession,
  isAdminToken,
} from '@/lib/admin-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const session = cookieHeader
    .split(';')
    .map((part) => part.trim().split('='))
    .find(([name]) => name === ADMIN_SESSION_COOKIE)?.[1];
  return NextResponse.json({ isAdmin: isAdminSession(session) });
}

export async function POST(request: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { ok: false, error: '服务器尚未配置管理员凭证' },
      { status: 503 },
    );
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const token =
    typeof input === 'object' &&
    input !== null &&
    'token' in input &&
    typeof input.token === 'string'
      ? input.token.trim()
      : '';
  if (!isAdminToken(token)) {
    return NextResponse.json(
      { ok: false, error: '管理员凭证无效' },
      { status: 401 },
    );
  }

  const session = createAdminSessionValue();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: '服务器尚未配置管理员凭证' },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true, isAdmin: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, session, {
    httpOnly: true,
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, isAdmin: false });
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
