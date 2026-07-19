import type { AgentCharacterVariant } from './agent-registry-contract';

export const WORLD_SIZE = { width: 512, height: 288 } as const;
export const TILE_SIZE = 32;
export const TILE_ANCHOR_Y_OFFSET = 8;

export const DIRECTION_ORDER = [
  'down',
  'left',
  'right',
  'up',
  'down_left',
  'down_right',
  'up_left',
  'up_right',
] as const;

export type Direction = (typeof DIRECTION_ORDER)[number];
export type CharacterId = AgentCharacterVariant;
export const AGENT_TASK_STATES = [
  'idle',
  'writing',
  'researching',
  'executing',
  'syncing',
  'error',
] as const;
export type AgentTaskState = (typeof AGENT_TASK_STATES)[number];
export type Tile = readonly [number, number];

export interface Point {
  x: number;
  y: number;
}

// Stable scene ID from the approved entrance v1 extension manifest.
export const CLASSROOM_ENTRANCE_ID = 'entrance-door' as const;
export const PLAYER_JOIN_SPAWN_TILE: Tile = [10, 2];
export const PLAYER_JOIN_SPAWN: Point = { x: 320, y: 72 };
export const PLAYER_ENTRY_LANDING_TILE: Tile = [10, 4];
export const PLAYER_ENTRY_LANDING: Point = { x: 328, y: 136 };

export const WALKABILITY: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export const STATE_CONFIG: Record<
  AgentTaskState,
  {
    label: string;
    shortLabel: string;
    location: string;
    description: string;
    arrivalAnimation: string;
  }
> = {
  idle: {
    label: '待机',
    shortLabel: 'Idle',
    location: '教室日常位置',
    description: '从统一入口前往日常活动区域内的随机可用位置并播放 idle。',
    arrivalAnimation: '播放 4 帧 idle',
  },
  writing: {
    label: '写画中',
    shortLabel: 'Writing',
    location: '写画桌',
    description: '寻路到写画区域内的随机可用位置，完成书写或绘画动作。',
    arrivalAnimation: '播放 4 帧写画动作',
  },
  researching: {
    label: '研究中',
    shortLabel: 'Researching',
    location: '阅读角',
    description: '寻路到阅读区域内的随机可用位置并翻阅绘本。',
    arrivalAnimation: '播放 4 帧阅读动作',
  },
  executing: {
    label: '执行中',
    shortLabel: 'Executing',
    location: '积木区',
    description: '寻路到积木区域内的随机可用位置并放置积木。',
    arrivalAnimation: '播放 4 帧积木动作',
  },
  syncing: {
    label: '同步中',
    shortLabel: 'Syncing',
    location: '同步邮件站',
    description: '寻路到同步区域内的随机可用位置，读取消息卡并完成同步。',
    arrivalAnimation: '播放 4 帧同步动作',
  },
  error: {
    label: '故障中',
    shortLabel: 'Error',
    location: '诊断修理站',
    description: '寻路到修理区域内的随机可用位置，检查故障并等待修复。',
    arrivalAnimation: '播放 4 帧诊断动作',
  },
};

export interface ActivityRegion {
  minColumn: number;
  maxColumn: number;
  minRow: number;
  maxRow: number;
}

export interface ActivityTarget {
  tile: Tile;
  point: Point;
}

export class ActivityRegionFullError extends Error {
  readonly state: AgentTaskState;

  constructor(state: AgentTaskState) {
    super(`${STATE_CONFIG[state].location}当前没有可用站位`);
    this.name = 'ActivityRegionFullError';
    this.state = state;
  }
}

// Only the wheel contact area reserves floor space. The 48x64 body sprite may
// overlap neighboring sprites and is ordered visually by its ground anchor Y.
export const AGENT_GROUND_OCCUPANCY = { width: 14, height: 8 } as const;

const ACTIVITY_SPOT_OFFSETS: readonly Point[] = [
  { x: -8, y: -4 },
  { x: 8, y: -4 },
  { x: -8, y: 4 },
  { x: 8, y: 4 },
];

// Functional areas belong to task states, never to a character's gender.
// Bounds are inclusive grid rectangles; a free walkable tile is sampled on entry.
export const ACTIVITY_REGIONS: Record<AgentTaskState, ActivityRegion> = {
  idle: { minColumn: 1, maxColumn: 14, minRow: 7, maxRow: 8 },
  writing: { minColumn: 7, maxColumn: 9, minRow: 5, maxRow: 5 },
  researching: { minColumn: 2, maxColumn: 5, minRow: 4, maxRow: 6 },
  executing: { minColumn: 10, maxColumn: 14, minRow: 5, maxRow: 5 },
  syncing: { minColumn: 9, maxColumn: 13, minRow: 6, maxRow: 6 },
  error: { minColumn: 4, maxColumn: 8, minRow: 6, maxRow: 6 },
};

export const STATE_ARRIVAL_OFFSET_Y: Record<AgentTaskState, number> = {
  idle: 0,
  writing: -40,
  researching: 0,
  executing: -40,
  syncing: 8,
  error: 8,
};

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

function tileKey(tile: Tile): string {
  return `${tile[0]},${tile[1]}`;
}

function isWalkable(tile: Tile): boolean {
  const [x, y] = tile;
  return (
    y >= 0 &&
    y < WALKABILITY.length &&
    x >= 0 &&
    x < WALKABILITY[0].length &&
    WALKABILITY[y][x] === 1
  );
}

export function activityRegionTiles(state: AgentTaskState): Tile[] {
  const region = ACTIVITY_REGIONS[state];
  const tiles: Tile[] = [];
  for (let row = region.minRow; row <= region.maxRow; row += 1) {
    for (
      let column = region.minColumn;
      column <= region.maxColumn;
      column += 1
    ) {
      const tile: Tile = [column, row];
      if (isWalkable(tile)) tiles.push(tile);
    }
  }
  return tiles;
}

export function activityRegionTargets(state: AgentTaskState): ActivityTarget[] {
  return activityRegionTiles(state).flatMap((tile) => {
    const anchor = tileToAnchor(tile);
    return ACTIVITY_SPOT_OFFSETS.map((offset) => ({
      tile,
      point: {
        x: anchor.x + offset.x,
        y: anchor.y + offset.y + STATE_ARRIVAL_OFFSET_Y[state],
      },
    }));
  });
}

function overlapsOccupiedGround(
  point: Point,
  occupiedPoints: readonly Point[],
): boolean {
  return occupiedPoints.some(
    (occupied) =>
      Math.abs(point.x - occupied.x) < AGENT_GROUND_OCCUPANCY.width &&
      Math.abs(point.y - occupied.y) < AGENT_GROUND_OCCUPANCY.height,
  );
}

export function selectActivityTarget(
  state: AgentTaskState,
  occupiedPoints: readonly Point[] = [],
  random: () => number = Math.random,
): ActivityTarget {
  const candidates = activityRegionTargets(state);
  if (candidates.length === 0) {
    throw new Error(`状态 ${state} 没有可通行的活动坐标`);
  }

  const available = candidates.filter(
    (candidate) => !overlapsOccupiedGround(candidate.point, occupiedPoints),
  );
  if (available.length === 0) {
    throw new ActivityRegionFullError(state);
  }
  const index = Math.min(
    available.length - 1,
    Math.max(0, Math.floor(random() * available.length)),
  );
  return available[index];
}

function octileDistance(from: Tile, to: Tile): number {
  const dx = Math.abs(from[0] - to[0]);
  const dy = Math.abs(from[1] - to[1]);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

export function findPath(start: Tile, goal: Tile): Tile[] {
  if (!isWalkable(start) || !isWalkable(goal)) return [];

  const startKey = tileKey(start);
  const goalKey = tileKey(goal);
  const open = new Set([startKey]);
  const tiles = new Map<string, Tile>([[startKey, start]]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, octileDistance(start, goal)]]);

  while (open.size > 0) {
    let currentKey = '';
    let currentScore = Number.POSITIVE_INFINITY;
    for (const candidate of Array.from(open)) {
      const score = fScore.get(candidate) ?? Number.POSITIVE_INFINITY;
      if (score < currentScore) {
        currentKey = candidate;
        currentScore = score;
      }
    }

    const current = tiles.get(currentKey);
    if (!current) return [];

    if (currentKey === goalKey) {
      const path: Tile[] = [current];
      let cursor = currentKey;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        const tile = tiles.get(cursor);
        if (!tile) return [];
        path.push(tile);
      }
      return path.reverse();
    }

    open.delete(currentKey);
    for (const [dx, dy] of NEIGHBORS) {
      const neighbor: Tile = [current[0] + dx, current[1] + dy];
      if (!isWalkable(neighbor)) continue;

      if (
        dx !== 0 &&
        dy !== 0 &&
        (!isWalkable([current[0] + dx, current[1]]) ||
          !isWalkable([current[0], current[1] + dy]))
      ) {
        continue;
      }

      const neighborKey = tileKey(neighbor);
      const tentative =
        (gScore.get(currentKey) ?? Number.POSITIVE_INFINITY) +
        (dx === 0 || dy === 0 ? 1 : Math.SQRT2);

      if (tentative >= (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }

      cameFrom.set(neighborKey, currentKey);
      tiles.set(neighborKey, neighbor);
      gScore.set(neighborKey, tentative);
      fScore.set(neighborKey, tentative + octileDistance(neighbor, goal));
      open.add(neighborKey);
    }
  }

  return [];
}

export function tileToAnchor(tile: Tile): Point {
  return {
    x: tile[0] * TILE_SIZE,
    y: tile[1] * TILE_SIZE + TILE_ANCHOR_Y_OFFSET,
  };
}

export function pointToTile(point: Point): Tile {
  const x = Math.max(
    0,
    Math.min(WALKABILITY[0].length - 1, Math.round(point.x / TILE_SIZE)),
  );
  const y = Math.max(
    0,
    Math.min(
      WALKABILITY.length - 1,
      Math.round((point.y - TILE_ANCHOR_Y_OFFSET) / TILE_SIZE),
    ),
  );
  return [x, y];
}

export function directionFromDelta(dx: number, dy: number): Direction {
  const horizontal = Math.abs(dx) > 0.01 ? (dx > 0 ? 'right' : 'left') : '';
  const vertical = Math.abs(dy) > 0.01 ? (dy > 0 ? 'down' : 'up') : '';

  if (horizontal && vertical) return `${vertical}_${horizontal}` as Direction;
  if (horizontal) return horizontal;
  if (vertical) return vertical;
  return 'down';
}
