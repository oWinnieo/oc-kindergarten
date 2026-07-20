export interface ScenePoint {
  x: number;
  y: number;
}

export interface SceneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SceneAgentHitLayer {
  agentId: string;
  bounds: SceneBounds;
}

export function moveSelectedLayerToFront<T extends { agentId: string }>(
  layers: readonly T[],
  selectedAgentId: string,
): T[] {
  if (!selectedAgentId) return [...layers];
  const selected = layers.find((layer) => layer.agentId === selectedAgentId);
  if (!selected) return [...layers];
  return [
    ...layers.filter((layer) => layer.agentId !== selectedAgentId),
    selected,
  ];
}

function boundsContainPoint(bounds: SceneBounds, point: ScenePoint): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export function topmostAgentAtPoint(
  point: ScenePoint,
  layers: readonly SceneAgentHitLayer[],
): string | null {
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (boundsContainPoint(layer.bounds, point)) return layer.agentId;
  }
  return null;
}

export function selectSceneAgentAtPoint(
  point: ScenePoint,
  nameTagLayers: readonly SceneAgentHitLayer[],
  characterLayers: readonly SceneAgentHitLayer[],
): string | null {
  return (
    topmostAgentAtPoint(point, nameTagLayers) ??
    topmostAgentAtPoint(point, characterLayers)
  );
}
