import { NextResponse } from 'next/server';

import {
  getBetaParticipation,
  parseBetaParticipationInput,
} from '@/lib/beta-participation';
import { updateParentOnboarding } from '@/lib/parent-onboarding';
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
  const betaParticipation = await getBetaParticipation(parentUserId);
  return NextResponse.json({ ok: true, parent, betaParticipation });
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
  const recordInput =
    typeof input === 'object' && input !== null
      ? (input as Record<string, unknown>)
      : null;
  const structuredInput = recordInput !== null && 'profile' in recordInput;
  const candidate =
    structuredInput
      ? recordInput.profile
      : input;
  const parsed = parseParentProfilePatch(candidate);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const betaParsed =
    structuredInput && 'betaParticipation' in recordInput
      ? parseBetaParticipationInput(recordInput.betaParticipation)
      : null;
  if (betaParsed && !betaParsed.ok) {
    return NextResponse.json(
      { ok: false, error: betaParsed.error },
      { status: 400 },
    );
  }
  const onboardingResult = betaParsed?.ok
    ? await updateParentOnboarding(
        parentUserId,
        parsed.patch,
        betaParsed.input.migrationEligible,
      )
    : null;
  const parent = onboardingResult?.parent ??
    (betaParsed === null
      ? await updateParentUserProfile(parentUserId, parsed.patch)
      : null);
  if (!parent) {
    return NextResponse.json(
      { ok: false, error: '主人资料不存在，请重新登录' },
      { status: 401 },
    );
  }
  const betaParticipation =
    onboardingResult?.betaParticipation ??
    (await getBetaParticipation(parentUserId));
  return NextResponse.json({ ok: true, parent, betaParticipation });
}
