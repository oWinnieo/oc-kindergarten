import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  classifyOpenClawTool,
  MonotonicAgentSequenceClock,
  OpenClawAgentAdapter,
} from '../lib/openclaw-agent-adapter';
import {
  parseAgentRuntimeEvent,
  type AgentRuntimeEvent,
} from '../lib/agent-event-contract';
import { agentIncomingMessageNotice } from '../lib/agent-message-presentation';
import {
  resolveAgentStateLiveness,
  TRANSIENT_AGENT_STATE_MAX_AGE_MS,
} from '../lib/agent-state-liveness';
import { sanitizeOpenClawDisplayText } from '../lib/openclaw-message-display';
import { StarOfficeFallbackAdapter } from '../lib/star-office-fallback-adapter';

type Fixture = Record<string, unknown> & { expected: string | string[] };

function eventMarker(event: AgentRuntimeEvent): string {
  if (event.type === 'agent.state') return event.state;
  if (event.type === 'agent.presence') return event.action;
  return `${event.direction}:${event.content}`;
}

const now = () => new Date('2026-07-17T12:30:00.000Z');
const clock = new MonotonicAgentSequenceClock({ now });
const nativeAdapter = new OpenClawAgentAdapter({ clock, now });
const starAdapter = new StarOfficeFallbackAdapter({ clock, now });
const fixturePath = resolve(
  process.cwd(),
  'tools/fixtures/openclaw-agent-events-v1.json',
);
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture[];

let lastSequence = 0;
for (const fixture of fixtures) {
  const { expected, ...input } = fixture;
  const result = nativeAdapter.adapt(input);
  assert.equal(result.ok, true);
  if (!result.ok) continue;
  assert.deepEqual(
    result.events.map(eventMarker),
    Array.isArray(expected) ? expected : [expected],
  );
  for (const event of result.events) {
    assert.ok(event.sequence > lastSequence);
    lastSequence = event.sequence;
  }
}

const duplicate = nativeAdapter.adapt(
  Object.fromEntries(
    Object.entries(fixtures[0]).filter(([key]) => key !== 'expected'),
  ),
);
assert.equal(duplicate.ok, true);
if (duplicate.ok) assert.equal(duplicate.events.length, 0);

const runStartFixture = fixtures.find(
  (fixture) => fixture.hook === 'before_agent_run',
);
assert.ok(runStartFixture);
const semanticDuplicate = nativeAdapter.adapt({
  ...Object.fromEntries(
    Object.entries(runStartFixture).filter(([key]) => key !== 'expected'),
  ),
  bridgeEventId: 'openclaw:fixture:semantic-duplicate',
  observedAt: '2026-07-17T12:00:01.100Z',
});
assert.equal(semanticDuplicate.ok, true);
if (semanticDuplicate.ok) {
  assert.equal(semanticDuplicate.events.length, 0);
  assert.equal(semanticDuplicate.ignored, 'semantic_duplicate_run_start');
}

const reverseArrivalAdapter = new OpenClawAgentAdapter();
const laterRunStart = reverseArrivalAdapter.adapt({
  ...Object.fromEntries(
    Object.entries(runStartFixture).filter(([key]) => key !== 'expected'),
  ),
  bridgeEventId: 'openclaw:fixture:later-arrival-first',
  observedAt: '2026-07-17T12:00:01.200Z',
});
assert.equal(laterRunStart.ok, true);
const earlierRunStart = reverseArrivalAdapter.adapt({
  ...Object.fromEntries(
    Object.entries(runStartFixture).filter(([key]) => key !== 'expected'),
  ),
  bridgeEventId: 'openclaw:fixture:earlier-arrival-second',
  observedAt: '2026-07-17T12:00:01.000Z',
});
assert.equal(earlierRunStart.ok, true);
if (earlierRunStart.ok) {
  assert.equal(earlierRunStart.events.length, 0);
  assert.equal(earlierRunStart.ignored, 'semantic_duplicate_run_start');
}

assert.equal(classifyOpenClawTool('browser.open'), 'researching');
assert.equal(classifyOpenClawTool('apply_patch'), 'writing');
assert.equal(classifyOpenClawTool('git_push'), 'syncing');
assert.equal(classifyOpenClawTool('exec'), 'executing');

const transientState = {
  schemaVersion: 1,
  eventId: 'openclaw:fixture:transient-state',
  type: 'agent.state',
  agentId: 'agent-scout',
  source: 'openclaw',
  observedAt: '2026-07-17T12:00:00.000Z',
  sequence: 100,
  state: 'syncing',
  taskSummary: '开始处理任务',
} as const;
assert.deepEqual(
  resolveAgentStateLiveness(
    transientState,
    Date.parse(transientState.observedAt) + 1000,
  ),
  {
    state: 'syncing',
    expiresInMs: TRANSIENT_AGENT_STATE_MAX_AGE_MS - 1000,
  },
);
assert.deepEqual(
  resolveAgentStateLiveness(
    transientState,
    Date.parse(transientState.observedAt) +
      TRANSIENT_AGENT_STATE_MAX_AGE_MS,
  ),
  { state: 'idle', expiresInMs: 0 },
);
assert.deepEqual(
  resolveAgentStateLiveness(
    { ...transientState, state: 'error' },
    Date.parse(transientState.observedAt) +
      TRANSIENT_AGENT_STATE_MAX_AGE_MS * 2,
  ),
  { state: 'error', expiresInMs: null },
);

assert.equal(
  agentIncomingMessageNotice('Bonnie', 'Bonnie你在干嘛呀'),
  'Bonnie 收到主人的消息“Bonnie你在干嘛呀”',
);
assert.equal(
  agentIncomingMessageNotice('Bonnie', 'Bonnie,在线么', {
    channel: 'telegram',
    conversationType: 'direct',
    senderRole: 'owner',
    senderName: '@owner',
  }),
  'Bonnie 收到主人的消息“Bonnie,在线么”',
);
assert.equal(
  agentIncomingMessageNotice('Bonnie', '@Bonnie,在线么', {
    channel: 'telegram',
    conversationType: 'group',
    senderRole: 'owner',
    senderName: '@owner',
  }),
  'Bonnie 收到群聊里主人的消息“@Bonnie,在线么”',
);
assert.equal(
  agentIncomingMessageNotice('Bonnie', '@Bonnie,在线么', {
    channel: 'telegram',
    conversationType: 'group',
    senderRole: 'participant',
    senderName: '@Alice',
  }),
  'Bonnie 收到群聊里@Alice的消息“@Bonnie,在线么”',
);
assert.equal(
  sanitizeOpenClawDisplayText(
    '[[reply_to_current]] [[audio_as_voice]] 收到了 [[example]]',
  ),
  '收到了 [[example]]',
);
assert.equal(
  sanitizeOpenClawDisplayText('[[reply_to: 12345]]指定消息回复'),
  '指定消息回复',
);
const messageReceived = nativeAdapter.adapt({
  bridgeVersion: 1,
  kind: 'openclaw.hook',
  bridgeEventId: 'openclaw:fixture:message-origin-check',
  hook: 'message_received',
  classroomAgentId: 'agent-scout',
  observedAt: '2026-07-17T12:00:10.000Z',
  data: {
    messageContent: '@Bonnie,在线么',
    messageOrigin: {
      channel: 'telegram',
      conversationType: 'group',
      senderRole: 'participant',
      senderName: '@Alice',
    },
  },
});
assert.equal(messageReceived.ok, true);
if (messageReceived.ok) {
  const incoming = messageReceived.events.find(
    (event) => event.type === 'agent.message',
  );
  assert.equal(incoming?.type, 'agent.message');
  if (incoming?.type === 'agent.message') {
    assert.deepEqual(incoming.origin, {
      channel: 'telegram',
      conversationType: 'group',
      senderRole: 'participant',
      senderName: '@Alice',
    });
  }
}
assert.equal(
  parseAgentRuntimeEvent({
    schemaVersion: 1,
    eventId: 'openclaw:invalid-message',
    type: 'agent.message',
    agentId: 'agent-scout',
    source: 'openclaw',
    observedAt: '2026-07-17T12:00:08.000Z',
    sequence: 99,
    direction: 'sideways',
    content: 'private message',
  }).ok,
  false,
);

const star = starAdapter.adapt(
  {
    state: 'receiving',
    detail: '正在接收消息',
    progress: 50,
    updated_at: '2026-07-17T12:29:59.000Z',
  },
  { classroomAgentId: 'agent-scout', snapshotId: 'fixture-star-1' },
);
assert.equal(star.ok, true);
if (star.ok) {
  assert.equal(star.events[0]?.state, 'syncing');
  assert.ok((star.events[0]?.sequence ?? 0) > lastSequence);
}

const stale = starAdapter.adapt(
  {
    state: 'executing',
    detail: '旧状态',
    updated_at: '2026-07-17T12:00:00.000Z',
  },
  { classroomAgentId: 'agent-bloom', snapshotId: 'fixture-star-stale' },
);
assert.equal(stale.ok, true);
if (stale.ok) assert.equal(stale.events[0]?.state, 'idle');

const invalid = starAdapter.adapt(
  { state: 'unknown-provider-state' },
  { classroomAgentId: 'agent-scout' },
);
assert.equal(invalid.ok, false);

process.stdout.write(
  `OpenClaw adapter regression passed: ${fixtures.length} native fixtures + Star fallback\n`,
);
