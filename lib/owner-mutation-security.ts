const WINDOW_MILLISECONDS = 60_000;
const MAXIMUM_MUTATIONS_PER_WINDOW = 40;

interface MutationWindow {
  count: number;
  resetAt: number;
}

const globalForOwnerMutationSecurity = globalThis as typeof globalThis & {
  __ocKindergartenOwnerMutationWindows?: Map<string, MutationWindow>;
};

const windows =
  globalForOwnerMutationSecurity.__ocKindergartenOwnerMutationWindows ??
  new Map<string, MutationWindow>();
globalForOwnerMutationSecurity.__ocKindergartenOwnerMutationWindows = windows;

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const requestUrl = new URL(request.url);
    const forwardedHost =
      request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    const forwardedProtocol =
      request.headers.get('x-forwarded-proto') ??
      requestUrl.protocol.replace(/:$/, '');
    const acceptedOrigins = new Set([requestUrl.origin]);
    if (forwardedHost && /^(?:http|https)$/i.test(forwardedProtocol)) {
      acceptedOrigins.add(
        `${forwardedProtocol.toLowerCase()}://${forwardedHost}`,
      );
    }
    return acceptedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function consumesOwnerMutationAllowance(
  parentUserId: string,
  action: string,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const key = `${parentUserId}:${action}`;
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, {
      count: 1,
      resetAt: now + WINDOW_MILLISECONDS,
    });
    return { allowed: true };
  }
  if (current.count >= MAXIMUM_MUTATIONS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  if (windows.size > 2_000) {
    windows.forEach((candidate, candidateKey) => {
      if (candidate.resetAt <= now) windows.delete(candidateKey);
    });
  }
  return { allowed: true };
}
