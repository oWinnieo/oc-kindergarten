import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const mode = process.argv[2];
const baseUrl = (process.env.OC_KINDERGARTEN_VERIFY_BASE_URL ?? 'http://127.0.0.1:3108').replace(/\/$/, '');
const token = process.env.OC_KINDERGARTEN_AGENT_EVENT_TOKEN?.trim();
const stateFile = process.env.OC_KINDERGARTEN_VERIFY_STATE_FILE ?? '/tmp/oc-kindergarten-durable-verification.json';
const agentId = 'durable-verification-agent';

if (!token) throw new Error('OC_KINDERGARTEN_AGENT_EVENT_TOKEN is required');
if (!['seed', 'verify', 'cleanup'].includes(mode)) {
  throw new Error('Usage: node scripts/verify-durable-api.mjs seed|verify|cleanup');
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `${path}: ${JSON.stringify(payload)}`);
  return payload;
}

if (mode === 'seed') {
  const sequence = Date.now() * 10;
  const presence = {
    schemaVersion: 1,
    eventId: `replay:durable:${sequence}:presence`,
    type: 'agent.presence',
    agentId,
    source: 'replay',
    observedAt: new Date().toISOString(),
    sequence,
    action: 'enter',
    scenePointId: 'entrance-door',
  };
  const state = {
    schemaVersion: 1,
    eventId: `replay:durable:${sequence + 1}:state`,
    type: 'agent.state',
    agentId,
    source: 'replay',
    observedAt: new Date().toISOString(),
    sequence: sequence + 1,
    state: 'researching',
    taskSummary: 'durable verification',
  };
  await request('/api/agents', {
    method: 'POST',
    body: JSON.stringify({
      schemaVersion: 1,
      agentId,
      displayName: '持久化验收',
      characterVariant: 'genderless',
      registeredBy: 'system',
      role: 'Durability verification',
      color: '#5865f2',
    }),
  });
  const presenceResponse = await request('/api/agent-events', {
    method: 'POST',
    body: JSON.stringify(presence),
  });
  const stateResponse = await request('/api/agent-events', {
    method: 'POST',
    body: JSON.stringify(state),
  });
  assert.equal(presenceResponse.accepted, 1);
  assert.equal(stateResponse.accepted, 1);
  assert.ok(Number.isSafeInteger(presenceResponse.cursor));
  assert.ok(Number.isSafeInteger(stateResponse.cursor));
  await fs.writeFile(
    stateFile,
    JSON.stringify({ presence, state, presenceCursor: presenceResponse.cursor, stateCursor: stateResponse.cursor }),
    { mode: 0o600 },
  );
  process.stdout.write(`seeded profile and events through cursor ${stateResponse.cursor}\n`);
}

if (mode === 'verify') {
  const expected = JSON.parse(await fs.readFile(stateFile, 'utf8'));
  const registry = await request('/api/agents');
  assert.ok(registry.profiles.some((profile) => profile.agentId === agentId));
  const snapshot = await request('/api/agent-events');
  assert.ok(snapshot.events.some((event) => event.eventId === expected.presence.eventId));
  assert.ok(snapshot.events.some((event) => event.eventId === expected.state.eventId));

  const duplicate = await request('/api/agent-events', {
    method: 'POST',
    body: JSON.stringify(expected.state),
  });
  assert.equal(duplicate.accepted, 0);
  assert.equal(duplicate.ignored, 'duplicate_event');

  const controller = new AbortController();
  const replayResponse = await fetch(`${baseUrl}/api/agent-events/stream`, {
    headers: { 'Last-Event-ID': String(expected.presenceCursor) },
    signal: controller.signal,
  });
  assert.equal(replayResponse.ok, true);
  const reader = replayResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let replayed = false;
  while (!replayed) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    replayed = buffer.includes(`id: ${expected.stateCursor}\n`) && buffer.includes(expected.state.eventId);
  }
  controller.abort();
  assert.equal(replayed, true, 'SSE Last-Event-ID did not replay the expected state event');
  process.stdout.write('restart recovery, duplicate rejection and SSE cursor replay passed\n');
}

if (mode === 'cleanup') {
  await request(`/api/agents?agentId=${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  });
  const registry = await request('/api/agents');
  assert.equal(
    registry.profiles.some((profile) => profile.agentId === agentId),
    false,
  );

  const controller = new AbortController();
  const replayResponse = await fetch(`${baseUrl}/api/agents/stream`, {
    headers: { 'Last-Event-ID': 'registry:0' },
    signal: controller.signal,
  });
  assert.equal(replayResponse.ok, true);
  const reader = replayResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let removalReplayed = false;
  while (!removalReplayed) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    removalReplayed =
      buffer.includes('agent.profile.removed') && buffer.includes(agentId);
  }
  controller.abort();
  assert.equal(removalReplayed, true, 'Registry removal was not replayed');
  await fs.rm(stateFile, { force: true });
  process.stdout.write('verification profile archived; Registry removal replay passed\n');
}
