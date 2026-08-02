import assert from 'node:assert/strict';

import {
  parseProviderAgentDiscovery,
  runtimeIdentityKey,
  sameRuntimeIdentity,
} from '../lib/provider-binding-contract';
import { parseOpenClawBridgeV2 } from '../lib/openclaw-bridge-v2';
import {
  AGENT_PROVIDER_CATALOG,
  buildPluginInstallCommand,
  buildRuntimePairingCommand,
  HERMES_PLUGIN_COMMIT,
  HERMES_PLUGIN_VERSION,
} from '../lib/agent-provider-catalog';

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
    runtimeInstanceId: 'gateway-1',
    profileDraft: { appearancePreset: 'unreviewed' },
  }).ok,
  false,
);

assert.equal(
  parseProviderAgentDiscovery({
    schemaVersion: 1,
    provider: 'openclaw',
    nativeAgentId: 'main',
    runtimeInstanceId: 'gateway-1',
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
    runtimeInstanceId: 'gateway-1',
  }).ok,
  false,
);
assert.equal(
  parseProviderAgentDiscovery({
    schemaVersion: 1,
    provider: 'openclaw',
    nativeAgentId: '',
    runtimeInstanceId: 'gateway-1',
  }).ok,
  false,
);
assert.equal(
  parseProviderAgentDiscovery({
    schemaVersion: 1,
    provider: 'hermes',
    nativeAgentId: 'default',
  }).ok,
  false,
);
const hermesA = {
  provider: 'hermes' as const,
  runtimeInstanceId: 'runtime-a',
  nativeAgentId: 'default',
};
const hermesB = { ...hermesA, runtimeInstanceId: 'runtime-b' };
assert.equal(sameRuntimeIdentity(hermesA, hermesB), false);
assert.notEqual(runtimeIdentityKey(hermesA), runtimeIdentityKey(hermesB));

const hermesInstall = AGENT_PROVIDER_CATALOG.hermes.installCommand;
assert.equal(hermesInstall.includes(`--branch ${HERMES_PLUGIN_VERSION}`), true);
assert.equal(hermesInstall.includes(HERMES_PLUGIN_COMMIT), true);
assert.equal(hermesInstall.includes('hermes plugins install'), false);
const hermesDockerInstall = buildPluginInstallCommand({
  provider: 'hermes',
  deployment: 'docker',
});
assert.equal(hermesDockerInstall.includes('-e HERMES_HOME=/opt/data'), true);
assert.equal(hermesDockerInstall.includes('docker compose restart gateway'), true);
const openClawDockerInstall = buildPluginInstallCommand({
  provider: 'openclaw',
  deployment: 'docker',
});
assert.equal(openClawDockerInstall.includes('openclaw-cli plugins install'), true);
assert.equal(
  openClawDockerInstall.includes('docker compose restart openclaw-gateway'),
  true,
);
assert.equal(
  buildRuntimePairingCommand({
    provider: 'hermes',
    pairingCode: 'ABCDE-F0123-45678-9ABCD',
    endpoint: 'https://kindergarten.example',
  }).includes('--share-replies'),
  false,
);
assert.equal(
  buildRuntimePairingCommand({
    provider: 'hermes',
    pairingCode: 'ABCDE-F0123-45678-9ABCD',
    endpoint: 'https://kindergarten.example',
    shareReplies: true,
  }).includes('--share-replies'),
  true,
);
assert.equal(
  buildRuntimePairingCommand({
    provider: 'hermes',
    deployment: 'docker',
    pairingCode: 'ABCDE-F0123-45678-9ABCD',
    endpoint: 'https://kindergarten.example',
  }).includes('docker compose exec --user hermes'),
  true,
);
assert.equal(
  buildRuntimePairingCommand({
    provider: 'openclaw',
    deployment: 'docker',
    pairingCode: 'ABCDE-F0123-45678-9ABCD',
    endpoint: 'https://kindergarten.example',
    nativeAgentId: 'main',
  }).includes('docker compose run --rm openclaw-cli kindergarten pair'),
  true,
);

process.stdout.write(
  'Provider binding contract regression passed: discovery normalization and privacy rejection\n',
);
