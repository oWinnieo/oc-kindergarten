import { timingSafeEqual } from 'node:crypto';

function equalToken(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function authorizeAgentEventRequest(request: Request): boolean {
  const expected = process.env.OC_KINDERGARTEN_AGENT_EVENT_TOKEN?.trim();
  if (!expected) return true;
  const authorization = request.headers.get('authorization') ?? '';
  const actual = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  return actual.length > 0 && equalToken(actual, expected);
}
