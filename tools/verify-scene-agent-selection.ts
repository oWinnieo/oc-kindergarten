import assert from 'node:assert/strict';

import {
  moveSelectedLayerToFront,
  selectSceneAgentAtPoint,
  topmostAgentAtPoint,
  type SceneAgentHitLayer,
} from '../lib/scene-agent-selection';

const overlappingNameTags: SceneAgentHitLayer[] = [
  { agentId: 'agent-01', bounds: { x: 10, y: 10, width: 40, height: 15 } },
  { agentId: 'agent-02', bounds: { x: 20, y: 10, width: 40, height: 15 } },
  { agentId: 'agent-03', bounds: { x: 30, y: 10, width: 40, height: 15 } },
];

assert.equal(
  topmostAgentAtPoint({ x: 35, y: 15 }, overlappingNameTags),
  'agent-03',
);

const selectedFirstTag = moveSelectedLayerToFront(
  overlappingNameTags,
  'agent-01',
);
assert.deepEqual(
  selectedFirstTag.map((layer) => layer.agentId),
  ['agent-02', 'agent-03', 'agent-01'],
);
assert.equal(
  topmostAgentAtPoint({ x: 35, y: 15 }, selectedFirstTag),
  'agent-01',
);

const characterLayers: SceneAgentHitLayer[] = [
  { agentId: 'agent-back', bounds: { x: 80, y: 40, width: 48, height: 64 } },
  { agentId: 'agent-front', bounds: { x: 88, y: 48, width: 48, height: 64 } },
];

assert.equal(
  selectSceneAgentAtPoint(
    { x: 92, y: 52 },
    overlappingNameTags,
    characterLayers,
  ),
  'agent-front',
);
assert.equal(
  selectSceneAgentAtPoint(
    { x: 35, y: 15 },
    selectedFirstTag,
    characterLayers,
  ),
  'agent-01',
);
assert.equal(
  selectSceneAgentAtPoint(
    { x: 200, y: 200 },
    selectedFirstTag,
    characterLayers,
  ),
  null,
);

process.stdout.write(
  'Scene selection regression passed: topmost name tag, character hit and selected tag fronting\n',
);
