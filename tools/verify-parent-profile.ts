import assert from 'node:assert/strict';

import { parseParentProfilePatch } from '../lib/parent-profile-contract';
import {
  PARENT_LANGUAGE_OPTIONS,
  PARENT_TIMEZONE_OPTIONS,
  parentLanguageLabel,
  parentLanguageValue,
  parentTimezoneLabel,
  parentTimezoneValue,
} from '../lib/parent-profile-options';

assert.deepEqual(
  PARENT_LANGUAGE_OPTIONS.map((option) => option.value),
  ['zh-CN', 'en', 'ja'],
);
assert.deepEqual(
  PARENT_TIMEZONE_OPTIONS.map((option) => option.value),
  [
    'Asia/Shanghai',
    'America/New_York',
    'Europe/London',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Asia/Singapore',
  ],
);
assert.equal(parentLanguageValue('en-US'), 'en');
assert.equal(parentLanguageLabel('en-US'), 'English');
assert.equal(parentTimezoneValue('Asia/Singapore'), 'Asia/Singapore');
assert.equal(parentTimezoneLabel('Asia/Singapore'), '新加坡');
assert.equal(parentTimezoneValue('Australia/Sydney'), '');

const valid = parseParentProfilePatch({
  displayName: '  小王主人  ',
  avatarUrl: 'https://example.com/avatar.png',
  timezone: 'Asia/Singapore',
  language: 'zh-CN',
});
assert.equal(valid.ok, true);
if (valid.ok) {
  assert.equal(valid.patch.displayName, '小王主人');
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
