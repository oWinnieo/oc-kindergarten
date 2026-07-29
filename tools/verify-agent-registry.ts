import assert from 'node:assert/strict';

import {
  AGENT_REGISTRY_SCHEMA_VERSION,
  parseAgentProfile,
  parseAgentProfileInput,
} from '../lib/agent-registry-contract';
import { AgentRegistry } from '../lib/agent-registry';
import {
  parseWelcomeAgentId,
  welcomeAgentHref,
} from '../lib/classroom-welcome';
import {
  agentRuntimeStateNotice,
  isComplexTaskStateSet,
} from '../lib/agent-runtime-notice';
import {
  ActivityRegionFullError,
  AGENT_TASK_STATES,
  type AgentTaskState,
  activityRegionTargets,
  selectActivityTarget,
} from '../lib/classroom-runtime';

const ownerProfile = {
  schemaVersion: AGENT_REGISTRY_SCHEMA_VERSION,
  agentId: 'owner-42:reader',
  displayName: '小阅',
  characterVariant: 'girl' as const,
  appearancePreset: 'meadow' as const,
  registeredBy: 'owner' as const,
  ownerId: 'owner-42',
  role: 'Reading agent',
  color: '#7B61C9',
};

const parsedOwner = parseAgentProfileInput(ownerProfile);
assert.equal(parsedOwner.ok, true);
if (!parsedOwner.ok) process.exit(1);
assert.equal(parsedOwner.profile.color, '#7b61c9');
assert.equal(parsedOwner.profile.appearancePreset, 'meadow');

const berryAppearance = parseAgentProfileInput({
  ...ownerProfile,
  appearancePreset: 'berry',
});
assert.equal(berryAppearance.ok, true);
if (berryAppearance.ok) {
  assert.equal(berryAppearance.profile.appearancePreset, 'berry');
}

const legacyAppearance = parseAgentProfileInput({
  ...ownerProfile,
  appearancePreset: undefined,
});
assert.equal(legacyAppearance.ok, true);
if (legacyAppearance.ok) {
  assert.equal(legacyAppearance.profile.appearancePreset, 'classic');
}

assert.equal(
  parseAgentProfileInput({ ...ownerProfile, ownerId: undefined }).ok,
  false,
);
assert.equal(
  parseAgentProfileInput({ ...ownerProfile, characterVariant: 'robot' }).ok,
  false,
);
assert.equal(
  parseAgentProfileInput({ ...ownerProfile, appearancePreset: 'neon' }).ok,
  false,
);
assert.equal(
  parseAgentProfileInput({ ...ownerProfile, agentId: 'bad id' }).ok,
  false,
);
assert.equal(
  parseAgentProfileInput({ ...ownerProfile, color: 'red' }).ok,
  false,
);

const registry = new AgentRegistry([]);
const changes: string[] = [];
registry.subscribe((change) => changes.push(change.type));
const first = registry.upsert(
  parsedOwner.profile,
  new Date('2026-07-18T01:00:00.000Z'),
);
assert.equal(first.revision, 1);
assert.equal(registry.has(first.agentId), true);
assert.equal(parseAgentProfile(first).ok, true);
const second = registry.upsert(
  { ...parsedOwner.profile, displayName: '小阅二号' },
  new Date('2026-07-18T01:01:00.000Z'),
);
assert.equal(second.revision, 2);
assert.equal(registry.get(second.agentId)?.displayName, '小阅二号');
assert.equal(registry.remove(second.agentId), true);
assert.equal(registry.has(second.agentId), false);
assert.deepEqual(changes, [
  'agent.profile.upserted',
  'agent.profile.upserted',
  'agent.profile.removed',
]);

assert.equal(parseWelcomeAgentId('agent-new:main'), 'agent-new:main');
assert.equal(parseWelcomeAgentId(['agent-new:main']), 'agent-new:main');
assert.equal(parseWelcomeAgentId('bad agent'), undefined);
assert.equal(welcomeAgentHref('agent-new:main'), '/?welcomeAgent=agent-new%3Amain');
assert.equal(
  isComplexTaskStateSet(
    new Set<AgentTaskState>(['syncing', 'executing']),
  ),
  true,
);
assert.equal(
  agentRuntimeStateNotice(
    '小忙',
    'syncing',
    new Set<AgentTaskState>(['syncing', 'executing']),
  ),
  '小忙 正在处理复杂任务，期间可能在不同活动区之间移动。',
);
assert.equal(
  agentRuntimeStateNotice('小忙', 'idle', new Set<AgentTaskState>()),
  '小忙 已完成任务，正在自由活动。',
);

const expectedCapacities = {
  idle: 88,
  writing: 12,
  researching: 48,
  executing: 20,
  syncing: 20,
  error: 20,
} as const;

for (const state of AGENT_TASK_STATES) {
  const candidates = activityRegionTargets(state);
  assert.equal(candidates.length, expectedCapacities[state]);
  const occupied = [] as { x: number; y: number }[];
  for (let index = 0; index < candidates.length; index += 1) {
    const target = selectActivityTarget(state, occupied, () => 0);
    assert.equal(
      occupied.some(
        (point) => point.x === target.point.x && point.y === target.point.y,
      ),
      false,
    );
    occupied.push(target.point);
  }
  assert.throws(
    () => selectActivityTarget(state, occupied, () => 0),
    ActivityRegionFullError,
  );
}

process.stdout.write(
  'Agent Registry regression passed: profile validation, lifecycle, capacities and standing allocation\n',
);
