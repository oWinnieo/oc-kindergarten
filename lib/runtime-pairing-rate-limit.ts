const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const MAX_TRACKED_CLIENTS = 10_000;

type AttemptWindow = {
  count: number;
  startedAt: number;
};

const attemptsByClient = new Map<string, AttemptWindow>();

export type RuntimePairingRateLimit = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function runtimePairingClientKey(request: Request): string {
  const realIp = request.headers.get('x-real-ip')?.trim();
  const forwardedFor = request.headers.get('x-forwarded-for');
  const firstForwardedAddress = forwardedFor?.split(',')[0]?.trim();
  return (
    realIp ||
    firstForwardedAddress ||
    'unknown-client'
  );
}

export function checkRuntimePairingRateLimit(
  clientKey: string,
  now = Date.now(),
): RuntimePairingRateLimit {
  const existing = attemptsByClient.get(clientKey);
  if (!existing || now - existing.startedAt >= WINDOW_MS) {
    if (attemptsByClient.size >= MAX_TRACKED_CLIENTS) {
      attemptsByClient.forEach((window, key) => {
        if (now - window.startedAt >= WINDOW_MS) attemptsByClient.delete(key);
      });
      if (attemptsByClient.size >= MAX_TRACKED_CLIENTS) {
        attemptsByClient.delete(attemptsByClient.keys().next().value ?? '');
      }
    }
    attemptsByClient.set(clientKey, { count: 1, startedAt: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  existing.count += 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((WINDOW_MS - (now - existing.startedAt)) / 1000),
  );
  return {
    allowed: existing.count <= MAX_ATTEMPTS,
    retryAfterSeconds,
  };
}

export function resetRuntimePairingRateLimitsForTests(): void {
  attemptsByClient.clear();
}
