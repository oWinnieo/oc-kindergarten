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
export type CharacterId = 'boy' | 'girl' | 'genderless';
export type AgentTaskState = 'idle' | 'writing' | 'researching' | 'executing';
export type Tile = readonly [number, number];

export interface Point {
  x: number;
  y: number;
}

export const WALKABILITY: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
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
    description: '返回各自的稳定出生点并播放 idle。',
    arrivalAnimation: '播放 4 帧 idle',
  },
  writing: {
    label: '写画中',
    shortLabel: 'Writing',
    location: '写画桌',
    description: '寻路到中央写画桌前，用画笔完成连续的书写或绘画动作。',
    arrivalAnimation: '播放 4 帧写画动作',
  },
  researching: {
    label: '研究中',
    shortLabel: 'Researching',
    location: '阅读角',
    description: '寻路到书架与地毯前的阅读区域并翻阅绘本。',
    arrivalAnimation: '播放 4 帧阅读动作',
  },
  executing: {
    label: '执行中',
    shortLabel: 'Executing',
    location: '积木区',
    description: '寻路到积木桌前的安全交互位置并放置积木。',
    arrivalAnimation: '播放 4 帧积木动作',
  },
};

export const AGENT_TARGET_TILES: Record<
  AgentTaskState,
  Record<CharacterId, Tile>
> = {
  idle: {
    boy: [3, 7],
    girl: [8, 7],
    genderless: [13, 7],
  },
  writing: {
    boy: [7, 5],
    girl: [8, 5],
    genderless: [9, 5],
  },
  researching: {
    boy: [3, 5],
    girl: [4, 5],
    genderless: [5, 5],
  },
  executing: {
    boy: [10, 5],
    girl: [12, 5],
    genderless: [14, 5],
  },
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
