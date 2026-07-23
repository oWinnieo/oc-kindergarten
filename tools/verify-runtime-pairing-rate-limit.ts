import assert from 'node:assert/strict';

import {
  checkRuntimePairingRateLimit,
  resetRuntimePairingRateLimitsForTests,
  runtimePairingClientKey,
} from '../lib/runtime-pairing-rate-limit';

resetRuntimePairingRateLimitsForTests();
for (let attempt = 0; attempt < 20; attempt += 1) {
  assert.equal(
    checkRuntimePairingRateLimit('test-client', 1_000).allowed,
    true,
  );
}
const blocked = checkRuntimePairingRateLimit('test-client', 1_000);
assert.equal(blocked.allowed, false);
assert.equal(blocked.retryAfterSeconds, 300);
assert.equal(
  checkRuntimePairingRateLimit('test-client', 301_000).allowed,
  true,
);
assert.equal(
  runtimePairingClientKey(
    new Request('https://example.test', {
      headers: {
        'x-real-ip': '198.51.100.8',
        'x-forwarded-for': '203.0.113.5, 10.0.0.1',
      },
    }),
  ),
  '198.51.100.8',
);
assert.equal(
  runtimePairingClientKey(
    new Request('https://example.test', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    }),
  ),
  '203.0.113.5',
);

process.stdout.write(
  'Runtime pairing rate-limit regression passed: window, retry and forwarded client identity\n',
);
