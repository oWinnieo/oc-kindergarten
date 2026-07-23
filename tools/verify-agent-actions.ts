import assert from 'node:assert/strict';

import {
  CLASSROOM_SNAPSHOT_END_EVENT,
  CLASSROOM_SNAPSHOT_END_SSE,
  CLASSROOM_SNAPSHOT_EVENT,
  encodeClassroomSnapshotSse,
} from '../lib/classroom-snapshot-protocol';

const snapshotPayload = { type: 'agent.state', state: 'syncing' };
assert.equal(CLASSROOM_SNAPSHOT_EVENT, 'classroom-snapshot');
assert.equal(CLASSROOM_SNAPSHOT_END_EVENT, 'classroom-snapshot-end');
assert.equal(
  encodeClassroomSnapshotSse(42, snapshotPayload),
  'id: 42\nevent: classroom-snapshot\ndata: {"type":"agent.state","state":"syncing"}\n\n',
);
assert.equal(
  CLASSROOM_SNAPSHOT_END_SSE,
  'event: classroom-snapshot-end\ndata: {}\n\n',
);

import { parseAgentAction } from '../lib/agent-action-contract';
import { agentActionNotice } from '../lib/agent-action-notice';
import {
  canParentArchiveEnrollment,
  canParentEditAgentProfile,
  nextAgentEnrollmentStatus,
} from '../lib/agent-enrollment-contract';

const valid = parseAgentAction({
  schemaVersion: 1,
  action: 'researching',
  requestId: 'family-request-001',
});
assert.equal(valid.ok, true);
if (valid.ok) {
  assert.equal(valid.command.action, 'researching');
  assert.equal(valid.command.requestId, 'family-request-001');
}

assert.equal(
  parseAgentAction({
    schemaVersion: 1,
    action: 'unknown',
    requestId: 'family-request-002',
  }).ok,
  false,
);
assert.equal(
  parseAgentAction({
    schemaVersion: 1,
    action: 'idle',
    requestId: 'short',
  }).ok,
  false,
);
assert.equal(
  parseAgentAction({
    schemaVersion: 1,
    action: 'idle',
    requestId: 'family-request-003',
    agentId: 'must-not-be-client-controlled',
  }).ok,
  false,
);

assert.equal(nextAgentEnrollmentStatus('active', 'suspend'), 'suspended');
assert.equal(nextAgentEnrollmentStatus('suspended', 'resume'), 'active');
assert.equal(nextAgentEnrollmentStatus('active', 'resume'), null);
assert.equal(nextAgentEnrollmentStatus('draft', 'archive'), 'archived');
assert.equal(nextAgentEnrollmentStatus('archived', 'archive'), null);
assert.equal(nextAgentEnrollmentStatus('archived', 'restore'), 'suspended');
assert.equal(nextAgentEnrollmentStatus('active', 'restore'), null);
assert.equal(canParentArchiveEnrollment('draft'), true);
assert.equal(canParentArchiveEnrollment('awaiting_pairing'), true);
assert.equal(canParentArchiveEnrollment('pending_parent_confirmation'), true);
assert.equal(canParentArchiveEnrollment('active'), true);
assert.equal(canParentArchiveEnrollment('suspended'), true);
assert.equal(canParentArchiveEnrollment('archived'), false);
assert.equal(canParentEditAgentProfile('active'), true);
assert.equal(canParentEditAgentProfile('suspended'), true);
assert.equal(canParentEditAgentProfile('archived'), false);
assert.equal(canParentEditAgentProfile('pending_parent_confirmation'), false);
assert.equal(
  agentActionNotice('Bonnie', 'researching'),
  'Bonnie 正在前往阅读区。',
);

process.stdout.write(
  'Agent action regression passed: command whitelist, request id, notice copy, lifecycle transitions and recoverable archive\n',
);
