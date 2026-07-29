import { parseAgentShareSettingsPatch } from '@/lib/agent-moment-contract';
import {
  ownerJson,
  ownerMomentErrorResponse,
  protectOwnerMutation,
} from '@/lib/agent-moment-route';
import {
  getAgentShareSettings,
  updateAgentShareSettings,
} from '@/lib/agent-moments';
import { authenticatedParentUserId } from '@/lib/parent-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: { enrollmentId: string } },
) {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) return ownerJson({ ok: false, error: 'Unauthorized' }, 401);
  try {
    const settings = await getAgentShareSettings(
      parentUserId,
      context.params.enrollmentId,
    );
    return ownerJson({ ok: true, settings });
  } catch (error) {
    const response = ownerMomentErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(
  request: Request,
  context: { params: { enrollmentId: string } },
) {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) return ownerJson({ ok: false, error: 'Unauthorized' }, 401);
  const protection = protectOwnerMutation(
    request,
    parentUserId,
    'share-settings',
  );
  if (protection) return protection;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return ownerJson({ ok: false, error: '请求体必须是 JSON' }, 400);
  }
  const parsed = parseAgentShareSettingsPatch(input);
  if (!parsed.ok) return ownerJson({ ok: false, error: parsed.error }, 400);
  try {
    const settings = await updateAgentShareSettings(
      parentUserId,
      context.params.enrollmentId,
      parsed.value,
    );
    return ownerJson({ ok: true, settings });
  } catch (error) {
    const response = ownerMomentErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

