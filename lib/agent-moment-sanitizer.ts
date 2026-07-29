import type { AgentRuntimeEvent } from './agent-event-contract';
import type { AgentMomentKind } from './agent-moment-contract';
import { MAX_AGENT_MOMENT_TEXT_LENGTH } from './agent-moment-contract';
import { STATE_CONFIG, type AgentTaskState } from './classroom-runtime';

export type MomentSanitizerMode = 'snapshot' | 'owner';
export type MomentSanitizerReason =
  | 'empty'
  | 'structured_payload'
  | 'private_key'
  | 'sensitive_owner_text';

export type MomentSanitizerResult =
  | { status: 'accepted'; text: string }
  | { status: 'redacted'; text: string; redactions: string[] }
  | { status: 'rejected'; reason: MomentSanitizerReason };

export type MomentCandidateBlockedReason =
  | 'incoming_message'
  | 'reply_excerpt_disabled'
  | 'presence_not_shareable'
  | 'unsafe_reply';

export type MomentCandidateResult =
  | {
      eligible: true;
      kind: AgentMomentKind;
      title: string;
      detail: string;
      occurredAt: string;
      redacted: boolean;
    }
  | { eligible: false; reason: MomentCandidateBlockedReason };

const STATE_TITLES: Record<AgentTaskState, string> = {
  idle: '完成了一次活动',
  writing: '认真进行写画活动',
  researching: '去阅读角查找资料',
  executing: '在积木区认真完成任务',
  syncing: '正在交流和同步结果',
  error: '遇到困难，正在检查',
};

const COMMAND_TITLES: Record<AgentTaskState, string> = {
  idle: '收到休息指令',
  writing: '收到写画指令',
  researching: '收到阅读指令',
  executing: '收到手工指令',
  syncing: '收到交流指令',
  error: '收到检查指令',
};

interface SensitivePattern {
  name: string;
  pattern: RegExp;
}

const SENSITIVE_PATTERNS: SensitivePattern[] = [
  {
    name: 'authorization',
    pattern: /\b(?:authorization|cookie|set-cookie)\s*:\s*[^\s,;]+/gi,
  },
  {
    name: 'known_token',
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|xox[baprs]-[A-Za-z0-9-]{12,}|ockg_rt_[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|\d{8,12}:[A-Za-z0-9_-]{30,})\b/g,
  },
  {
    name: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  },
  {
    name: 'url_secret',
    pattern:
      /([?&](?:token|access[_-]?token|code|key|api[_-]?key|secret|password|credential|auth|signature)=)[^&#\s]+/gi,
  },
  {
    name: 'email',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    name: 'phone',
    pattern: /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g,
  },
  {
    name: 'ipv4',
    pattern:
      /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g,
  },
  {
    name: 'ipv6',
    pattern: /\b(?:[A-F0-9]{1,4}:){2,7}[A-F0-9]{0,4}\b/gi,
  },
  {
    name: 'unix_path',
    pattern: /(?:\/Users|\/home)\/[^\s"'`]+/g,
  },
  {
    name: 'windows_path',
    pattern: /\b[A-Z]:\\[^\s"'`]+|\\\\[A-Za-z0-9_.-]+\\[^\s"'`]+/gi,
  },
  {
    name: 'contact_origin',
    pattern:
      /\b(?:senderName|sender|groupName|conversationName)\s*[:=]\s*[^\s,;]+|(?:群名|联系人)\s*[:：]\s*\S+/gi,
  },
  {
    name: 'high_entropy',
    pattern:
      /\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]+\b/g,
  },
];

const INVISIBLE_CONTROL_PATTERN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

function looksLikeStructuredPayload(text: string): boolean {
  if (/```/.test(text)) return true;
  const trimmed = text.trim();
  if (
    !(
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    )
  ) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function replaceSensitive(
  text: string,
): { text: string; redactions: string[] } {
  const redactions = new Set<string>();
  let sanitized = text.replace(INVISIBLE_CONTROL_PATTERN, () => {
    redactions.add('invisible_control');
    return '[已隐藏]';
  });
  for (const { name, pattern } of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, (match, prefix?: string) => {
      redactions.add(name);
      return name === 'url_secret' && typeof prefix === 'string'
        ? `${prefix}[已隐藏]`
        : '[已隐藏]';
    });
  }
  return { text: sanitized, redactions: Array.from(redactions) };
}

export function sanitizeMomentText(
  value: unknown,
  options: {
    mode?: MomentSanitizerMode;
    maximum?: number;
  } = {},
): MomentSanitizerResult {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { status: 'rejected', reason: 'empty' };
  }
  const text = value.trim();
  if (/-----BEGIN (?:OPENSSH|RSA|EC|DSA) PRIVATE KEY-----/.test(text)) {
    return { status: 'rejected', reason: 'private_key' };
  }
  if (looksLikeStructuredPayload(text)) {
    return { status: 'rejected', reason: 'structured_payload' };
  }
  const sanitized = replaceSensitive(text);
  if (
    options.mode === 'owner' &&
    sanitized.redactions.length > 0
  ) {
    return { status: 'rejected', reason: 'sensitive_owner_text' };
  }
  const maximum = options.maximum ?? MAX_AGENT_MOMENT_TEXT_LENGTH;
  const characters = Array.from(sanitized.text);
  const truncated =
    characters.length > maximum
      ? `${characters.slice(0, Math.max(1, maximum - 1)).join('')}…`
      : sanitized.text;
  const redactions =
    characters.length > maximum
      ? [...sanitized.redactions, 'length']
      : sanitized.redactions;
  if (truncated.trim().length === 0) {
    return { status: 'rejected', reason: 'empty' };
  }
  return redactions.length === 0
    ? { status: 'accepted', text: truncated }
    : {
        status: 'redacted',
        text: truncated,
        redactions: Array.from(new Set(redactions)),
      };
}

function stateCandidate(
  event: Extract<AgentRuntimeEvent, { type: 'agent.state' }>,
): MomentCandidateResult {
  const isCommand = event.source === 'command';
  const kind: AgentMomentKind = isCommand
    ? 'command'
    : event.state === 'idle'
      ? 'completion'
      : event.state === 'error'
        ? 'error'
        : 'task';
  return {
    eligible: true,
    kind,
    title: isCommand ? COMMAND_TITLES[event.state] : STATE_TITLES[event.state],
    detail:
      event.state === 'error'
        ? '没有公开错误详情，等待主人检查后继续'
        : event.state === 'idle'
          ? '已经回到自由活动'
          : `在${STATE_CONFIG[event.state].location}活动`,
    occurredAt: event.observedAt,
    redacted: false,
  };
}

export function mapMomentCandidate(
  event: AgentRuntimeEvent,
  options: { allowReplyExcerpt?: boolean } = {},
): MomentCandidateResult {
  if (event.type === 'agent.state') return stateCandidate(event);
  if (event.type === 'agent.presence') {
    return { eligible: false, reason: 'presence_not_shareable' };
  }
  if (event.direction === 'incoming') {
    return { eligible: false, reason: 'incoming_message' };
  }
  if (!options.allowReplyExcerpt) {
    return { eligible: false, reason: 'reply_excerpt_disabled' };
  }
  const sanitized = sanitizeMomentText(event.content);
  if (sanitized.status === 'rejected') {
    return { eligible: false, reason: 'unsafe_reply' };
  }
  return {
    eligible: true,
    kind: 'reply',
    title: '分享了一句回复',
    detail: sanitized.text,
    occurredAt: event.observedAt,
    redacted: sanitized.status === 'redacted',
  };
}
