import assert from 'node:assert/strict';

import {
  classifyHermesTool,
  HermesAgentAdapter,
} from '../lib/hermes-agent-adapter';
import { parseHermesBridgeV1 } from '../lib/hermes-bridge-v1';
import { sanitizeHermesDisplayText } from '../lib/hermes-message-display';

let sequence = 0;
const adapter = new HermesAgentAdapter({
  clock: { next: () => ++sequence },
});
let eventNumber = 0;

function wire(hook: string, data: Record<string, unknown> = {}) {
  eventNumber += 1;
  return {
    bridgeVersion: 1,
    kind: 'hermes.hook',
    bridgeEventId: `fixture-${eventNumber}`,
    provider: 'hermes',
    runtimeInstanceId: 'runtime-a',
    nativeAgentId: 'default',
    adapterVersion: '0.1.0-beta.1',
    hook,
    observedAt: '2026-08-01T00:00:00.000Z',
    data,
  };
}

assert.equal(classifyHermesTool('web_search'), 'researching');
assert.equal(classifyHermesTool('apply_patch'), 'writing');
assert.equal(classifyHermesTool('send_message'), 'syncing');
assert.equal(classifyHermesTool('terminal'), 'executing');

const mappings = [
  [wire('on_session_start', { isFirstTurn: true }), []],
  [wire('pre_llm_call'), ['writing']],
  [wire('pre_tool_call', { toolName: 'web_search' }), ['researching']],
  [
    wire('post_tool_call', {
      toolName: 'web_search',
      success: true,
      completed: true,
      interrupted: false,
      durationMs: 120,
    }),
    ['writing'],
  ],
  [
    wire('post_tool_call', {
      toolName: 'terminal',
      success: false,
      completed: true,
      interrupted: false,
      failureCode: 'tool_failed',
    }),
    ['error'],
  ],
  [
    wire('post_tool_call', {
      toolName: 'terminal',
      success: false,
      completed: false,
      interrupted: true,
    }),
    ['writing'],
  ],
  [wire('post_llm_call'), ['syncing']],
  [wire('on_session_end', { completed: true, interrupted: false }), ['idle']],
  [wire('on_session_end', { completed: false, interrupted: true }), ['idle']],
  [
    wire('on_session_end', {
      completed: false,
      interrupted: false,
      failureCode: 'turn_failed',
    }),
    ['error'],
  ],
  [wire('on_session_finalize', { reason: 'new_session' }), []],
  [wire('on_session_reset', { reason: 'new_session' }), []],
] as const;

for (const [input, expected] of mappings) {
  const result = adapter.adapt(input, 'agent-hermes-a');
  assert.equal(result.ok, true);
  if (!result.ok) continue;
  assert.deepEqual(
    result.events.map((event) =>
      event.type === 'agent.state' ? event.state : event.type,
    ),
    expected,
  );
}

const messageInput = wire('post_llm_call', {
  messageContent: `  回复\u0000内容  ${'好'.repeat(300)}`,
});
const messageResult = adapter.adapt(messageInput, 'agent-hermes-a');
assert.equal(messageResult.ok, true);
if (messageResult.ok) {
  const message = messageResult.events.find(
    (event) => event.type === 'agent.message',
  );
  assert.equal(message?.type, 'agent.message');
  if (message?.type === 'agent.message') {
    assert.equal(Array.from(message.content).length, 280);
    assert.equal(message.content.includes('\u0000'), false);
  }
}

const duplicate = adapter.adapt(messageInput, 'agent-hermes-a');
assert.equal(duplicate.ok, true);
if (duplicate.ok) {
  assert.deepEqual(duplicate.events, []);
  assert.equal(duplicate.ignored, 'duplicate_bridge_event');
}

assert.equal(
  parseHermesBridgeV1({
    ...wire('pre_tool_call', { toolName: 'terminal' }),
    data: { toolName: 'terminal', args: { secret: 'do-not-upload' } },
  }).ok,
  false,
);
assert.equal(
  parseHermesBridgeV1({
    ...wire('post_tool_call'),
    data: {
      toolName: 'terminal',
      success: false,
      completed: true,
      interrupted: false,
      result: 'private tool output',
    },
  }).ok,
  false,
);
assert.equal(
  parseHermesBridgeV1({
    ...wire('pre_llm_call'),
    userMessage: 'private prompt',
  }).ok,
  false,
);
assert.equal(sanitizeHermesDisplayText('  一行\u0000  两行  '), '一行 两行');

process.stdout.write(
  'Hermes adapter regression passed: strict wire, state mapping, privacy, sanitizing and idempotency\n',
);
