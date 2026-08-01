import assert from 'node:assert/strict';

import {
  generateRuntimeCredential,
  hashRuntimeCredentialToken,
  normalizeRuntimeCredentialToken,
} from '../lib/runtime-credential-contract';
import { runtimeCredentialScopeMatches } from '../lib/agent-event-auth';

const first = generateRuntimeCredential();
const second = generateRuntimeCredential();

assert.match(first.token, /^ockg_rt_[A-Za-z0-9_-]{43}$/);
assert.notEqual(first.token, second.token);
assert.notEqual(first.tokenHash, second.tokenHash);
assert.equal(hashRuntimeCredentialToken(first.token), first.tokenHash);
assert.equal(normalizeRuntimeCredentialToken(` ${first.token} `), first.token);
assert.equal(normalizeRuntimeCredentialToken('ockg_rt_too-short'), null);
assert.equal(hashRuntimeCredentialToken('not-a-runtime-token'), null);
assert.equal(first.tokenHash.includes(first.token), false);

const runtimeA = {
  provider: 'hermes' as const,
  runtimeInstanceId: 'runtime-a',
  nativeAgentId: 'default',
};
const runtimeB = { ...runtimeA, runtimeInstanceId: 'runtime-b' };
assert.equal(runtimeCredentialScopeMatches(runtimeA, 'runtime-a', runtimeA), true);
assert.equal(runtimeCredentialScopeMatches(runtimeA, 'runtime-a', runtimeB), false);
assert.equal(runtimeCredentialScopeMatches(runtimeA, 'runtime-b', runtimeA), false);

process.stdout.write(
  'Runtime credential regression passed: format, uniqueness, normalization and one-way hashing\n',
);
