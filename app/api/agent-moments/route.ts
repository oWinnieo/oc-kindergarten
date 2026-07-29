import {
  parseCreateAgentMoment,
} from '@/lib/agent-moment-contract';
import {
  ownerJson,
  ownerMomentErrorResponse,
  protectOwnerMutation,
} from '@/lib/agent-moment-route';
import {
  createAgentMomentDraft,
  listOwnerAgentMoments,
  parseOwnerAgentMomentPageQuery,
} from '@/lib/agent-moments';
import { authenticatedParentUserId } from '@/lib/parent-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) return ownerJson({ ok: false, error: 'Unauthorized' }, 401);
  const parsed = parseOwnerAgentMomentPageQuery(
    new URL(request.url).searchParams,
  );
  if (!parsed.ok) return ownerJson({ ok: false, error: parsed.error }, 400);
  try {
    const page = await listOwnerAgentMoments(
      parentUserId,
      parsed.value.enrollmentId,
      {
        cursor: parsed.value.cursor,
        limit: parsed.value.limit,
      },
    );
    return ownerJson({ ok: true, ...page });
  } catch (error) {
    const response = ownerMomentErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: Request) {
  const parentUserId = await authenticatedParentUserId();
  if (!parentUserId) return ownerJson({ ok: false, error: 'Unauthorized' }, 401);
  const protection = protectOwnerMutation(
    request,
    parentUserId,
    'moment-create',
  );
  if (protection) return protection;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return ownerJson({ ok: false, error: '请求体必须是 JSON' }, 400);
  }
  const parsed = parseCreateAgentMoment(input);
  if (!parsed.ok) return ownerJson({ ok: false, error: parsed.error }, 400);
  try {
    const moment = await createAgentMomentDraft(parentUserId, parsed.value);
    return ownerJson({ ok: true, moment }, 201);
  } catch (error) {
    const response = ownerMomentErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

