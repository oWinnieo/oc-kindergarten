import assert from 'node:assert/strict';

const mode = process.argv[2] ?? 'run';
const count = Number(process.argv[3] ?? 3);
const explicitRunId = process.argv[4];
const baseUrl = (
  process.env.OC_KINDERGARTEN_STRESS_BASE_URL ??
  'https://kindergarten-dev.rococo.dev'
).replace(/\/$/, '');
const adminToken = process.env.OC_KINDERGARTEN_ADMIN_TOKEN?.trim();
const holdAfterTargetMs = Number(
  process.env.OC_KINDERGARTEN_STRESS_TARGET_HOLD_MS ?? 0,
);
const holdAfterReleaseMs = Number(
  process.env.OC_KINDERGARTEN_STRESS_RELEASE_HOLD_MS ?? 0,
);

if (!adminToken) throw new Error('OC_KINDERGARTEN_ADMIN_TOKEN is required');

function generatedRunId() {
  return `cap-${new Date()
    .toISOString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 24)}-${process.pid}`;
}

const runId = explicitRunId ?? generatedRunId();
const prefix = `test-${runId}-`;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function api(path, options = {}) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      ...(options.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const payload = await response.json();
  assert.equal(
    response.ok,
    true,
    `${options.method ?? 'GET'} ${path}: ${response.status} ${JSON.stringify(payload)}`,
  );
  return {
    payload,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
  };
}

function openSse(path, onPayload, headers = {}) {
  const controller = new AbortController();
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const task = (async () => {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        signal: controller.signal,
        headers,
      });
      assert.equal(response.ok, true, `${path}: ${response.status}`);
      readyResolve();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = block
            .split('\n')
            .filter((line) => line.startsWith('data: '))
            .map((line) => line.slice('data: '.length))
            .join('\n');
          const eventId = block
            .split('\n')
            .find((line) => line.startsWith('id: '))
            ?.slice('id: '.length);
          if (data) onPayload(JSON.parse(data), performance.now(), eventId);
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      readyReject(error);
      throw error;
    }
  })();
  return { controller, ready, task };
}

async function waitFor(label, predicate, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function cleanup() {
  return api(
    `/api/admin/stress-runs?runId=${encodeURIComponent(runId)}`,
    { method: 'DELETE' },
  );
}

if (mode === 'cleanup') {
  const result = await cleanup();
  process.stdout.write(`${JSON.stringify(result.payload)}\n`);
  process.exit(0);
}

if (mode === 'status') {
  const result = await api(
    `/api/admin/stress-runs?runId=${encodeURIComponent(runId)}`,
  );
  process.stdout.write(`${JSON.stringify(result.payload)}\n`);
  process.exit(0);
}

if (mode !== 'run' || ![3, 20].includes(count)) {
  throw new Error(
    'Usage: node scripts/verify-capacity-stress.mjs run 3|20 [runId]',
  );
}

const registryMessages = [];
const agentMessages = [];
const registryStream = openSse('/api/agents/stream', (payload, receivedAt, eventId) => {
  if (payload?.agentId?.startsWith(prefix)) {
    registryMessages.push({ payload, receivedAt, eventId });
  }
});
const agentStream = openSse('/api/agent-events/stream', (payload, receivedAt, eventId) => {
  if (payload?.agentId?.startsWith(prefix)) {
    agentMessages.push({ payload, receivedAt, eventId });
  }
});

const observerUrl = `${baseUrl}/?stressRun=${encodeURIComponent(runId)}`;
process.stdout.write(`stress_run_id=${runId}\n`);
process.stdout.write(`observer_url=${observerUrl}\n`);

let seedAttempted = false;
let seeded = false;
try {
  await Promise.all([registryStream.ready, agentStream.ready]);

  const seedStartedAt = performance.now();
  seedAttempted = true;
  const seed = await api('/api/admin/stress-runs', {
    method: 'POST',
    body: JSON.stringify({ runId, agentCount: count }),
  });
  seeded = true;
  assert.equal(seed.payload.status.profileCount, count);
  await waitFor(
    'Registry profile upserts',
    () =>
      registryMessages.filter(
        ({ payload }) => payload.type === 'agent.profile.upserted',
      ).length >= count,
  );
  const registryLatency =
    registryMessages
      .filter(({ payload }) => payload.type === 'agent.profile.upserted')
      .slice(0, count)
      .at(-1).receivedAt - seedStartedAt;

  const enterStartedAt = performance.now();
  const enter = await api('/api/admin/stress-runs', {
    method: 'PATCH',
    body: JSON.stringify({ runId, operation: 'enter' }),
  });
  assert.equal(enter.payload.result.accepted, count);
  await waitFor(
    'presence enter events',
    () =>
      agentMessages.filter(
        ({ payload }) =>
          payload.type === 'agent.presence' && payload.action === 'enter',
      ).length >= count,
  );
  const enterLatency =
    agentMessages
      .filter(
        ({ payload }) =>
          payload.type === 'agent.presence' && payload.action === 'enter',
      )
      .slice(0, count)
      .at(-1).receivedAt - enterStartedAt;

  const targetStartedAt = performance.now();
  const target = await api('/api/admin/stress-runs', {
    method: 'PATCH',
    body: JSON.stringify({ runId, operation: 'target', state: 'writing' }),
  });
  assert.equal(target.payload.result.accepted, count);
  await waitFor(
    'writing state events',
    () =>
      agentMessages.filter(
        ({ payload }) =>
          payload.type === 'agent.state' && payload.state === 'writing',
      ).length >= count,
  );
  const targetLatency =
    agentMessages
      .filter(
        ({ payload }) =>
          payload.type === 'agent.state' && payload.state === 'writing',
      )
      .slice(0, count)
      .at(-1).receivedAt - targetStartedAt;

  const lastEnterId = agentMessages
    .filter(
      ({ payload }) =>
        payload.type === 'agent.presence' && payload.action === 'enter',
    )
    .slice(0, count)
    .at(-1).eventId;
  assert.match(lastEnterId, /^\d+$/);
  const replayedTargets = [];
  const replayStream = openSse(
    '/api/agent-events/stream',
    (payload) => {
      if (
        payload?.agentId?.startsWith(prefix) &&
        payload.type === 'agent.state' &&
        payload.state === 'writing'
      ) {
        replayedTargets.push(payload);
      }
    },
    { 'Last-Event-ID': lastEnterId },
  );
  await replayStream.ready;
  await waitFor('Last-Event-ID target replay', () => replayedTargets.length >= count);
  replayStream.controller.abort();
  await Promise.allSettled([replayStream.task]);

  const duplicate = await api('/api/admin/stress-runs', {
    method: 'PATCH',
    body: JSON.stringify({ runId, operation: 'target', state: 'writing' }),
  });
  assert.equal(duplicate.payload.result.accepted, 0);
  assert.equal(duplicate.payload.result.duplicate, count);

  const beforeRelease = await api(
    `/api/admin/stress-runs?runId=${encodeURIComponent(runId)}`,
  );
  assert.equal(beforeRelease.payload.status.profileCount, count);
  assert.equal(beforeRelease.payload.status.latestStateCount, count);
  assert.equal(beforeRelease.payload.status.eventCount, count * 2);
  assert.equal(beforeRelease.payload.status.cursorCount, count);
  assert.equal(beforeRelease.payload.status.bindingCount, 0);
  assert.equal(beforeRelease.payload.status.commandCount, 0);

  process.stdout.write(
    `registry_sse_all_ms=${registryLatency.toFixed(2)}\n` +
      `presence_sse_all_ms=${enterLatency.toFixed(2)}\n` +
      `target_sse_all_ms=${targetLatency.toFixed(2)}\n` +
      `last_event_id_replay=${replayedTargets.length}\n` +
      `seed_api_ms=${seed.durationMs}\n` +
      `enter_api_ms=${enter.durationMs}\n` +
      `target_api_ms=${target.durationMs}\n` +
      `duplicate_api_ms=${duplicate.durationMs}\n`,
  );

  if (holdAfterTargetMs > 0) {
    process.stdout.write(`target_hold_ms=${holdAfterTargetMs}\n`);
    await delay(holdAfterTargetMs);
  }

  const releaseCount = Math.min(3, count);
  const release = await api('/api/admin/stress-runs', {
    method: 'PATCH',
    body: JSON.stringify({
      runId,
      operation: 'release',
      count: releaseCount,
    }),
  });
  assert.equal(release.payload.result.accepted, releaseCount);
  await waitFor(
    'release idle events',
    () =>
      agentMessages.filter(
        ({ payload }) =>
          payload.type === 'agent.state' && payload.state === 'idle',
      ).length >= releaseCount,
  );
  process.stdout.write(`release_api_ms=${release.durationMs}\n`);

  if (holdAfterReleaseMs > 0) {
    process.stdout.write(`release_hold_ms=${holdAfterReleaseMs}\n`);
    await delay(holdAfterReleaseMs);
  }
} finally {
  if (seedAttempted) {
    const removedAt = performance.now();
    const result = await cleanup();
    if (seeded) assert.equal(result.payload.removed, count);
    const removed = result.payload.removed;
    if (removed > 0) {
      await waitFor(
        'Registry profile removals',
        () =>
          registryMessages.filter(
            ({ payload }) => payload.type === 'agent.profile.removed',
          ).length >= removed,
      );
      const cleanupLatency =
        registryMessages
          .filter(({ payload }) => payload.type === 'agent.profile.removed')
          .slice(0, removed)
          .at(-1).receivedAt - removedAt;
      process.stdout.write(
        `cleanup_registry_sse_all_ms=${cleanupLatency.toFixed(2)}\n`,
      );
    }
    const status = result.payload.status;
    for (const key of [
      'profileCount',
      'latestStateCount',
      'eventCount',
      'cursorCount',
      'outboxCount',
      'bindingCount',
      'commandCount',
    ]) {
      assert.equal(status[key], 0, `${key} was not cleaned`);
    }
    process.stdout.write('stress_cleanup=passed\n');
  }
  registryStream.controller.abort();
  agentStream.controller.abort();
  await Promise.allSettled([registryStream.task, agentStream.task]);
}

process.stdout.write(`capacity_stress_${count}=passed\n`);
