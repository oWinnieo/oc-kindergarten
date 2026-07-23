import { NextResponse } from 'next/server';

import { parseParentProfilePatch } from '@/lib/parent-profile-contract';
import { authenticatedParentUserId } from '@/lib/parent-session';
import {
  getParentUserById,
  updateParentUserProfile,
} from '@/lib/parent-users';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const parent = await getParentUserById(parentUserId);
  if (!parent) {
    return NextResponse.json(
      { ok: false, error: '主人资料不存在，请重新登录' },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true, parent });
}

export async function PATCH(request: Request) {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: '请求体必须是 JSON' },
      { status: 400 },
    );
  }
  const candidate =
    typeof input === 'object' && input !== null && 'profile' in input
      ? (input as { profile: unknown }).profile
      : input;
  const parsed = parseParentProfilePatch(candidate);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const parent = await updateParentUserProfile(parentUserId, parsed.patch);
  if (!parent) {
    return NextResponse.json(
      { ok: false, error: '主人资料不存在，请重新登录' },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true, parent });
}
