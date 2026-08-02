const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const AGENT_ID_MAX_LENGTH = 128;

export function parseWelcomeAgentId(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    typeof candidate !== 'string' ||
    candidate.length === 0 ||
    candidate.length > AGENT_ID_MAX_LENGTH ||
    !AGENT_ID_PATTERN.test(candidate)
  ) {
    return undefined;
  }
  return candidate;
}

export function welcomeAgentHref(agentId: string): string {
  const parsed = parseWelcomeAgentId(agentId);
  if (!parsed) return '/';
  return `/?welcomeAgent=${encodeURIComponent(parsed)}`;
}
