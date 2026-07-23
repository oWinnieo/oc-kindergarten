import assert from 'node:assert/strict';

import {
  generateRuntimeCredential,
  hashRuntimeCredentialToken,
  normalizeRuntimeCredentialToken,
} from '../lib/runtime-credential-contract';

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

process.stdout.write(
  'Runtime credential regression passed: format, uniqueness, normalization and one-way hashing\n',
);
