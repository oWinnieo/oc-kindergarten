import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  classifyOpenClawTool,
  MonotonicAgentSequenceClock,
  OpenClawAgentAdapter,
} from '../lib/openclaw-agent-adapter';
import { StarOfficeFallbackAdapter } from '../lib/star-office-fallback-adapter';

type Fixture = Record<string, unknown> & { expected: string };

const now = () => new Date('2026-07-17T12:30:00.000Z');
const clock = new MonotonicAgentSequenceClock({ now });
const nativeAdapter = new OpenClawAgentAdapter({ clock, now });
const starAdapter = new StarOfficeFallbackAdapter({ clock, now });
const fixturePath = resolve(
  process.cwd(),
  'tools/fixtures/openclaw-agent-events-v1.json',
);
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture[];

let lastSequence = 0;
for (const fixture of fixtures) {
  const { expected, ...input } = fixture;
  const result = nativeAdapter.adapt(input);
  assert.equal(result.ok, true);
  if (!result.ok) continue;
  assert.equal(result.events.length, 1);
  const event = result.events[0];
  assert.ok(event.sequence > lastSequence);
  lastSequence = event.sequence;
  assert.equal(
    event.type === 'agent.state' ? event.state : event.action,
    expected,
  );
}

const duplicate = nativeAdapter.adapt(
  Object.fromEntries(
    Object.entries(fixtures[0]).filter(([key]) => key !== 'expected'),
  ),
);
assert.equal(duplicate.ok, true);
if (duplicate.ok) assert.equal(duplicate.events.length, 0);

const runStartFixture = fixtures.find(
  (fixture) => fixture.hook === 'before_agent_run',
);
assert.ok(runStartFixture);
const semanticDuplicate = nativeAdapter.adapt({
  ...Object.fromEntries(
    Object.entries(runStartFixture).filter(([key]) => key !== 'expected'),
  ),
  bridgeEventId: 'openclaw:fixture:semantic-duplicate',
  observedAt: '2026-07-17T12:00:01.100Z',
});
assert.equal(semanticDuplicate.ok, true);
if (semanticDuplicate.ok) {
  assert.equal(semanticDuplicate.events.length, 0);
  assert.equal(semanticDuplicate.ignored, 'semantic_duplicate_run_start');
}

const reverseArrivalAdapter = new OpenClawAgentAdapter();
const laterRunStart = reverseArrivalAdapter.adapt({
  ...Object.fromEntries(
    Object.entries(runStartFixture).filter(([key]) => key !== 'expected'),
  ),
  bridgeEventId: 'openclaw:fixture:later-arrival-first',
  observedAt: '2026-07-17T12:00:01.200Z',
});
assert.equal(laterRunStart.ok, true);
const earlierRunStart = reverseArrivalAdapter.adapt({
  ...Object.fromEntries(
    Object.entries(runStartFixture).filter(([key]) => key !== 'expected'),
  ),
  bridgeEventId: 'openclaw:fixture:earlier-arrival-second',
  observedAt: '2026-07-17T12:00:01.000Z',
});
assert.equal(earlierRunStart.ok, true);
if (earlierRunStart.ok) {
  assert.equal(earlierRunStart.events.length, 0);
  assert.equal(earlierRunStart.ignored, 'semantic_duplicate_run_start');
}

assert.equal(classifyOpenClawTool('browser.open'), 'researching');
assert.equal(classifyOpenClawTool('apply_patch'), 'writing');
assert.equal(classifyOpenClawTool('git_push'), 'syncing');
assert.equal(classifyOpenClawTool('exec'), 'executing');

const star = starAdapter.adapt(
  {
    state: 'receiving',
    detail: '正在接收消息',
    progress: 50,
    updated_at: '2026-07-17T12:29:59.000Z',
  },
  { classroomAgentId: 'agent-scout', snapshotId: 'fixture-star-1' },
);
assert.equal(star.ok, true);
if (star.ok) {
  assert.equal(star.events[0]?.state, 'syncing');
  assert.ok((star.events[0]?.sequence ?? 0) > lastSequence);
}

const stale = starAdapter.adapt(
  {
    state: 'executing',
    detail: '旧状态',
    updated_at: '2026-07-17T12:00:00.000Z',
  },
  { classroomAgentId: 'agent-bloom', snapshotId: 'fixture-star-stale' },
);
assert.equal(stale.ok, true);
if (stale.ok) assert.equal(stale.events[0]?.state, 'idle');

const invalid = starAdapter.adapt(
  { state: 'unknown-provider-state' },
  { classroomAgentId: 'agent-scout' },
);
assert.equal(invalid.ok, false);

process.stdout.write(
  `OpenClaw adapter regression passed: ${fixtures.length} native fixtures + Star fallback\n`,
);
