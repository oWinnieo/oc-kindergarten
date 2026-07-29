import { parsePublishAgentMoment } from '@/lib/agent-moment-contract';
import {
  invalidOwnerMomentId,
  ownerJson,
  ownerMomentErrorResponse,
  protectOwnerMutation,
} from '@/lib/agent-moment-route';
import { publishAgentMoment } from '@/lib/agent-moments';
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
    'moment-publish',
  );
  if (protection) return protection;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return ownerJson({ ok: false, error: '请求体必须是 JSON' }, 400);
  }
  const parsed = parsePublishAgentMoment(input);
  if (!parsed.ok) return ownerJson({ ok: false, error: parsed.error }, 400);
  try {
    const moment = await publishAgentMoment(
      parentUserId,
      context.params.momentId,
      parsed.value.visibility,
    );
    return ownerJson({ ok: true, moment });
  } catch (error) {
    const response = ownerMomentErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

