import assert from 'node:assert/strict';

import {
  AGENT_MOMENT_SCHEMA_VERSION,
  encodePublicAgentMomentCursor,
  parseAgentShareSettingsPatch,
  parseCreateAgentMoment,
  parsePatchAgentMoment,
  parsePublishAgentMoment,
  parsePublicAgentMomentCursor,
  publicMomentContainsBannedField,
  type PublicAgentMoment,
} from '../lib/agent-moment-contract';
import {
  mapMomentCandidate,
  sanitizeMomentText,
} from '../lib/agent-moment-sanitizer';
import type { AgentRuntimeEvent } from '../lib/agent-event-contract';

const enrollmentId = '11111111-1111-4111-8111-111111111111';
const momentId = '22222222-2222-4222-8222-222222222222';
const observedAt = '2026-07-29T12:00:00.000Z';

assert.deepEqual(
  parseAgentShareSettingsPatch({
    profileVisibility: 'public',
    allowReplyExcerpt: true,
  }),
  {
    ok: true,
    value: {
      profileVisibility: 'public',
      allowReplyExcerpt: true,
    },
  },
);
assert.equal(parseAgentShareSettingsPatch({}).ok, false);
assert.equal(
  parseAgentShareSettingsPatch({ ownerId: enrollmentId }).ok,
  false,
);

assert.equal(
  parseCreateAgentMoment({
    schemaVersion: AGENT_MOMENT_SCHEMA_VERSION,
    enrollmentId,
    activityCursors: [],
    template: 'daily',
  }).ok,
  false,
);
const oneCursor = parseCreateAgentMoment({
  schemaVersion: AGENT_MOMENT_SCHEMA_VERSION,
  enrollmentId,
  activityCursors: ['12'],
  template: 'achievement',
});
assert.equal(oneCursor.ok, true);
const twoCursors = parseCreateAgentMoment({
  schemaVersion: AGENT_MOMENT_SCHEMA_VERSION,
  enrollmentId,
  activityCursors: ['13', '12'],
  template: 'progress',
});
assert.equal(twoCursors.ok, true);
assert.equal(
  parseCreateAgentMoment({
    schemaVersion: AGENT_MOMENT_SCHEMA_VERSION,
    enrollmentId,
    activityCursors: ['11', '12', '13'],
    template: 'daily',
  }).ok,
  false,
);
assert.equal(
  parseCreateAgentMoment({
    schemaVersion: AGENT_MOMENT_SCHEMA_VERSION,
    enrollmentId,
    activityCursors: ['12', '12'],
    template: 'daily',
  }).ok,
  false,
);
assert.equal(
  parseCreateAgentMoment({
    schemaVersion: AGENT_MOMENT_SCHEMA_VERSION,
    enrollmentId,
    activityCursors: ['12'],
    template: 'daily',
    ownerId: enrollmentId,
  }).ok,
  false,
);

assert.deepEqual(parsePatchAgentMoment({ ownerCaption: '' }), {
  ok: true,
  value: { ownerCaption: null },
});
assert.equal(parsePatchAgentMoment({ title: 'x'.repeat(81) }).ok, false);
assert.equal(parsePatchAgentMoment({}).ok, false);
assert.deepEqual(parsePublishAgentMoment({ visibility: 'unlisted' }), {
  ok: true,
  value: { visibility: 'unlisted' },
});
assert.equal(parsePublishAgentMoment({ visibility: 'private' }).ok, false);

function stateEvent(
  state: 'idle' | 'writing' | 'researching' | 'executing' | 'syncing' | 'error',
  extra: Partial<AgentRuntimeEvent> = {},
): AgentRuntimeEvent {
  return {
    schemaVersion: 1,
    eventId: `moment-${state}`,
    type: 'agent.state',
    agentId: 'moment-agent',
    source: 'openclaw',
    observedAt,
    sequence: 1,
    state,
    taskSummary: 'private prompt and tool details',
    ...extra,
  } as AgentRuntimeEvent;
}

for (const state of [
  'idle',
  'writing',
  'researching',
  'executing',
  'syncing',
  'error',
] as const) {
  const candidate = mapMomentCandidate(stateEvent(state));
  assert.equal(candidate.eligible, true);
  assert.equal(
    JSON.stringify(candidate).includes('private prompt and tool details'),
    false,
  );
}

const command = mapMomentCandidate(
  stateEvent('researching', {
    source: 'command',
    metadata: { requestId: 'private-request' },
  }),
);
assert.equal(command.eligible, true);
assert.equal(command.eligible && command.kind, 'command');
assert.equal(JSON.stringify(command).includes('private-request'), false);

const incoming: AgentRuntimeEvent = {
  schemaVersion: 1,
  eventId: 'moment-incoming',
  type: 'agent.message',
  agentId: 'moment-agent',
  source: 'openclaw',
  observedAt,
  sequence: 2,
  direction: 'incoming',
  content: '主人发来的私密消息',
};
assert.deepEqual(mapMomentCandidate(incoming), {
  eligible: false,
  reason: 'incoming_message',
});

const outgoing: AgentRuntimeEvent = {
  ...incoming,
  eventId: 'moment-outgoing',
  direction: 'outgoing',
  content: '今天完成了资料整理',
};
assert.deepEqual(mapMomentCandidate(outgoing), {
  eligible: false,
  reason: 'reply_excerpt_disabled',
});
const outgoingCandidate = mapMomentCandidate(outgoing, {
  allowReplyExcerpt: true,
});
assert.equal(outgoingCandidate.eligible, true);
assert.equal(
  outgoingCandidate.eligible && outgoingCandidate.detail,
  '今天完成了资料整理',
);

const sensitiveFixtures = [
  'Authorization: Bearer sk-example12345678901234567890',
  'cookie: session=private-cookie-value',
  'token ghp_123456789012345678901234567890123456',
  'JWT eyJabcdefgh.abcdefgh123.abcdefgh456',
  '发给 test@example.com',
  '电话 +86 138 0013 8000',
  '服务器 192.168.1.20',
  '文件 /Users/demo/private/config.json',
  String.raw`文件 C:\Users\demo\secret.txt`,
  '链接 https://example.com/callback?token=private-value&ok=1',
  '群名：私密工作群',
  `隐藏字符\u200B测试`,
  '随机值 Abcdefghijklmnopqrstuvwxyz1234567890',
];
for (const fixture of sensitiveFixtures) {
  const sanitized = sanitizeMomentText(fixture);
  assert.equal(sanitized.status, 'redacted', fixture);
  assert.equal(
    sanitized.text.includes('[已隐藏]'),
    true,
    fixture,
  );
}

assert.deepEqual(
  sanitizeMomentText(
    '-----BEGIN OPENSSH PRIVATE KEY-----\nprivate\n-----END OPENSSH PRIVATE KEY-----',
  ),
  { status: 'rejected', reason: 'private_key' },
);
assert.deepEqual(sanitizeMomentText('{"prompt":"private"}'), {
  status: 'rejected',
  reason: 'structured_payload',
});
assert.deepEqual(
  sanitizeMomentText('联系 test@example.com', { mode: 'owner' }),
  { status: 'rejected', reason: 'sensitive_owner_text' },
);
const truncated = sanitizeMomentText('字'.repeat(300));
assert.equal(truncated.status, 'redacted');
assert.equal(
  Array.from(truncated.text).length,
  280,
);

const publicMoment: PublicAgentMoment = {
  schemaVersion: 1,
  shareSlug: 'A'.repeat(32),
  agent: {
    displayName: '小助手',
    characterVariant: 'genderless',
    appearancePreset: 'classic',
  },
  title: '今天完成了一件事',
  template: 'achievement',
  visibility: 'unlisted',
  publishedAt: observedAt,
  items: [
    {
      position: 1,
      kind: 'completion',
      title: '完成了一次活动',
      detail: '已经回到自由活动',
      occurredAt: observedAt,
    },
  ],
};
assert.equal(publicMomentContainsBannedField(publicMoment), false);
assert.equal(
  publicMomentContainsBannedField({
    ...publicMoment,
    payload: { prompt: 'private' },
  }),
  true,
);
assert.equal(
  publicMomentContainsBannedField({
    ...publicMoment,
    nested: { owner_id: enrollmentId },
  }),
  true,
);

const encodedCursor = encodePublicAgentMomentCursor({
  publishedAt: observedAt,
  id: momentId,
});
assert.deepEqual(parsePublicAgentMomentCursor(encodedCursor), {
  ok: true,
  value: { publishedAt: observedAt, id: momentId },
});
assert.equal(parsePublicAgentMomentCursor('not-a-cursor').ok, false);

process.stdout.write(
  'Agent moments regression passed: contracts, candidates, sanitizer, public DTO and cursor\n',
);
