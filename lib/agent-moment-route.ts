import { NextResponse } from 'next/server';

import {
  AgentMomentError,
  agentMomentErrorStatus,
} from './agent-moments';
import {
  consumesOwnerMutationAllowance,
  hasSameOrigin,
} from './owner-mutation-security';

export const OWNER_NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
} as const;

export function ownerJson(
  body: Record<string, unknown>,
  status = 200,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: OWNER_NO_STORE_HEADERS,
  });
}

export function invalidOwnerMomentId(momentId: string): boolean {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    momentId,
  );
}

export function ownerMomentErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AgentMomentError)) return null;
  return ownerJson(
    { ok: false, error: error.message, code: error.code },
    agentMomentErrorStatus(error),
  );
}

export function protectOwnerMutation(
  request: Request,
  parentUserId: string,
  action: string,
): NextResponse | null {
  if (!hasSameOrigin(request)) {
    return ownerJson(
      { ok: false, error: '请求来源无效', code: 'invalid_origin' },
      403,
    );
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return ownerJson(
      { ok: false, error: '请求体必须使用 application/json' },
      415,
    );
  }
  const allowance = consumesOwnerMutationAllowance(parentUserId, action);
  if (!allowance.allowed) {
    return NextResponse.json(
      { ok: false, error: '操作过于频繁，请稍后重试', code: 'rate_limited' },
      {
        status: 429,
        headers: {
          ...OWNER_NO_STORE_HEADERS,
          'Retry-After': String(allowance.retryAfterSeconds),
        },
      },
    );
  }
  return null;
}

