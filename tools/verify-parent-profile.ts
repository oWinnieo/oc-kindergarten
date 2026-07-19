import assert from 'node:assert/strict';

import { parseParentProfilePatch } from '../lib/parent-profile-contract';

const valid = parseParentProfilePatch({
  displayName: '  小王家长  ',
  avatarUrl: 'https://example.com/avatar.png',
  timezone: 'Asia/Singapore',
  language: 'zh-CN',
});
assert.equal(valid.ok, true);
if (valid.ok) {
  assert.equal(valid.patch.displayName, '小王家长');
  assert.equal(valid.patch.timezone, 'Asia/Singapore');
}

const clearOptional = parseParentProfilePatch({
  avatarUrl: '',
  timezone: null,
});
assert.equal(clearOptional.ok, true);
if (clearOptional.ok) {
  assert.equal(clearOptional.patch.avatarUrl, null);
  assert.equal(clearOptional.patch.timezone, null);
}

assert.equal(parseParentProfilePatch({ displayName: '   ' }).ok, false);
assert.equal(
  parseParentProfilePatch({ avatarUrl: 'https://user:secret@example.com/a.png' })
    .ok,
  false,
);
assert.equal(parseParentProfilePatch({ timezone: 'Mars/Olympus' }).ok, false);
assert.equal(parseParentProfilePatch({ language: '../../../secret' }).ok, false);
assert.equal(parseParentProfilePatch({ email: 'cannot-change@example.com' }).ok, false);
assert.equal(parseParentProfilePatch({}).ok, false);

process.stdout.write(
  'Parent profile contract regression passed: normalization, clearing, privacy and validation\n',
);
