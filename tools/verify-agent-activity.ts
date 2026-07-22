import assert from 'node:assert/strict';

import {
  mapAgentActivityRecord,
  parseAgentActivityPageQuery,
} from '../lib/agent-activity-contract';

const observedAt = '2026-07-22T09:15:00.000Z';

const entered = mapAgentActivityRecord({
  id: 11,
  eventType: 'agent.presence',
  observedAt,
  payload: {
    schemaVersion: 1,
    eventId: 'activity-enter',
    type: 'agent.presence',
    agentId: 'agent-activity',
    source: 'openclaw',
    observedAt,
    sequence: 1,
    action: 'enter',
    scenePointId: 'entrance-door',
  },
});
assert.deepEqual(entered, {
  cursor: '11',
  kind: 'presence',
  tone: 'positive',
  title: '进入教室',
  detail: '已从教室入口进入',
  observedAt,
});

const command = mapAgentActivityRecord({
  id: 12,
  eventType: 'agent.state',
  observedAt,
  payload: {
    schemaVersion: 1,
    eventId: 'activity-command',
    type: 'agent.state',
    agentId: 'agent-activity',
    source: 'command',
    observedAt,
    sequence: 1,
    state: 'researching',
    taskSummary: '家长指令：阅读',
    metadata: {
      actorType: 'parent',
      requestId: 'private-request-id',
    },
  },
});
assert.equal(command.kind, 'command');
assert.equal(command.title, '已收到“阅读”指令');
assert.equal(command.detail, '准备前往阅读角');
assert.equal(JSON.stringify(command).includes('private-request-id'), false);

const writing = mapAgentActivityRecord({
  id: 13,
  eventType: 'agent.state',
  observedAt,
  payload: {
    schemaVersion: 1,
    eventId: 'activity-writing',
    type: 'agent.state',
    agentId: 'agent-activity',
    source: 'replay',
    observedAt,
    sequence: 2,
    state: 'writing',
    taskSummary: 'private prompt content',
  },
});
assert.equal(writing.kind, 'task');
assert.equal(writing.title, '开始写画活动');
assert.equal(writing.detail, '前往写画桌');
assert.equal(JSON.stringify(writing).includes('private prompt content'), false);

const completed = mapAgentActivityRecord({
  id: 14,
  eventType: 'agent.state',
  observedAt,
  payload: {
    schemaVersion: 1,
    eventId: 'activity-complete',
    type: 'agent.state',
    agentId: 'agent-activity',
    source: 'openclaw',
    observedAt,
    sequence: 3,
    state: 'idle',
    metadata: { hook: 'agent_end', sessionId: 'private-session' },
  },
});
assert.equal(completed.kind, 'completion');
assert.equal(completed.title, '任务已经完成');
assert.equal(JSON.stringify(completed).includes('private-session'), false);

const failed = mapAgentActivityRecord({
  id: 15,
  eventType: 'agent.state',
  observedAt,
  payload: {
    schemaVersion: 1,
    eventId: 'activity-error',
    type: 'agent.state',
    agentId: 'agent-activity',
    source: 'openclaw',
    observedAt,
    sequence: 4,
    state: 'error',
    taskSummary: 'secret tool failure details',
  },
});
assert.equal(failed.kind, 'error');
assert.equal(failed.title, '活动出现异常');
assert.equal(failed.detail, '已前往诊断修理站等待检查');
assert.equal(JSON.stringify(failed).includes('secret tool failure details'), false);

const incomingMessage = mapAgentActivityRecord({
  id: 16,
  eventType: 'agent.message',
  observedAt,
  payload: {
    schemaVersion: 1,
    eventId: 'activity-incoming-message',
    type: 'agent.message',
    agentId: 'agent-activity',
    source: 'openclaw',
    observedAt,
    sequence: 5,
    direction: 'incoming',
    content: 'private owner message',
  },
});
assert.equal(incomingMessage.kind, 'message');
assert.equal(incomingMessage.title, '收到主人消息');
assert.equal(JSON.stringify(incomingMessage).includes('private owner message'), false);

const outgoingMessage = mapAgentActivityRecord({
  id: 17,
  eventType: 'agent.message',
  observedAt,
  payload: {
    schemaVersion: 1,
    eventId: 'activity-outgoing-message',
    type: 'agent.message',
    agentId: 'agent-activity',
    source: 'openclaw',
    observedAt,
    sequence: 6,
    direction: 'outgoing',
    content: 'private agent reply',
  },
});
assert.equal(outgoingMessage.kind, 'message');
assert.equal(outgoingMessage.title, '已经回复主人');
assert.equal(JSON.stringify(outgoingMessage).includes('private agent reply'), false);

const fallback = mapAgentActivityRecord({
  id: 18,
  eventType: 'agent.internal',
  observedAt,
  payload: { secret: 'must-not-leak' },
});
assert.equal(fallback.kind, 'activity');
assert.equal(JSON.stringify(fallback).includes('must-not-leak'), false);

assert.deepEqual(parseAgentActivityPageQuery(new URLSearchParams()), {
  ok: true,
  limit: 20,
});
assert.deepEqual(
  parseAgentActivityPageQuery(new URLSearchParams('cursor=99&limit=5')),
  { ok: true, cursor: 99, limit: 5 },
);
assert.equal(
  parseAgentActivityPageQuery(new URLSearchParams('cursor=0')).ok,
  false,
);
assert.equal(
  parseAgentActivityPageQuery(new URLSearchParams('cursor=private')).ok,
  false,
);
assert.equal(
  parseAgentActivityPageQuery(new URLSearchParams('limit=51')).ok,
  false,
);

process.stdout.write(
  'Agent activity regression passed: safe copy, privacy redaction and cursor validation\n',
);
