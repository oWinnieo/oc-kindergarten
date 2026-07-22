import assert from 'node:assert/strict';

import { parseProviderAgentDiscovery } from '../lib/provider-binding-contract';
import { parseOpenClawBridgeV2 } from '../lib/openclaw-bridge-v2';

const parsed = parseProviderAgentDiscovery({
  schemaVersion: 1,
  provider: 'openclaw',
  nativeAgentId: 'main',
  runtimeInstanceId: 'gateway-1',
  adapterVersion: '2.0.0',
  profileDraft: {
    displayName: '小探',
    role: 'Research agent',
    capabilities: ['research', 'research'],
    characterVariant: 'boy',
    appearancePreset: 'berry',
    color: '#1677B8',
  },
});
assert.equal(parsed.ok, true);
if (parsed.ok) {
  assert.deepEqual(parsed.discovery.profileDraft?.capabilities, ['research']);
  assert.equal(parsed.discovery.profileDraft?.color, '#1677b8');
  assert.equal(parsed.discovery.profileDraft?.appearancePreset, 'berry');
}

assert.equal(
  parseProviderAgentDiscovery({
    schemaVersion: 1,
    provider: 'openclaw',
    nativeAgentId: 'main',
    profileDraft: { appearancePreset: 'unreviewed' },
  }).ok,
  false,
);

assert.equal(
  parseProviderAgentDiscovery({
    schemaVersion: 1,
    provider: 'openclaw',
    nativeAgentId: 'main',
    profileDraft: { prompt: 'must not be stored' },
  }).ok,
  false,
);

const bridge = parseOpenClawBridgeV2({
  bridgeVersion: 2,
  kind: 'openclaw.hook',
  bridgeEventId: 'openclaw:v2:fixture:1',
  provider: 'openclaw',
  nativeAgentId: 'main',
  runtimeInstanceId: 'gateway-1',
  adapterVersion: '2.0.0',
  hook: 'before_agent_run',
  observedAt: '2026-07-18T12:00:00.000Z',
  data: {},
});
assert.equal(bridge.ok, true);
if (bridge.ok) {
  const bound = bridge.bridge.bind('agent-scout');
  assert.equal(bound.bridgeVersion, 1);
  assert.equal(bound.classroomAgentId, 'agent-scout');
  assert.equal(bound.nativeAgentId, 'main');
  assert.equal(bound.runtimeInstanceId, 'gateway-1');
}
assert.equal(
  parseProviderAgentDiscovery({
    schemaVersion: 1,
    provider: 'unknown',
    nativeAgentId: 'main',
  }).ok,
  false,
);
assert.equal(
  parseProviderAgentDiscovery({
    schemaVersion: 1,
    provider: 'openclaw',
    nativeAgentId: '',
  }).ok,
  false,
);

process.stdout.write(
  'Provider binding contract regression passed: discovery normalization and privacy rejection\n',
);
