import assert from 'node:assert/strict';

import {
  type ActivityWaitQueues,
  enqueueActivityWaiter,
  removeAgentFromActivityWaitQueues,
  shiftActivityWaiter,
} from '../lib/activity-wait-queue';
import {
  ActivityRegionFullError,
  activityPointsOverlap,
  activityRegionTargets,
  selectActivityTarget,
  type Point,
} from '../lib/classroom-runtime';
import {
  parseStressRunId,
  parseStressTestCreate,
  parseStressTestOperation,
} from '../lib/stress-test-contract';

assert.equal(parseStressRunId('capacity-20260720').ok, true);
assert.equal(parseStressRunId('bad').ok, false);
assert.equal(
  parseStressTestCreate({ runId: 'capacity-20260720', agentCount: 20 }).ok,
  true,
);
assert.equal(
  parseStressTestCreate({ runId: 'capacity-20260720', agentCount: 13 }).ok,
  false,
);
assert.equal(
  parseStressTestOperation({
    runId: 'capacity-20260720',
    operation: 'target',
    state: 'writing',
  }).ok,
  true,
);

const writingCapacity = activityRegionTargets('writing').length;
assert.equal(writingCapacity, 12);

const waitQueues: ActivityWaitQueues = new Map();
const occupied: Point[] = [];
const assigned = new Map<string, Point>();
const agentIds = Array.from(
  { length: 20 },
  (_, index) => `test-capacity-20260720-${String(index + 1).padStart(2, '0')}`,
);

for (const agentId of agentIds) {
  try {
    const target = selectActivityTarget('writing', occupied, () => 0);
    assert.equal(
      occupied.some((point) => activityPointsOverlap(point, target.point)),
      false,
    );
    occupied.push(target.point);
    assigned.set(agentId, target.point);
  } catch (error) {
    assert.ok(error instanceof ActivityRegionFullError);
    enqueueActivityWaiter(waitQueues, 'writing', agentId);
  }
}

assert.equal(assigned.size, 12);
assert.deepEqual(waitQueues.get('writing'), agentIds.slice(12));
assert.equal(
  occupied.every((point, index) =>
    occupied
      .slice(index + 1)
      .every((candidate) => !activityPointsOverlap(point, candidate)),
  ),
  true,
);

enqueueActivityWaiter(waitQueues, 'writing', agentIds[12]);
assert.deepEqual(waitQueues.get('writing'), agentIds.slice(12));

const releasedIds = agentIds.slice(0, 3);
for (const agentId of releasedIds) {
  const releasedPoint = assigned.get(agentId);
  assert.ok(releasedPoint);
  occupied.splice(occupied.indexOf(releasedPoint), 1);
  assigned.delete(agentId);

  const nextAgentId = shiftActivityWaiter(waitQueues, 'writing');
  assert.ok(nextAgentId);
  const target = selectActivityTarget('writing', occupied, () => 0);
  occupied.push(target.point);
  assigned.set(nextAgentId, target.point);
}

assert.equal(assigned.size, 12);
assert.deepEqual(Array.from(assigned.keys()).slice(-3), agentIds.slice(12, 15));
assert.deepEqual(waitQueues.get('writing'), agentIds.slice(15));

removeAgentFromActivityWaitQueues(waitQueues, agentIds[15]);
assert.deepEqual(waitQueues.get('writing'), agentIds.slice(16));

process.stdout.write(
  'Capacity stress regression passed: 12 writing slots, no overlap, FIFO wait and release\n',
);
