import {
  invalidOwnerMomentId,
  ownerJson,
  ownerMomentErrorResponse,
  protectOwnerMutation,
} from '@/lib/agent-moment-route';
import { revokeAgentMoment } from '@/lib/agent-moments';
import { authenticatedParentUserId } from '@/lib/parent-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: { momentId: string } },
) {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) return ownerJson({ ok: false, error: 'Unauthorized' }, 401);
  if (invalidOwnerMomentId(context.params.momentId)) {
    return ownerJson({ ok: false, error: '成长瞬间不存在' }, 404);
  }
  const protection = protectOwnerMutation(
    request,
    parentUserId,
    'moment-revoke',
  );
  if (protection) return protection;
  try {
    const moment = await revokeAgentMoment(
      parentUserId,
      context.params.momentId,
    );
    return ownerJson({ ok: true, moment });
  } catch (error) {
    const response = ownerMomentErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

