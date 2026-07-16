'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import foundationUrl from '@/assets/design/maps/classroom-corner/art/v1/classroom-corner-foundation-512x288.png';
import blockTableUrl from '@/assets/design/maps/classroom-corner/props/block-table/v2/block-table-96x56-left-to-right.png';
import readingBookBinUrl from '@/assets/design/maps/classroom-corner/props/reading-book-bin/v1/reading-book-bin-48x40.png';
import readingBookshelfUrl from '@/assets/design/maps/classroom-corner/props/reading-bookshelf/v1/reading-bookshelf-96x44.png';
import syncMailStationUrl from '@/assets/design/maps/classroom-corner/props/sync-mail-station/v1/sync-mail-station-96x48.png';
import toyBinUrl from '@/assets/design/maps/classroom-corner/props/toy-bin/v2/toy-bin-40x48-left-to-right.png';
import writingTableUrl from '@/assets/design/maps/classroom-corner/props/writing-table/v1/writing-table-96x56.png';
import boyIdleUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/idle/boy-child-idle-wheelbase-v2-strip-48x64.png';
import boyMoveUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/moving/v1/boy-child-move-8dir-4frame-wheelbase-v2-48x64.png';
import boyExecutingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/actions/v1/executing/boy-child-executing-4frame-wheelbase-v2-strip-48x64.png';
import boyResearchingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/actions/v1/researching/boy-child-researching-4frame-wheelbase-v2-strip-48x64.png';
import boySyncingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/actions/v1/syncing/boy-child-syncing-4frame-wheelbase-v2-strip-48x64.png';
import boyWritingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/actions/v1/writing/boy-child-writing-4frame-wheelbase-v2-strip-48x64.png';
import genderlessIdleUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/idle/genderless-child-idle-wheelbase-v2-strip-48x64.png';
import genderlessMoveUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/moving/v1/genderless-child-move-8dir-4frame-wheelbase-v2-48x64.png';
import genderlessExecutingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/actions/v1/executing/genderless-child-executing-4frame-wheelbase-v2-strip-48x64.png';
import genderlessResearchingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/actions/v1/researching/genderless-child-researching-4frame-wheelbase-v2-strip-48x64.png';
import genderlessSyncingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/actions/v1/syncing/genderless-child-syncing-4frame-wheelbase-v2-strip-48x64.png';
import genderlessWritingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/actions/v1/writing/genderless-child-writing-4frame-wheelbase-v2-strip-48x64.png';
import girlIdleUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/idle/girl-child-idle-wheelbase-v2-strip-48x64.png';
import girlMoveUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/moving/v1/girl-child-move-8dir-4frame-wheelbase-v2-48x64.png';
import girlExecutingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/actions/v1/executing/girl-child-executing-4frame-wheelbase-v2-strip-48x64.png';
import girlResearchingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/actions/v1/researching/girl-child-researching-4frame-wheelbase-v2-strip-48x64.png';
import girlSyncingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/actions/v1/syncing/girl-child-syncing-4frame-wheelbase-v2-strip-48x64.png';
import girlWritingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/actions/v1/writing/girl-child-writing-4frame-wheelbase-v2-strip-48x64.png';
import {
  AGENT_TARGET_TILES,
  AgentTaskState,
  CharacterId,
  DIRECTION_ORDER,
  Direction,
  directionFromDelta,
  findPath,
  pointToTile,
  Point,
  STATE_ARRIVAL_OFFSET_Y,
  STATE_CONFIG,
  tileToAnchor,
  WALKABILITY,
  WORLD_SIZE,
} from '@/lib/classroom-runtime';

const FRAME_SIZE = { width: 48, height: 64 } as const;
const MOVE_FRAME_MS = 125;
const MOVE_SPEED_PX_PER_SECOND = 70;

const STATE_FRAME_MS: Record<AgentTaskState, number> = {
  idle: 220,
  writing: 200,
  researching: 220,
  executing: 180,
  syncing: 200,
};

type ImageKey =
  | 'foundation'
  | 'readingBookshelf'
  | 'readingBookBin'
  | 'blockTable'
  | 'toyBin'
  | 'writingTable'
  | 'syncMailStation'
  | 'boyIdle'
  | 'boyMove'
  | 'boyResearching'
  | 'boyWriting'
  | 'boyExecuting'
  | 'boySyncing'
  | 'girlIdle'
  | 'girlMove'
  | 'girlResearching'
  | 'girlWriting'
  | 'girlExecuting'
  | 'girlSyncing'
  | 'genderlessIdle'
  | 'genderlessMove'
  | 'genderlessResearching'
  | 'genderlessWriting'
  | 'genderlessExecuting'
  | 'genderlessSyncing';

interface AgentSpec {
  id: string;
  character: CharacterId;
  name: string;
  role: string;
  color: string;
  spawn: Point;
  footprint: readonly [number, number];
  movingImage: ImageKey;
  stateImages: Record<AgentTaskState, ImageKey>;
}

interface RuntimeAgent extends AgentSpec {
  x: number;
  y: number;
  direction: Direction;
  moving: boolean;
  taskState: AgentTaskState;
  path: Point[];
  pathIndex: number;
  routeLength: number;
}

interface AgentView {
  id: string;
  name: string;
  role: string;
  color: string;
  taskState: AgentTaskState;
  direction: Direction;
  moving: boolean;
  routeLength: number;
}

const AGENT_SPECS: readonly AgentSpec[] = [
  {
    id: 'agent-scout',
    character: 'boy',
    name: '小探',
    role: 'Research agent',
    color: '#1677b8',
    spawn: { x: 96, y: 232 },
    footprint: [30, 6],
    movingImage: 'boyMove',
    stateImages: {
      idle: 'boyIdle',
      writing: 'boyWriting',
      researching: 'boyResearching',
      executing: 'boyExecuting',
      syncing: 'boySyncing',
    },
  },
  {
    id: 'agent-bloom',
    character: 'girl',
    name: '小花',
    role: 'Writing agent',
    color: '#df4c5e',
    spawn: { x: 256, y: 232 },
    footprint: [26, 6],
    movingImage: 'girlMove',
    stateImages: {
      idle: 'girlIdle',
      writing: 'girlWriting',
      researching: 'girlResearching',
      executing: 'girlExecuting',
      syncing: 'girlSyncing',
    },
  },
  {
    id: 'agent-spark',
    character: 'genderless',
    name: '小光',
    role: 'Execution agent',
    color: '#6576d8',
    spawn: { x: 416, y: 232 },
    footprint: [30, 6],
    movingImage: 'genderlessMove',
    stateImages: {
      idle: 'genderlessIdle',
      writing: 'genderlessWriting',
      researching: 'genderlessResearching',
      executing: 'genderlessExecuting',
      syncing: 'genderlessSyncing',
    },
  },
] as const;

const PROP_SPECS = [
  {
    id: 'reading-bookshelf',
    image: 'readingBookshelf' as const,
    x: 24,
    y: 40,
    sortY: 84,
    stableOrder: 10,
  },
  {
    id: 'reading-book-bin',
    image: 'readingBookBin' as const,
    x: 128,
    y: 44,
    sortY: 84,
    stableOrder: 20,
  },
  {
    id: 'writing-table',
    image: 'writingTable' as const,
    x: 208,
    y: 56,
    sortY: 112,
    stableOrder: 30,
  },
  {
    id: 'block-table',
    image: 'blockTable' as const,
    x: 352,
    y: 56,
    sortY: 112,
    stableOrder: 40,
  },
  {
    id: 'toy-bin',
    image: 'toyBin' as const,
    x: 456,
    y: 64,
    sortY: 112,
    stableOrder: 50,
  },
  {
    id: 'sync-mail-station',
    image: 'syncMailStation' as const,
    x: 304,
    y: 200,
    sortY: 248,
    stableOrder: 60,
  },
] as const;

const IMAGE_URLS: Record<ImageKey, string> = {
  foundation: foundationUrl.src,
  readingBookshelf: readingBookshelfUrl.src,
  readingBookBin: readingBookBinUrl.src,
  blockTable: blockTableUrl.src,
  toyBin: toyBinUrl.src,
  writingTable: writingTableUrl.src,
  syncMailStation: syncMailStationUrl.src,
  boyIdle: boyIdleUrl.src,
  boyMove: boyMoveUrl.src,
  boyResearching: boyResearchingUrl.src,
  boyWriting: boyWritingUrl.src,
  boyExecuting: boyExecutingUrl.src,
  boySyncing: boySyncingUrl.src,
  girlIdle: girlIdleUrl.src,
  girlMove: girlMoveUrl.src,
  girlResearching: girlResearchingUrl.src,
  girlWriting: girlWritingUrl.src,
  girlExecuting: girlExecutingUrl.src,
  girlSyncing: girlSyncingUrl.src,
  genderlessIdle: genderlessIdleUrl.src,
  genderlessMove: genderlessMoveUrl.src,
  genderlessResearching: genderlessResearchingUrl.src,
  genderlessWriting: genderlessWritingUrl.src,
  genderlessExecuting: genderlessExecutingUrl.src,
  genderlessSyncing: genderlessSyncingUrl.src,
};

function createAgents(): RuntimeAgent[] {
  return AGENT_SPECS.map((spec) => ({
    ...spec,
    x: spec.spawn.x,
    y: spec.spawn.y,
    direction: 'down',
    moving: false,
    taskState: 'idle',
    path: [],
    pathIndex: 0,
    routeLength: 0,
  }));
}

function toAgentViews(agents: RuntimeAgent[]): AgentView[] {
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    color: agent.color,
    taskState: agent.taskState,
    direction: agent.direction,
    moving: agent.moving,
    routeLength: agent.routeLength,
  }));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法载入场景资源：${url}`));
    image.src = url;
  });
}

export default function ClassroomSimulation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentsRef = useRef<RuntimeAgent[]>(createAgents());
  const imagesRef = useRef<Partial<Record<ImageKey, HTMLImageElement>>>({});
  const debugRef = useRef(false);
  const [agentViews, setAgentViews] = useState<AgentView[]>(() =>
    toAgentViews(agentsRef.current),
  );
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [debug, setDebug] = useState(false);
  const [autoMode, setAutoMode] = useState(false);

  useEffect(() => {
    debugRef.current = debug;
  }, [debug]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      (Object.entries(IMAGE_URLS) as [ImageKey, string][]).map(
        async ([key, url]) => [key, await loadImage(url)] as const,
      ),
    )
      .then((entries) => {
        if (cancelled) return;
        imagesRef.current = Object.fromEntries(entries) as Record<
          ImageKey,
          HTMLImageElement
        >;
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : '场景资源载入失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const commandAgent = useCallback((agentId: string, state: AgentTaskState) => {
    const agent = agentsRef.current.find((candidate) => candidate.id === agentId);
    if (!agent) return false;

    const start = pointToTile({ x: agent.x, y: agent.y });
    const goal = AGENT_TARGET_TILES[state][agent.character];
    const route = findPath(start, goal);
    if (route.length === 0) {
      setRouteError(`${agent.name} 无法到达${STATE_CONFIG[state].location}`);
      return false;
    }

    const baseTarget = tileToAnchor(goal);
    const finalTarget = {
      x: baseTarget.x,
      y: baseTarget.y + STATE_ARRIVAL_OFFSET_Y[state],
    };

    const waypoints = route.slice(1).map(tileToAnchor);
    if (waypoints.length > 0) {
      waypoints[waypoints.length - 1] = finalTarget;
    }

    agent.taskState = state;
    agent.path = waypoints;
    agent.pathIndex = 0;
    agent.routeLength = Math.max(0, route.length - 1);
    agent.moving = waypoints.length > 0;
    if (!agent.moving) {
      agent.x = finalTarget.x;
      agent.y = finalTarget.y;
    }
    setRouteError(null);
    setAgentViews(toAgentViews(agentsRef.current));
    return true;
  }, []);

  const commandAll = useCallback(
    (state: AgentTaskState) => {
      for (const agent of agentsRef.current) commandAgent(agent.id, state);
    },
    [commandAgent],
  );

  useEffect(() => {
    if (!autoMode) return;
    const sequence: AgentTaskState[] = [
      'writing',
      'researching',
      'executing',
      'syncing',
      'idle',
    ];
    let index = 0;
    const advance = () => {
      commandAll(sequence[index]);
      index = (index + 1) % sequence.length;
    };
    advance();
    const timer = window.setInterval(advance, 6500);
    return () => window.clearInterval(timer);
  }, [autoMode, commandAll]);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const images = imagesRef.current as Record<ImageKey, HTMLImageElement>;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let animationFrame = 0;
    let previousTime = performance.now();
    let previousUiUpdate = previousTime;

    const render = (time: number) => {
      const deltaSeconds = Math.min(0.05, (time - previousTime) / 1000);
      previousTime = time;

      for (const agent of agentsRef.current) {
        if (!agent.moving) continue;
        const waypoint = agent.path[agent.pathIndex];
        if (!waypoint) {
          agent.moving = false;
          continue;
        }

        const dx = waypoint.x - agent.x;
        const dy = waypoint.y - agent.y;
        const distance = Math.hypot(dx, dy);
        const step = MOVE_SPEED_PX_PER_SECOND * deltaSeconds;
        agent.direction =
          Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01
            ? directionFromDelta(dx, dy)
            : agent.direction;

        if (distance <= step || distance < 0.1) {
          agent.x = waypoint.x;
          agent.y = waypoint.y;
          agent.pathIndex += 1;
          if (agent.pathIndex >= agent.path.length) agent.moving = false;
        } else {
          agent.x += (dx / distance) * step;
          agent.y += (dy / distance) * step;
        }
      }

      context.clearRect(0, 0, WORLD_SIZE.width, WORLD_SIZE.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(images.foundation, 0, 0);

      if (debugRef.current) {
        context.save();
        for (let row = 0; row < WALKABILITY.length; row += 1) {
          for (let column = 0; column < WALKABILITY[row].length; column += 1) {
            context.fillStyle =
              WALKABILITY[row][column] === 1
                ? 'rgba(42, 186, 122, 0.10)'
                : 'rgba(211, 54, 63, 0.09)';
            context.fillRect(column * 32, row * 32, 32, 32);
            context.strokeStyle = 'rgba(32, 86, 113, 0.17)';
            context.strokeRect(column * 32 + 0.5, row * 32 + 0.5, 31, 31);
          }
        }
        for (const agent of agentsRef.current) {
          const remaining = agent.path.slice(agent.pathIndex);
          if (remaining.length === 0) continue;
          context.beginPath();
          context.moveTo(agent.x, agent.y);
          for (const waypoint of remaining) context.lineTo(waypoint.x, waypoint.y);
          context.strokeStyle = agent.color;
          context.lineWidth = 2;
          context.stroke();
        }
        context.restore();
      }

      const renderables: {
        sortY: number;
        stableOrder: number;
        draw: () => void;
      }[] = PROP_SPECS.map((prop) => ({
        sortY: prop.sortY,
        stableOrder: prop.stableOrder,
        draw: () => context.drawImage(images[prop.image], prop.x, prop.y),
      }));

      agentsRef.current.forEach((agent, index) => {
        renderables.push({
          sortY: agent.y,
          stableOrder: 100 + index,
          draw: () => {
            const duration = agent.moving
              ? MOVE_FRAME_MS
              : STATE_FRAME_MS[agent.taskState];
            const frame = Math.floor(time / duration) % 4;
            const directionRow = agent.moving
              ? DIRECTION_ORDER.indexOf(agent.direction)
              : 0;
            const source = images[
              agent.moving
                ? agent.movingImage
                : agent.stateImages[agent.taskState]
            ];
            context.drawImage(
              source,
              frame * FRAME_SIZE.width,
              directionRow * FRAME_SIZE.height,
              FRAME_SIZE.width,
              FRAME_SIZE.height,
              Math.round(agent.x - 24),
              Math.round(agent.y - 64),
              FRAME_SIZE.width,
              FRAME_SIZE.height,
            );

            if (debugRef.current) {
              context.strokeStyle = agent.color;
              context.lineWidth = 1;
              context.strokeRect(
                Math.round(agent.x - agent.footprint[0] / 2) + 0.5,
                Math.round(agent.y - agent.footprint[1]) + 0.5,
                agent.footprint[0] - 1,
                agent.footprint[1] - 1,
              );
            }
          },
        });
      });

      renderables
        .sort((first, second) =>
          first.sortY === second.sortY
            ? first.stableOrder - second.stableOrder
            : first.sortY - second.sortY,
        )
        .forEach((renderable) => renderable.draw());

      if (time - previousUiUpdate > 160) {
        setAgentViews(toAgentViews(agentsRef.current));
        previousUiUpdate = time;
      }
      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [ready]);

  const handleAllState = (state: AgentTaskState) => {
    setAutoMode(false);
    commandAll(state);
  };

  const handleAgentState = (agentId: string, state: AgentTaskState) => {
    setAutoMode(false);
    commandAgent(agentId, state);
  };

  const reset = () => {
    setAutoMode(false);
    agentsRef.current = createAgents();
    setRouteError(null);
    setAgentViews(toAgentViews(agentsRef.current));
  };

  return (
    <section className="simulationSection" aria-labelledby="simulation-title">
      <div className="sectionHeading">
        <div>
          <p className="eyebrow">Runtime vertical slice</p>
          <h2 id="simulation-title">教室运行时</h2>
          <p>状态指令会转换成目标区域、A* 路径、8 方向动画和到达后的专用动作。</p>
        </div>
        <div className="runtimeBadges" aria-label="运行时规格">
          <span>512×288</span>
          <span>32px grid</span>
          <span>8 directions</span>
        </div>
      </div>

      <div className="simulationShell">
        <div className="sceneColumn">
          <div className="sceneViewport">
            <canvas
              ref={canvasRef}
              width={WORLD_SIZE.width}
              height={WORLD_SIZE.height}
              aria-label="三名 AI agent 在教室写画桌、阅读角和积木区之间移动的实时场景"
            />
            {!ready && !loadError && <div className="sceneLoading">正在载入运行时资源…</div>}
            {loadError && <div className="sceneLoading sceneError">{loadError}</div>}
          </div>

          <div className="sceneToolbar" aria-label="场景控制">
            <div className="commandGroup">
              <span className="toolbarLabel">全体指令</span>
              {(Object.keys(STATE_CONFIG) as AgentTaskState[]).map((state) => (
                <button
                  className={`commandButton command-${state}`}
                  key={state}
                  type="button"
                  onClick={() => handleAllState(state)}
                  disabled={!ready}
                >
                  {STATE_CONFIG[state].label}
                </button>
              ))}
            </div>
            <div className="utilityGroup">
              <button
                className={`utilityButton ${autoMode ? 'isActive' : ''}`}
                type="button"
                onClick={() => setAutoMode((current) => !current)}
                disabled={!ready}
                aria-pressed={autoMode}
              >
                {autoMode ? '停止演示' : '自动演示'}
              </button>
              <button
                className={`utilityButton ${debug ? 'isActive' : ''}`}
                type="button"
                onClick={() => setDebug((current) => !current)}
                aria-pressed={debug}
              >
                路径调试
              </button>
              <button className="utilityButton" type="button" onClick={reset}>
                重置
              </button>
            </div>
          </div>
          {routeError && <p className="routeError" role="alert">{routeError}</p>}
        </div>

        <aside className="agentPanel" aria-label="Agent 状态">
          {agentViews.map((agent) => {
            const state = STATE_CONFIG[agent.taskState];
            return (
              <article className="agentCard" key={agent.id}>
                <div className="agentCardHeader">
                  <span className="agentDot" style={{ background: agent.color }} />
                  <div>
                    <h3>{agent.name}</h3>
                    <p>{agent.role}</p>
                  </div>
                  <span className={`motionStatus ${agent.moving ? 'isMoving' : ''}`}>
                    {agent.moving ? '移动中' : '已到达'}
                  </span>
                </div>
                <div className="agentStateLine">
                  <strong>{state.shortLabel}</strong>
                  <span>{state.location}</span>
                </div>
                <p className="agentMeta">
                  {agent.moving
                    ? `${agent.routeLength} 格路径 · ${agent.direction}`
                    : state.arrivalAnimation}
                </p>
                <div className="agentCommands" aria-label={`${agent.name}状态指令`}>
                  {(Object.keys(STATE_CONFIG) as AgentTaskState[]).map((stateId) => (
                    <button
                      key={stateId}
                      type="button"
                      className={agent.taskState === stateId ? 'isSelected' : ''}
                      onClick={() => handleAgentState(agent.id, stateId)}
                      disabled={!ready}
                    >
                      {STATE_CONFIG[stateId].label}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </aside>
      </div>
    </section>
  );
}
