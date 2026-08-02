import assert from 'node:assert/strict';

import { planParentUserMigration } from './migrate-parent-users.mjs';

const source = [
  { id: 'one', oidc_issuer: 'https://id.example', oidc_subject: 'alpha' },
  { id: 'two', oidc_issuer: 'https://id.example', oidc_subject: 'beta' },
];

const clean = planParentUserMigration(source, []);
assert.equal(clean.selected, 2);
assert.equal(clean.insertCount, 2);
assert.equal(clean.conflictCount, 0);

const idempotent = planParentUserMigration(source, [source[0]]);
assert.equal(idempotent.existing, 1);
assert.equal(idempotent.insertCount, 1);

const uuidConflict = planParentUserMigration(source, [
  { id: 'one', oidc_issuer: 'https://id.example', oidc_subject: 'other' },
]);
assert.equal(uuidConflict.uuidConflicts, 1);

const identityConflict = planParentUserMigration(source, [
  { id: 'other-id', oidc_issuer: 'https://id.example', oidc_subject: 'alpha' },
]);
assert.equal(identityConflict.identityConflicts, 1);

process.stdout.write('Parent migration planner regression passed\n');
