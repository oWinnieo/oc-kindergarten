import {
  generatePairingCode,
  hashPairingCode,
  normalizePairingCode,
  parseAgentActivation,
  parseRuntimeEnrollmentPairing,
} from '../lib/agent-enrollment-contract';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const code = generatePairingCode();
assert(/^[0-9A-F]{5}(?:-[0-9A-F]{5}){3}$/.test(code), '配对码格式错误');
const normalized = normalizePairingCode(code.toLowerCase());
assert(normalized?.length === 20, '配对码规范化失败');
assert(
  hashPairingCode(code) === hashPairingCode(normalized),
  '格式变化后配对码 hash 不一致',
);
assert(normalizePairingCode('1234') === null, '过短配对码不应通过');

const pairing = parseRuntimeEnrollmentPairing({
  schemaVersion: 1,
  pairingCode: code,
  discovery: {
    schemaVersion: 1,
    provider: 'openclaw',
    nativeAgentId: 'main',
    runtimeInstanceId: 'runtime-test',
    adapterVersion: '0.3.0',
    profileDraft: {
      displayName: '小助手',
      role: 'Research helper',
      capabilities: ['research', 'writing', 'research'],
      characterVariant: 'genderless',
      color: '#6576D8',
    },
  },
});
assert(pairing.ok, '合法 runtime pairing 应通过');
assert(
  pairing.pairing.discovery.profileDraft?.capabilities?.length === 2,
  '能力标签应去重',
);
assert(
  pairing.pairing.discovery.profileDraft?.color === '#6576d8',
  '颜色应规范化',
);

const sensitiveDraft = parseRuntimeEnrollmentPairing({
  schemaVersion: 1,
  pairingCode: code,
  discovery: {
    schemaVersion: 1,
    provider: 'openclaw',
    nativeAgentId: 'main',
    profileDraft: { prompt: 'secret instructions' },
  },
});
assert(!sensitiveDraft.ok, '敏感／未知草稿字段必须拒绝');

const missingVariant = parseAgentActivation({ displayName: '小助手' });
assert(!missingVariant.ok, '家长未选择外观时不能激活');
const activation = parseAgentActivation({
  displayName: ' 小助手 ',
  characterVariant: 'boy',
  role: 'Helper',
  personalitySummary: 'Calm and careful',
  capabilities: ['research'],
  color: '#1677B8',
});
assert(activation.ok, '合法家长确认资料应通过');
assert(activation.activation.displayName === '小助手', '名称应去除首尾空格');
assert(activation.activation.color === '#1677b8', '确认颜色应规范化');

console.log(
  'Agent enrollment contract regression passed: one-time code, privacy, draft and activation validation',
);
