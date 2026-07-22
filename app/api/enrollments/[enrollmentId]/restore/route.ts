import { handleAgentEnrollmentLifecycle } from '@/lib/agent-enrollment-route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: { enrollmentId: string } },
) {
  return handleAgentEnrollmentLifecycle(context.params.enrollmentId, 'restore');
}
