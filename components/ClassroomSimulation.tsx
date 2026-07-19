'use client';

import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import foundationUrl from '@/assets/design/maps/classroom-corner/art/v1/classroom-corner-foundation-512x288.png';
import blockTableUrl from '@/assets/design/maps/classroom-corner/props/block-table/v2/block-table-96x56-left-to-right.png';
import diagnosticRepairStationUrl from '@/assets/design/maps/classroom-corner/props/diagnostic-repair-station/v1/diagnostic-repair-station-96x48.png';
import entranceDoorClosedUrl from '@/assets/design/maps/classroom-corner/props/entrance-door/v1/entrance-door-closed-64x72.png';
import entranceDoorOpenUrl from '@/assets/design/maps/classroom-corner/props/entrance-door/v1/entrance-door-open-64x72.png';
import readingBookBinUrl from '@/assets/design/maps/classroom-corner/props/reading-book-bin/v1/reading-book-bin-48x40.png';
import readingBookshelfUrl from '@/assets/design/maps/classroom-corner/props/reading-bookshelf/v1/reading-bookshelf-96x44.png';
import syncMailStationUrl from '@/assets/design/maps/classroom-corner/props/sync-mail-station/v1/sync-mail-station-96x48.png';
import toyBinUrl from '@/assets/design/maps/classroom-corner/props/toy-bin/v2/toy-bin-40x48-left-to-right.png';
import writingTableUrl from '@/assets/design/maps/classroom-corner/props/writing-table/v1/writing-table-96x56.png';
import boyIdleUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/idle/boy-child-idle-wheelbase-v2-strip-48x64.png';
import boyMoveUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/moving/v1/boy-child-move-8dir-4frame-wheelbase-v2-48x64.png';
import boyExecutingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/actions/v1/executing/boy-child-executing-4frame-wheelbase-v2-strip-48x64.png';
import boyErrorUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/actions/v1/error/boy-child-error-4frame-wheelbase-v2-strip-48x64.png';
import boyResearchingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/actions/v1/researching/boy-child-researching-4frame-wheelbase-v2-strip-48x64.png';
import boySyncingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/actions/v1/syncing/boy-child-syncing-4frame-wheelbase-v2-strip-48x64.png';
import boyWritingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-boy/actions/v1/writing/boy-child-writing-4frame-wheelbase-v2-strip-48x64.png';
import genderlessIdleUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/idle/genderless-child-idle-wheelbase-v2-strip-48x64.png';
import genderlessMoveUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/moving/v1/genderless-child-move-8dir-4frame-wheelbase-v2-48x64.png';
import genderlessExecutingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/actions/v1/executing/genderless-child-executing-4frame-wheelbase-v2-strip-48x64.png';
import genderlessErrorUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/actions/v1/error/genderless-child-error-4frame-wheelbase-v2-strip-48x64.png';
import genderlessResearchingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/actions/v1/researching/genderless-child-researching-4frame-wheelbase-v2-strip-48x64.png';
import genderlessSyncingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/actions/v1/syncing/genderless-child-syncing-4frame-wheelbase-v2-strip-48x64.png';
import genderlessWritingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-genderless/actions/v1/writing/genderless-child-writing-4frame-wheelbase-v2-strip-48x64.png';
import girlIdleUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/idle/girl-child-idle-wheelbase-v2-strip-48x64.png';
import girlMoveUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/moving/v1/girl-child-move-8dir-4frame-wheelbase-v2-48x64.png';
import girlExecutingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/actions/v1/executing/girl-child-executing-4frame-wheelbase-v2-strip-48x64.png';
import girlErrorUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/actions/v1/error/girl-child-error-4frame-wheelbase-v2-strip-48x64.png';
import girlResearchingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/actions/v1/researching/girl-child-researching-4frame-wheelbase-v2-strip-48x64.png';
import girlSyncingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/actions/v1/syncing/girl-child-syncing-4frame-wheelbase-v2-strip-48x64.png';
import girlWritingUrl from '@/assets/design/sprites/characters/v2/ai-agent-child-girl/actions/v1/writing/girl-child-writing-4frame-wheelbase-v2-strip-48x64.png';
import {
  AgentEventAdapter,
  AgentEventSource,
  AgentPresenceEvent,
  AgentRuntimeEvent,
  AgentStateEvent,
  createMockAgentEventAdapter,
  parseAgentRuntimeEvent,
} from '@/lib/agent-event-contract';
import {
  AgentProfile,
  parseAgentProfile,
} from '@/lib/agent-registry-contract';
import {
  ACTIVITY_REGIONS,
  ActivityRegionFullError,
  AGENT_GROUND_OCCUPANCY,
  AGENT_TASK_STATES,
  AgentTaskState,
  activityRegionTargets,
  CharacterId,
  DIRECTION_ORDER,
  Direction,
  directionFromDelta,
  findPath,
  pointToTile,
  Point,
  PLAYER_ENTRY_LANDING,
  PLAYER_ENTRY_LANDING_TILE,
  PLAYER_JOIN_SPAWN,
  PLAYER_JOIN_SPAWN_TILE,
  STATE_CONFIG,
  selectActivityTarget,
  TILE_SIZE,
  tileToAnchor,
  WALKABILITY,
  WORLD_SIZE,
} from '@/lib/classroom-runtime';

const FRAME_SIZE = { width: 48, height: 64 } as const;
const MOVE_FRAME_MS = 125;
const MOVE_SPEED_PX_PER_SECOND = 70;
const DOOR_POSITION = { x: 296, y: 0 } as const;
const DOOR_TRANSITION_MS = 360;
const DOOR_OPEN_HOLD_MS = 1500;
const JOIN_STAGGER_MS = 2700;
const LEAVE_STAGGER_MS = 4200;
const NAME_TAG_FONT = '700 9px ui-sans-serif, system-ui, sans-serif';
const NAME_TAG_HEIGHT = 15;
const NAME_TAG_MAX_TEXT_WIDTH = 96;
const NAME_TAG_HORIZONTAL_PADDING = 6;
const NAME_TAG_VERTICAL_GAP = 3;
const NAME_TAG_EDGE_MARGIN = 2;

const RUNTIME_STEPS = [
  ['State', '任务状态转换为明确的场景目标'],
  ['Route', '在 32px 网格上用 8 邻域 A* 计算路径'],
  ['Move', '按路径向量切换 8 方向移动动画'],
  ['Render', '通过轮底锚点和实时 Y-sort 完成遮挡'],
] as const;

type DoorPhase = 'closed' | 'opening' | 'open' | 'closing';

interface DoorState {
  phase: DoorPhase;
  phaseStartedAt: number;
}

const STATE_FRAME_MS: Record<AgentTaskState, number> = {
  idle: 220,
  writing: 200,
  researching: 220,
  executing: 180,
  syncing: 200,
  error: 240,
};

const REGION_CAPACITIES = Object.fromEntries(
  AGENT_TASK_STATES.map((state) => [state, activityRegionTargets(state).length]),
) as Record<AgentTaskState, number>;

type ImageKey =
  | 'foundation'
  | 'entranceDoorClosed'
  | 'entranceDoorOpen'
  | 'readingBookshelf'
  | 'readingBookBin'
  | 'blockTable'
  | 'diagnosticRepairStation'
  | 'toyBin'
  | 'writingTable'
  | 'syncMailStation'
  | 'boyIdle'
  | 'boyMove'
  | 'boyResearching'
  | 'boyWriting'
  | 'boyExecuting'
  | 'boyError'
  | 'boySyncing'
  | 'girlIdle'
  | 'girlMove'
  | 'girlResearching'
  | 'girlWriting'
  | 'girlExecuting'
  | 'girlError'
  | 'girlSyncing'
  | 'genderlessIdle'
  | 'genderlessMove'
  | 'genderlessResearching'
  | 'genderlessWriting'
  | 'genderlessExecuting'
  | 'genderlessError'
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
  visible: boolean;
  targetPoint: Point | null;
  waitingForState: AgentTaskState | null;
  onArrival: (() => void) | null;
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
  visible: boolean;
  waitingForState: AgentTaskState | null;
}

interface EventStatusView {
  eventId: string;
  type: AgentRuntimeEvent['type'];
  source: AgentEventSource;
  sequence: number;
  agentId: string;
  detail: string;
}

function fitCanvasText(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
): string {
  if (context.measureText(value).width <= maxWidth) return value;

  const characters = Array.from(value);
  const ellipsis = '…';
  let lower = 0;
  let upper = characters.length;

  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    const candidate = `${characters.slice(0, middle).join('')}${ellipsis}`;
    if (context.measureText(candidate).width <= maxWidth) lower = middle;
    else upper = middle - 1;
  }

  return `${characters.slice(0, lower).join('')}${ellipsis}`;
}

function drawAgentNameTag(
  context: CanvasRenderingContext2D,
  agent: RuntimeAgent,
) {
  context.save();
  context.font = NAME_TAG_FONT;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const label = fitCanvasText(
    context,
    agent.name,
    NAME_TAG_MAX_TEXT_WIDTH,
  );
  const width = Math.ceil(context.measureText(label).width) +
    NAME_TAG_HORIZONTAL_PADDING * 2;
  const preferredX = Math.round(agent.x - width / 2);
  const x = Math.max(
    NAME_TAG_EDGE_MARGIN,
    Math.min(
      WORLD_SIZE.width - width - NAME_TAG_EDGE_MARGIN,
      preferredX,
    ),
  );
  const y = Math.max(
    NAME_TAG_EDGE_MARGIN,
    Math.round(
      agent.y - FRAME_SIZE.height - NAME_TAG_VERTICAL_GAP - NAME_TAG_HEIGHT,
    ),
  );
  const pointerX = Math.max(x + 6, Math.min(x + width - 6, agent.x));

  context.fillStyle = 'rgba(255, 255, 255, 0.94)';
  context.strokeStyle = agent.color;
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x + 0.5, y + 0.5, width - 1, NAME_TAG_HEIGHT - 1, 4);
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(pointerX - 3, y + NAME_TAG_HEIGHT - 1);
  context.lineTo(pointerX, y + NAME_TAG_HEIGHT + 2);
  context.lineTo(pointerX + 3, y + NAME_TAG_HEIGHT - 1);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = '#17324a';
  context.fillText(label, x + width / 2, y + NAME_TAG_HEIGHT / 2 + 0.5);
  context.restore();
}

const CHARACTER_ASSETS: Record<
  CharacterId,
  Pick<AgentSpec, 'movingImage' | 'stateImages'>
> = {
  boy: {
    movingImage: 'boyMove',
    stateImages: {
      idle: 'boyIdle',
      writing: 'boyWriting',
      researching: 'boyResearching',
      executing: 'boyExecuting',
      syncing: 'boySyncing',
      error: 'boyError',
    },
  },
  girl: {
    movingImage: 'girlMove',
    stateImages: {
      idle: 'girlIdle',
      writing: 'girlWriting',
      researching: 'girlResearching',
      executing: 'girlExecuting',
      syncing: 'girlSyncing',
      error: 'girlError',
    },
  },
  genderless: {
    movingImage: 'genderlessMove',
    stateImages: {
      idle: 'genderlessIdle',
      writing: 'genderlessWriting',
      researching: 'genderlessResearching',
      executing: 'genderlessExecuting',
      syncing: 'genderlessSyncing',
      error: 'genderlessError',
    },
  },
};

function colorFromAgentId(agentId: string): string {
  let hash = 0;
  for (let index = 0; index < agentId.length; index += 1) {
    hash = (hash * 31 + agentId.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 55% 48%)`;
}

function profileToAgentSpec(profile: AgentProfile): AgentSpec {
  const assets = CHARACTER_ASSETS[profile.characterVariant];
  return {
    id: profile.agentId,
    character: profile.characterVariant,
    name: profile.displayName,
    role: profile.role ?? 'AI agent',
    color: profile.color ?? colorFromAgentId(profile.agentId),
    spawn: PLAYER_JOIN_SPAWN,
    footprint: [AGENT_GROUND_OCCUPANCY.width, AGENT_GROUND_OCCUPANCY.height],
    movingImage: assets.movingImage,
    stateImages: assets.stateImages,
  };
}

const PROP_SPECS = [
  {
    id: 'reading-bookshelf',
    image: 'readingBookshelf' as const,
    x: 24,
    y: 40,
    sortY: 84,
    stableOrder: 10,
    width: 96,
    height: 44,
    actionState: 'researching' as const,
  },
  {
    id: 'reading-book-bin',
    image: 'readingBookBin' as const,
    x: 128,
    y: 44,
    sortY: 84,
    stableOrder: 20,
    width: 48,
    height: 40,
    actionState: 'researching' as const,
  },
  {
    id: 'writing-table',
    image: 'writingTable' as const,
    x: 200,
    y: 56,
    sortY: 112,
    stableOrder: 30,
    width: 96,
    height: 56,
    actionState: 'writing' as const,
  },
  {
    id: 'block-table',
    image: 'blockTable' as const,
    x: 360,
    y: 56,
    sortY: 112,
    stableOrder: 40,
    width: 96,
    height: 56,
    actionState: 'executing' as const,
  },
  {
    id: 'toy-bin',
    image: 'toyBin' as const,
    x: 464,
    y: 64,
    sortY: 112,
    stableOrder: 50,
    width: 40,
    height: 48,
    actionState: 'executing' as const,
  },
  {
    id: 'diagnostic-repair-station',
    image: 'diagnosticRepairStation' as const,
    x: 144,
    y: 200,
    sortY: 248,
    stableOrder: 60,
    width: 96,
    height: 48,
    actionState: 'error' as const,
  },
  {
    id: 'sync-mail-station',
    image: 'syncMailStation' as const,
    x: 304,
    y: 200,
    sortY: 248,
    stableOrder: 70,
    width: 96,
    height: 48,
    actionState: 'syncing' as const,
  },
] as const;

const IMAGE_URLS: Record<ImageKey, string> = {
  foundation: foundationUrl.src,
  entranceDoorClosed: entranceDoorClosedUrl.src,
  entranceDoorOpen: entranceDoorOpenUrl.src,
  readingBookshelf: readingBookshelfUrl.src,
  readingBookBin: readingBookBinUrl.src,
  blockTable: blockTableUrl.src,
  diagnosticRepairStation: diagnosticRepairStationUrl.src,
  toyBin: toyBinUrl.src,
  writingTable: writingTableUrl.src,
  syncMailStation: syncMailStationUrl.src,
  boyIdle: boyIdleUrl.src,
  boyMove: boyMoveUrl.src,
  boyResearching: boyResearchingUrl.src,
  boyWriting: boyWritingUrl.src,
  boyExecuting: boyExecutingUrl.src,
  boyError: boyErrorUrl.src,
  boySyncing: boySyncingUrl.src,
  girlIdle: girlIdleUrl.src,
  girlMove: girlMoveUrl.src,
  girlResearching: girlResearchingUrl.src,
  girlWriting: girlWritingUrl.src,
  girlExecuting: girlExecutingUrl.src,
  girlError: girlErrorUrl.src,
  girlSyncing: girlSyncingUrl.src,
  genderlessIdle: genderlessIdleUrl.src,
  genderlessMove: genderlessMoveUrl.src,
  genderlessResearching: genderlessResearchingUrl.src,
  genderlessWriting: genderlessWritingUrl.src,
  genderlessExecuting: genderlessExecutingUrl.src,
  genderlessError: genderlessErrorUrl.src,
  genderlessSyncing: genderlessSyncingUrl.src,
};

function createAgents(profiles: readonly AgentProfile[]): RuntimeAgent[] {
  return profiles.map((profile) => ({
    ...profileToAgentSpec(profile),
    x: PLAYER_JOIN_SPAWN.x,
    y: PLAYER_JOIN_SPAWN.y,
    direction: 'down',
    moving: false,
    taskState: 'idle',
    path: [],
    pathIndex: 0,
    routeLength: 0,
    visible: false,
    targetPoint: null,
    waitingForState: null,
    onArrival: null,
  }));
}

function updateAgentFromProfile(agent: RuntimeAgent, profile: AgentProfile) {
  const spec = profileToAgentSpec(profile);
  agent.character = spec.character;
  agent.name = spec.name;
  agent.role = spec.role;
  agent.color = spec.color;
  agent.footprint = spec.footprint;
  agent.movingImage = spec.movingImage;
  agent.stateImages = spec.stateImages;
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
    visible: agent.visible,
    waitingForState: agent.waitingForState,
  }));
}

function removeAgentFromWaitQueues(
  waitQueues: Map<AgentTaskState, string[]>,
  agentId: string,
) {
  for (const state of AGENT_TASK_STATES) {
    const queue = waitQueues.get(state);
    if (!queue) continue;
    const nextQueue = queue.filter((candidate) => candidate !== agentId);
    if (nextQueue.length > 0) waitQueues.set(state, nextQueue);
    else waitQueues.delete(state);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法载入场景资源：${url}`));
    image.src = url;
  });
}

interface ClassroomSimulationProps {
  initialIsAdmin: boolean;
}

export default function ClassroomSimulation({
  initialIsAdmin,
}: ClassroomSimulationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const profilesRef = useRef(new Map<string, AgentProfile>());
  const agentsRef = useRef<RuntimeAgent[]>([]);
  const imagesRef = useRef<Partial<Record<ImageKey, HTMLImageElement>>>({});
  const debugRef = useRef(false);
  const doorRef = useRef<DoorState>({ phase: 'closed', phaseStartedAt: 0 });
  const eventTimersRef = useRef<number[]>([]);
  const waitQueuesRef = useRef(new Map<AgentTaskState, string[]>());
  const drainingQueuesRef = useRef(false);
  const applyAgentStateRef = useRef<
    (agentId: string, state: AgentTaskState) => boolean
  >(() => false);
  const drainWaitQueuesRef = useRef<() => void>(() => {});
  const mockAdapterRef = useRef<AgentEventAdapter | null>(null);
  const dispatchEventRef = useRef<(input: unknown) => boolean>(() => false);
  const lastSequenceRef = useRef(new Map<string, number>());
  const seenEventIdsRef = useRef(new Set<string>());
  const pendingStateRef = useRef(new Map<string, AgentStateEvent>());
  const externalPresenceAgentsRef = useRef(new Set<string>());
  const externalStateAgentsRef = useRef(new Set<string>());
  if (!mockAdapterRef.current) {
    mockAdapterRef.current = createMockAgentEventAdapter();
  }
  const [agentViews, setAgentViews] = useState<AgentView[]>(() =>
    toAgentViews(agentsRef.current),
  );
  const [profilesReady, setProfilesReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventStatus, setEventStatus] = useState<EventStatusView | null>(null);
  const [eventStreamStatus, setEventStreamStatus] = useState<
    'connecting' | 'live' | 'retrying' | 'unsupported'
  >('connecting');
  const [registryStreamStatus, setRegistryStreamStatus] = useState<
    'connecting' | 'live' | 'retrying' | 'unsupported'
  >('connecting');
  const [debug, setDebug] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [sceneActionStatus, setSceneActionStatus] = useState<string | null>(null);
  const [presenceTransition, setPresenceTransition] = useState<
    'joining' | 'leaving' | null
  >(null);
  const [isAdmin, setIsAdmin] = useState(initialIsAdmin);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminPromptOpen, setAdminPromptOpen] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [adminAuthBusy, setAdminAuthBusy] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);

  useEffect(() => {
    debugRef.current = debug;
  }, [debug]);

  const reconcileProfiles = useCallback((profiles: readonly AgentProfile[]) => {
    const existingById = new Map(
      agentsRef.current.map((agent) => [agent.id, agent] as const),
    );
    const registeredIds = new Set(profiles.map((profile) => profile.agentId));
    for (const agentId of Array.from(existingById.keys())) {
      if (!registeredIds.has(agentId)) {
        removeAgentFromWaitQueues(waitQueuesRef.current, agentId);
      }
    }
    profilesRef.current = new Map(
      profiles.map((profile) => [profile.agentId, profile] as const),
    );
    agentsRef.current = profiles.map((profile) => {
      const existing = existingById.get(profile.agentId);
      if (existing) {
        updateAgentFromProfile(existing, profile);
        return existing;
      }
      return createAgents([profile])[0];
    });
    setSelectedAgentId((current) =>
      profiles.some((profile) => profile.agentId === current)
        ? current
        : (profiles[0]?.agentId ?? ''),
    );
    setAgentViews(toAgentViews(agentsRef.current));
    queueMicrotask(() => drainWaitQueuesRef.current());
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadProfiles = async () => {
      const response = await fetch('/api/agents', { cache: 'no-store' });
      if (!response.ok) throw new Error('无法读取 Agent Registry');
      const payload = (await response.json()) as { profiles?: unknown };
      if (!Array.isArray(payload.profiles)) {
        throw new Error('Agent Registry 返回格式无效');
      }
      const profiles: AgentProfile[] = [];
      for (const candidate of payload.profiles) {
        const parsed = parseAgentProfile(candidate);
        if (!parsed.ok) throw new Error(parsed.error);
        profiles.push(parsed.profile);
      }
      if (cancelled) return;
      reconcileProfiles(profiles);
      setProfilesReady(true);
    };

    void loadProfiles().catch((error: unknown) => {
      if (cancelled) return;
      setLoadError(
        error instanceof Error ? error.message : 'Agent Registry 载入失败',
      );
    });

    if (typeof EventSource === 'undefined') {
      setRegistryStreamStatus('unsupported');
      return () => {
        cancelled = true;
      };
    }

    const stream = new EventSource('/api/agents/stream');
    stream.onopen = () => {
      setRegistryStreamStatus('live');
      void loadProfiles().catch(() => setRegistryStreamStatus('retrying'));
    };
    stream.onmessage = (message) => {
      try {
        const change = JSON.parse(message.data) as {
          type?: unknown;
          agentId?: unknown;
          profile?: unknown;
        };
        const nextProfiles = new Map(profilesRef.current);
        if (change.type === 'agent.profile.upserted') {
          const parsed = parseAgentProfile(change.profile);
          if (!parsed.ok) throw new Error(parsed.error);
          const current = nextProfiles.get(parsed.profile.agentId);
          if (!current || parsed.profile.revision >= current.revision) {
            nextProfiles.set(parsed.profile.agentId, parsed.profile);
          }
        } else if (
          change.type === 'agent.profile.removed' &&
          typeof change.agentId === 'string'
        ) {
          nextProfiles.delete(change.agentId);
        } else {
          return;
        }
        reconcileProfiles(
          Array.from(nextProfiles.values()).sort((first, second) =>
            first.agentId.localeCompare(second.agentId),
          ),
        );
      } catch {
        setRegistryStreamStatus('retrying');
      }
    };
    stream.onerror = () => setRegistryStreamStatus('retrying');
    return () => {
      cancelled = true;
      stream.close();
    };
  }, [reconcileProfiles]);

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

  const clearEventTimers = useCallback(() => {
    for (const timer of eventTimersRef.current) window.clearTimeout(timer);
    eventTimersRef.current = [];
  }, []);

  const scheduleEventTimer = useCallback((delay: number, action: () => void) => {
    eventTimersRef.current.push(window.setTimeout(action, delay));
  }, []);

  const applyAgentState = useCallback((agentId: string, state: AgentTaskState) => {
    const agent = agentsRef.current.find((candidate) => candidate.id === agentId);
    if (!agent || !agent.visible) return false;

    const start = pointToTile({ x: agent.x, y: agent.y });
    const occupiedTargets = agentsRef.current
      .filter(
        (candidate) =>
          candidate.id !== agent.id &&
          candidate.visible &&
          candidate.targetPoint !== null,
      )
      .map((candidate) => candidate.targetPoint)
      .filter((point): point is Point => point !== null);
    let target: ReturnType<typeof selectActivityTarget>;
    try {
      target = selectActivityTarget(state, occupiedTargets);
    } catch (error) {
      if (error instanceof ActivityRegionFullError) {
        const currentQueue = waitQueuesRef.current.get(state) ?? [];
        if (!currentQueue.includes(agent.id)) {
          removeAgentFromWaitQueues(waitQueuesRef.current, agent.id);
          const queue = waitQueuesRef.current.get(state) ?? [];
          queue.push(agent.id);
          waitQueuesRef.current.set(state, queue);
        }
        agent.waitingForState = state;
        setRouteError(null);
        setAgentViews(toAgentViews(agentsRef.current));
        return true;
      }
      setRouteError(error instanceof Error ? error.message : '活动区域没有可用坐标');
      return false;
    }
    const goal = target.tile;
    const route = findPath(start, goal);
    if (route.length === 0) {
      setRouteError(`${agent.name} 无法到达${STATE_CONFIG[state].location}`);
      return false;
    }

    const finalTarget = target.point;

    const waypoints = route.slice(1).map(tileToAnchor);
    if (waypoints.length > 0) {
      waypoints[waypoints.length - 1] = finalTarget;
    }

    removeAgentFromWaitQueues(waitQueuesRef.current, agent.id);
    agent.waitingForState = null;
    agent.taskState = state;
    agent.targetPoint = finalTarget;
    agent.path = waypoints;
    agent.pathIndex = 0;
    agent.routeLength = Math.max(0, route.length - 1);
    agent.moving = waypoints.length > 0;
    agent.onArrival = null;
    if (!agent.moving) {
      agent.x = finalTarget.x;
      agent.y = finalTarget.y;
    }
    setRouteError(null);
    setAgentViews(toAgentViews(agentsRef.current));
    queueMicrotask(() => drainWaitQueuesRef.current());
    return true;
  }, []);

  applyAgentStateRef.current = applyAgentState;

  const drainWaitQueues = useCallback(() => {
    if (drainingQueuesRef.current) return;
    drainingQueuesRef.current = true;
    try {
      for (const state of AGENT_TASK_STATES) {
        while (true) {
          const queue = waitQueuesRef.current.get(state);
          const agentId = queue?.[0];
          if (!agentId) break;
          const agent = agentsRef.current.find(
            (candidate) => candidate.id === agentId,
          );
          if (!agent || !agent.visible || agent.waitingForState !== state) {
            queue?.shift();
            if (queue && queue.length === 0) waitQueuesRef.current.delete(state);
            continue;
          }
          const applied = applyAgentStateRef.current(agentId, state);
          if (!applied || agent.waitingForState === state) break;
        }
      }
    } finally {
      drainingQueuesRef.current = false;
    }
  }, []);

  drainWaitQueuesRef.current = drainWaitQueues;

  const applyPresenceEvent = useCallback(
    (event: AgentPresenceEvent) => {
      const agent = agentsRef.current.find(
        (candidate) => candidate.id === event.agentId,
      );
      if (!agent) {
        setRouteError(`未知 Agent：${event.agentId}`);
        return false;
      }

      if (event.action === 'enter') {
        if (agent.visible) {
          setRouteError(null);
          return true;
        }
        doorRef.current = { phase: 'opening', phaseStartedAt: performance.now() };
        scheduleEventTimer(DOOR_TRANSITION_MS, () => {
          doorRef.current = { phase: 'open', phaseStartedAt: performance.now() };
          const route = findPath(
            PLAYER_JOIN_SPAWN_TILE,
            PLAYER_ENTRY_LANDING_TILE,
          );
          if (route.length === 0) {
            setRouteError(`${agent.name} 无法从入口到达教室落脚点`);
            return;
          }
          const waypoints = route.slice(1).map(tileToAnchor);
          waypoints[waypoints.length - 1] = PLAYER_ENTRY_LANDING;
          agent.x = PLAYER_JOIN_SPAWN.x;
          agent.y = PLAYER_JOIN_SPAWN.y;
          agent.targetPoint = null;
          agent.waitingForState = null;
          agent.direction = 'down';
          agent.path = waypoints;
          agent.pathIndex = 0;
          agent.routeLength = route.length - 1;
          agent.moving = true;
          agent.visible = true;
          agent.onArrival = null;
          setRouteError(null);
          setAgentViews(toAgentViews(agentsRef.current));
          const pendingState = pendingStateRef.current.get(agent.id);
          if (pendingState) {
            pendingStateRef.current.delete(agent.id);
            applyAgentState(agent.id, pendingState.state);
          }
        });
        scheduleEventTimer(DOOR_TRANSITION_MS + DOOR_OPEN_HOLD_MS, () => {
          doorRef.current = { phase: 'closing', phaseStartedAt: performance.now() };
        });
        scheduleEventTimer(DOOR_TRANSITION_MS * 2 + DOOR_OPEN_HOLD_MS, () => {
          doorRef.current = { phase: 'closed', phaseStartedAt: performance.now() };
        });
        return true;
      }

      if (!agent.visible) {
        pendingStateRef.current.delete(agent.id);
        removeAgentFromWaitQueues(waitQueuesRef.current, agent.id);
        agent.waitingForState = null;
        setRouteError(null);
        return true;
      }
      pendingStateRef.current.delete(agent.id);

      const routeToLanding = findPath(
        pointToTile({ x: agent.x, y: agent.y }),
        PLAYER_ENTRY_LANDING_TILE,
      );
      if (routeToLanding.length === 0) {
        setRouteError(`${agent.name} 无法到达教室出口`);
        return false;
      }
      removeAgentFromWaitQueues(waitQueuesRef.current, agent.id);
      agent.waitingForState = null;
      agent.targetPoint = null;
      queueMicrotask(() => drainWaitQueuesRef.current());
      const landingWaypoints = routeToLanding.slice(1).map(tileToAnchor);
      if (landingWaypoints.length > 0) {
        landingWaypoints[landingWaypoints.length - 1] = PLAYER_ENTRY_LANDING;
      }
      agent.path = landingWaypoints;
      agent.pathIndex = 0;
      agent.routeLength = routeToLanding.length - 1;
      agent.moving = landingWaypoints.length > 0;
      agent.onArrival = () => {
        doorRef.current = { phase: 'opening', phaseStartedAt: performance.now() };
        scheduleEventTimer(DOOR_TRANSITION_MS, () => {
          doorRef.current = { phase: 'open', phaseStartedAt: performance.now() };
          const routeToSpawn = findPath(
            PLAYER_ENTRY_LANDING_TILE,
            PLAYER_JOIN_SPAWN_TILE,
          );
          if (routeToSpawn.length === 0) {
            setRouteError(`${agent.name} 无法通过教室出口`);
            return;
          }
          const spawnWaypoints = routeToSpawn.slice(1).map(tileToAnchor);
          spawnWaypoints[spawnWaypoints.length - 1] = PLAYER_JOIN_SPAWN;
          agent.path = spawnWaypoints;
          agent.pathIndex = 0;
          agent.routeLength = routeToSpawn.length - 1;
          agent.moving = true;
          agent.onArrival = () => {
            agent.visible = false;
            agent.moving = false;
            agent.targetPoint = null;
            agent.waitingForState = null;
            agent.path = [];
            agent.pathIndex = 0;
            agent.onArrival = null;
            doorRef.current = {
              phase: 'closing',
              phaseStartedAt: performance.now(),
            };
            scheduleEventTimer(DOOR_TRANSITION_MS, () => {
              doorRef.current = {
                phase: 'closed',
                phaseStartedAt: performance.now(),
              };
            });
            setAgentViews(toAgentViews(agentsRef.current));
          };
          setAgentViews(toAgentViews(agentsRef.current));
        });
      };
      if (!agent.moving) agent.onArrival();
      setRouteError(null);
      setAgentViews(toAgentViews(agentsRef.current));
      return true;
    },
    [applyAgentState, scheduleEventTimer],
  );

  const dispatchAgentEvent = useCallback(
    (input: unknown) => {
      const parsed = parseAgentRuntimeEvent(input);
      if (!parsed.ok) {
        setEventError(`Agent Event API v1 拒绝事件：${parsed.error}`);
        return false;
      }

      const event = parsed.event;
      if (seenEventIdsRef.current.has(event.eventId)) {
        setEventError(null);
        return false;
      }
      const sequenceKey = `${event.source}:${event.agentId}`;
      const lastSequence = lastSequenceRef.current.get(sequenceKey) ?? 0;
      if (event.sequence <= lastSequence) {
        setEventError(null);
        return false;
      }
      seenEventIdsRef.current.add(event.eventId);
      lastSequenceRef.current.set(sequenceKey, event.sequence);
      if (event.source !== 'mock' && event.type === 'agent.state') {
        externalStateAgentsRef.current.add(event.agentId);
      }
      if (event.source !== 'mock' && event.type === 'agent.presence') {
        if (event.action === 'enter') {
          externalPresenceAgentsRef.current.add(event.agentId);
        } else {
          externalPresenceAgentsRef.current.delete(event.agentId);
          externalStateAgentsRef.current.delete(event.agentId);
        }
      }

      let applied: boolean;
      if (event.type === 'agent.state') {
        const agent = agentsRef.current.find(
          (candidate) => candidate.id === event.agentId,
        );
        if (agent && !agent.visible) {
          pendingStateRef.current.set(event.agentId, event);
          applied = true;
        } else {
          applied = applyAgentState(event.agentId, event.state);
        }
      } else {
        applied = applyPresenceEvent(event);
      }
      if (!applied) {
        setEventError(`Agent Event API v1 未能应用事件：${event.eventId}`);
        return false;
      }

      setEventError(null);
      setEventStatus({
        eventId: event.eventId,
        type: event.type,
        source: event.source,
        sequence: event.sequence,
        agentId: event.agentId,
        detail:
          event.type === 'agent.state'
            ? event.state
            : `${event.action}@${event.scenePointId}`,
      });
      return true;
    },
    [applyAgentState, applyPresenceEvent],
  );

  dispatchEventRef.current = dispatchAgentEvent;

  useEffect(() => {
    if (!ready || !profilesReady) return;
    if (typeof EventSource === 'undefined') {
      setEventStreamStatus('unsupported');
      return;
    }

    setEventStreamStatus('connecting');
    const stream = new EventSource('/api/agent-events/stream');
    stream.onopen = () => setEventStreamStatus('live');
    stream.onmessage = (message) => {
      try {
        dispatchEventRef.current(JSON.parse(message.data));
      } catch {
        setEventError('Agent Event API v1 收到无法解析的事件流数据');
      }
    };
    stream.onerror = () => setEventStreamStatus('retrying');
    return () => stream.close();
  }, [profilesReady, ready]);

  const startJoinSequence = useCallback(() => {
    clearEventTimers();
    const profiles = Array.from(profilesRef.current.values()).sort(
      (first, second) => first.agentId.localeCompare(second.agentId),
    );
    agentsRef.current = createAgents(profiles);
    doorRef.current = { phase: 'closed', phaseStartedAt: performance.now() };
    setAgentViews(toAgentViews(agentsRef.current));
    setRouteError(null);
    setEventError(null);
    setSceneActionStatus(null);
    setSelectedAgentId(profiles[0]?.agentId ?? '');
    pendingStateRef.current.clear();
    waitQueuesRef.current.clear();
    externalPresenceAgentsRef.current.clear();
    externalStateAgentsRef.current.clear();
    setPresenceTransition(profiles.length > 0 ? 'joining' : null);

    agentsRef.current.forEach((agent, index) => {
      const startAt = 250 + index * JOIN_STAGGER_MS;
      scheduleEventTimer(startAt, () => {
        if (!profilesRef.current.has(agent.id)) return;
        if (externalPresenceAgentsRef.current.has(agent.id)) return;
        const event = mockAdapterRef.current?.createPresenceEvent(
          agent.id,
          'enter',
        );
        if (event) dispatchAgentEvent(event);
      });
      scheduleEventTimer(
        startAt + DOOR_TRANSITION_MS * 2 + DOOR_OPEN_HOLD_MS + 10,
        () => {
          if (!profilesRef.current.has(agent.id)) return;
          if (externalStateAgentsRef.current.has(agent.id)) return;
          const event = mockAdapterRef.current?.createStateEvent(
            agent.id,
            'idle',
            '入口入场完成',
          );
          if (event) dispatchAgentEvent(event);
        },
      );
    });
    if (profiles.length > 0) {
      const finishedAt =
        250 +
        (profiles.length - 1) * JOIN_STAGGER_MS +
        DOOR_TRANSITION_MS * 2 +
        DOOR_OPEN_HOLD_MS +
        100;
      scheduleEventTimer(finishedAt, () => setPresenceTransition(null));
    }
  }, [clearEventTimers, dispatchAgentEvent, scheduleEventTimer]);

  useEffect(() => {
    if (!ready || !profilesReady) return;
    startJoinSequence();
    return () => {
      clearEventTimers();
    };
  }, [clearEventTimers, profilesReady, ready, startJoinSequence]);

  const startLeaveSequence = useCallback(() => {
    clearEventTimers();
    setPresenceTransition('leaving');
    agentsRef.current.forEach((agent, index) => {
      scheduleEventTimer(index * LEAVE_STAGGER_MS, () => {
        const event = mockAdapterRef.current?.createPresenceEvent(
          agent.id,
          'leave',
        );
        if (event) dispatchAgentEvent(event);
      });
    });
  }, [clearEventTimers, dispatchAgentEvent, scheduleEventTimer]);

  useEffect(() => {
    if (!autoMode) return;
    const advance = () => {
      for (const agent of agentsRef.current) {
        if (!agent.visible) continue;
        const choices = AGENT_TASK_STATES.filter(
          (state) => state !== agent.taskState,
        );
        const state = choices[Math.floor(Math.random() * choices.length)];
        const event = mockAdapterRef.current?.createStateEvent(
          agent.id,
          state,
          'Agent 自主随机选择动作',
        );
        if (event) dispatchAgentEvent(event);
      }
    };
    advance();
    const timer = window.setInterval(advance, 6500);
    return () => window.clearInterval(timer);
  }, [autoMode, dispatchAgentEvent]);

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
          const onArrival = agent.onArrival;
          agent.onArrival = null;
          onArrival?.();
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
          if (agent.pathIndex >= agent.path.length) {
            agent.moving = false;
            const onArrival = agent.onArrival;
            agent.onArrival = null;
            onArrival?.();
          }
        } else {
          agent.x += (dx / distance) * step;
          agent.y += (dy / distance) * step;
        }
      }

      context.clearRect(0, 0, WORLD_SIZE.width, WORLD_SIZE.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(images.foundation, 0, 0);

      const elapsed = Math.max(0, time - doorRef.current.phaseStartedAt);
      const transitionProgress = Math.min(1, elapsed / DOOR_TRANSITION_MS);
      const openAmount =
        doorRef.current.phase === 'open'
          ? 1
          : doorRef.current.phase === 'opening'
            ? transitionProgress
            : doorRef.current.phase === 'closing'
              ? 1 - transitionProgress
              : 0;
      context.save();
      context.globalAlpha = 1 - openAmount;
      context.drawImage(
        images.entranceDoorClosed,
        DOOR_POSITION.x,
        DOOR_POSITION.y,
      );
      context.globalAlpha = openAmount;
      context.drawImage(images.entranceDoorOpen, DOOR_POSITION.x, DOOR_POSITION.y);
      context.restore();

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
        for (const state of AGENT_TASK_STATES) {
          const region = ACTIVITY_REGIONS[state];
          context.strokeStyle = 'rgba(115, 70, 165, 0.72)';
          context.lineWidth = 1;
          context.setLineDash([4, 3]);
          context.strokeRect(
            region.minColumn * TILE_SIZE + 1.5,
            region.minRow * TILE_SIZE + 1.5,
            (region.maxColumn - region.minColumn + 1) * TILE_SIZE - 3,
            (region.maxRow - region.minRow + 1) * TILE_SIZE - 3,
          );
          context.setLineDash([]);
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
        if (!agent.visible) return;
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

      for (const agent of agentsRef.current) {
        if (agent.visible) drawAgentNameTag(context, agent);
      }

      if (time - previousUiUpdate > 160) {
        setAgentViews(toAgentViews(agentsRef.current));
        previousUiUpdate = time;
      }
      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [ready]);

  const closeAdminPanel = useCallback(() => {
    setAdminPanelOpen(false);
    setAutoMode(false);
    setDebug(false);
  }, []);

  const handleAdminPanelToggle = async () => {
    if (adminPanelOpen) {
      closeAdminPanel();
      return;
    }
    if (!isAdmin) {
      setAdminAuthError(null);
      setAdminPromptOpen(true);
      return;
    }

    try {
      const response = await fetch('/api/admin/session', { cache: 'no-store' });
      const payload = (await response.json()) as { isAdmin?: boolean };
      if (!response.ok || !payload.isAdmin) {
        setIsAdmin(false);
        setAdminPromptOpen(true);
        return;
      }
      setAdminPanelOpen(true);
    } catch {
      setAdminAuthError('暂时无法验证管理员会话，请稍后重试');
      setAdminPromptOpen(true);
    }
  };

  const handleAdminLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminToken.trim() || adminAuthBusy) return;
    setAdminAuthBusy(true);
    setAdminAuthError(null);
    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: adminToken }),
      });
      const payload = (await response.json()) as {
        isAdmin?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.isAdmin) {
        throw new Error(payload.error ?? '管理员验证失败');
      }
      setIsAdmin(true);
      setAdminToken('');
      setAdminPromptOpen(false);
      setAdminPanelOpen(true);
    } catch (error) {
      setAdminAuthError(
        error instanceof Error ? error.message : '管理员验证失败',
      );
    } finally {
      setAdminAuthBusy(false);
    }
  };

  const handleAdminLogout = async () => {
    await fetch('/api/admin/session', { method: 'DELETE' }).catch(() => null);
    closeAdminPanel();
    setIsAdmin(false);
    setAdminToken('');
  };

  const publishAdminAction = useCallback(
    async (agentId: string, state: AgentTaskState) => {
      const response = await fetch(
        `/api/agents/${encodeURIComponent(agentId)}/actions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-OC-Kindergarten-Actor': 'admin',
          },
          body: JSON.stringify({
            schemaVersion: 1,
            action: state,
            requestId: crypto.randomUUID(),
          }),
        },
      );
      const body = (await response.json()) as {
        error?: string;
        event?: unknown;
      };
      if (!response.ok || !body.event) {
        throw new Error(body.error ?? '行为指令发送失败');
      }
      dispatchAgentEvent(body.event);
    },
    [dispatchAgentEvent],
  );

  const handleAllState = async (state: AgentTaskState) => {
    if (!isAdmin || !adminPanelOpen) return;
    setAutoMode(false);
    setSceneActionStatus(null);
    try {
      await Promise.all(
        agentsRef.current
          .filter((agent) => agent.visible)
          .map((agent) => publishAdminAction(agent.id, state)),
      );
      setSceneActionStatus(`全体 Agent 已收到${STATE_CONFIG[state].label}指令`);
    } catch (error) {
      setSceneActionStatus(
        error instanceof Error ? error.message : '全体行为指令发送失败',
      );
    }
  };

  const handleAgentState = async (agentId: string, state: AgentTaskState) => {
    if (!isAdmin || !adminPanelOpen) return;
    setAutoMode(false);
    setSceneActionStatus(null);
    try {
      await publishAdminAction(agentId, state);
    } catch (error) {
      setSceneActionStatus(
        error instanceof Error ? error.message : '行为指令发送失败',
      );
    }
  };

  const handleCanvasClick = async (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (
      !canvas ||
      !ready ||
      !isAdmin ||
      !adminPanelOpen ||
      presenceTransition !== null
    ) return;
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * canvas.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * canvas.height;
    const prop = [...PROP_SPECS]
      .reverse()
      .find(
        (candidate) =>
          x >= candidate.x &&
          x <= candidate.x + candidate.width &&
          y >= candidate.y &&
          y <= candidate.y + candidate.height,
      );
    if (!prop) return;

    const selectedAgent = agentsRef.current.find(
      (agent) => agent.id === selectedAgentId && agent.visible,
    );
    const targetAgent =
      selectedAgent ?? agentsRef.current.find((agent) => agent.visible);
    if (!targetAgent) {
      setSceneActionStatus('目前没有已入场的 Agent 可接收场景指令');
      return;
    }

    setAutoMode(false);
    try {
      await publishAdminAction(targetAgent.id, prop.actionState);
      setSceneActionStatus(
        `已让 ${targetAgent.name} 前往${STATE_CONFIG[prop.actionState].location}`,
      );
    } catch (error) {
      setSceneActionStatus(
        error instanceof Error ? error.message : '场景行为指令发送失败',
      );
    }
  };

  const reset = () => {
    if (!isAdmin || !adminPanelOpen) return;
    setAutoMode(false);
    startJoinSequence();
  };

  const leave = () => {
    if (!isAdmin || !adminPanelOpen) return;
    setAutoMode(false);
    startLeaveSequence();
  };

  const allPlayersJoined =
    agentViews.length > 0 && agentViews.every((agent) => agent.visible);
  const selectedAgentView =
    agentViews.find((agent) => agent.id === selectedAgentId && agent.visible) ??
    agentViews.find((agent) => agent.visible);

  useEffect(() => {
    if (
      presenceTransition === 'leaving' &&
      agentViews.every((agent) => !agent.visible)
    ) {
      setPresenceTransition(null);
    }
  }, [agentViews, presenceTransition]);

  return (
    <section className="canvasWorkspace" aria-label="OC Kindergarten 实时场景">
      <div className="sceneViewport canvasOnlyViewport">
        <canvas
          ref={canvasRef}
          width={WORLD_SIZE.width}
          height={WORLD_SIZE.height}
          onClick={isAdmin && adminPanelOpen ? handleCanvasClick : undefined}
          className={isAdmin && adminPanelOpen ? 'isDebugInteractive' : ''}
          aria-label="动态注册的 AI agent 从教室入口入场，并在不同功能区之间移动的实时场景"
        />
        {!ready && !loadError && (
          <div className="sceneLoading">正在载入运行时资源…</div>
        )}
        {loadError && <div className="sceneLoading sceneError">{loadError}</div>}
      </div>

      <button
        className={`debugPanelToggle ${adminPanelOpen ? 'isOpen' : ''}`}
        type="button"
        onClick={() => void handleAdminPanelToggle()}
        aria-expanded={adminPanelOpen}
        aria-controls="admin-debug-panel"
        title={isAdmin ? '打开或收起管理员调试面板' : '管理员验证'}
      >
        <span aria-hidden="true">{adminPanelOpen ? '×' : '⚙'}</span>
        <span>{adminPanelOpen ? '收起调试' : '调试'}</span>
      </button>

      {isAdmin && adminPanelOpen && (
        <aside
          className="debugPanel"
          id="admin-debug-panel"
          aria-label="管理员调试面板"
        >
          <header className="debugPanelHeader">
            <div>
              <p className="eyebrow">Admin only</p>
              <h1>运行时调试</h1>
              <p>OC Kindergarten · Agent Event API v1</p>
            </div>
            <button type="button" onClick={() => void handleAdminLogout()}>
              退出管理员
            </button>
          </header>

          <section className="debugPanelSection" aria-labelledby="runtime-status-title">
            <div className="debugSectionTitle">
              <h2 id="runtime-status-title">运行状态</h2>
              <span className="adminBadge">管理员</span>
            </div>
            <div className="runtimeBadges" aria-label="运行时规格">
              <span>512×288</span>
              <span>32px grid</span>
              <span>8 directions</span>
              <span>Registry：{registryStreamStatus === 'live' ? '已连接' : registryStreamStatus === 'retrying' ? '重连中' : registryStreamStatus === 'unsupported' ? '不支持' : '连接中'}</span>
              <span>事件流：{eventStreamStatus === 'live' ? '已连接' : eventStreamStatus === 'retrying' ? '重连中' : eventStreamStatus === 'unsupported' ? '不支持' : '连接中'}</span>
            </div>
          </section>

          <section className="debugPanelSection" aria-labelledby="global-command-title">
            <h2 id="global-command-title">场景控制</h2>
            <div className="commandGroup debugCommandGrid">
              {AGENT_TASK_STATES.map((state) => (
                <button
                  className={`commandButton command-${state}`}
                  key={state}
                  type="button"
                  onClick={() => handleAllState(state)}
                  disabled={!ready || !allPlayersJoined || presenceTransition !== null}
                >
                  全体{STATE_CONFIG[state].label}
                </button>
              ))}
            </div>
            <div className="utilityGroup debugUtilityGrid">
              <button
                className={`utilityButton ${autoMode ? 'isActive' : ''}`}
                type="button"
                onClick={() => setAutoMode((current) => !current)}
                disabled={!ready || !allPlayersJoined || presenceTransition !== null}
                aria-pressed={autoMode}
              >
                {autoMode ? '停止自主行动' : '自主随机行动'}
              </button>
              <button
                className={`utilityButton ${debug ? 'isActive' : ''}`}
                type="button"
                onClick={() => setDebug((current) => !current)}
                aria-pressed={debug}
              >
                路径与网格
              </button>
              <button className="utilityButton" type="button" onClick={leave} disabled={!ready || !allPlayersJoined || presenceTransition !== null}>
                全体离场
              </button>
              <button className="utilityButton" type="button" onClick={reset}>
                重新入场
              </button>
            </div>
            <div className="regionCapacityList" aria-label="功能区容量">
              {AGENT_TASK_STATES.map((state) => {
                const occupied = agentViews.filter((agent) => agent.visible && agent.taskState === state).length;
                const waiting = agentViews.filter((agent) => agent.visible && agent.waitingForState === state).length;
                return (
                  <span key={state}>
                    {STATE_CONFIG[state].shortLabel} {occupied}/{REGION_CAPACITIES[state]}
                    {waiting > 0 ? ` · 等待 ${waiting}` : ''}
                  </span>
                );
              })}
            </div>
            <p className="sceneHint">
              操作对象：<strong>{selectedAgentView?.name ?? '等待 Agent 入场'}</strong>
              <span>点击画布中的功能物件可触发行为</span>
            </p>
            {sceneActionStatus && <p className="sceneActionStatus" role="status">{sceneActionStatus}</p>}
            {eventStatus && !eventError && (
              <p className="eventStatus" role="status">
                <strong>Event API v1</strong>
                <span>{eventStatus.source} #{eventStatus.sequence} · {eventStatus.type} · {eventStatus.agentId} · {eventStatus.detail}</span>
              </p>
            )}
            {eventError && <p className="routeError" role="alert">{eventError}</p>}
            {routeError && <p className="routeError" role="alert">{routeError}</p>}
          </section>

          <section className="debugPanelSection" aria-labelledby="agent-debug-title">
            <h2 id="agent-debug-title">Agent 状态与指令</h2>
            <div className="agentPanel">
              {agentViews.map((agent) => {
                const state = STATE_CONFIG[agent.taskState];
                return (
                  <article className={`agentCard ${selectedAgentView?.id === agent.id ? 'isSceneTarget' : ''}`} key={agent.id}>
                    <div className="agentCardHeader">
                      <span className="agentDot" style={{ background: agent.color }} />
                      <div><h3>{agent.name}</h3><p>{agent.role}</p></div>
                      <span className={`motionStatus ${agent.moving ? 'isMoving' : ''} ${agent.waitingForState ? 'isWaiting' : ''}`}>
                        {!agent.visible ? '等待入场' : agent.waitingForState ? '排队中' : agent.moving ? '移动中' : '已到达'}
                      </span>
                    </div>
                    <div className="agentStateLine"><strong>{state.shortLabel}</strong><span>{state.location}</span></div>
                    <p className="agentMeta">{agent.waitingForState ? `等待进入${STATE_CONFIG[agent.waitingForState].location}` : agent.moving ? `${agent.routeLength} 格路径 · ${agent.direction}` : state.arrivalAnimation}</p>
                    <button
                      className="agentSelectButton"
                      type="button"
                      onClick={() => { setSelectedAgentId(agent.id); setSceneActionStatus(`${agent.name} 已成为场景操作对象`); }}
                      disabled={!agent.visible}
                      aria-pressed={selectedAgentView?.id === agent.id}
                    >
                      {selectedAgentView?.id === agent.id ? '当前场景操作对象' : '设为场景操作对象'}
                    </button>
                    <div className="agentCommands" aria-label={`${agent.name}状态指令`}>
                      {AGENT_TASK_STATES.map((stateId) => (
                        <button key={stateId} type="button" className={agent.taskState === stateId ? 'isSelected' : ''} onClick={() => handleAgentState(agent.id, stateId)} disabled={!ready || !agent.visible || presenceTransition !== null}>
                          {STATE_CONFIG[stateId].label}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="debugPanelSection" aria-labelledby="runtime-flow-title">
            <h2 id="runtime-flow-title">运行管线</h2>
            <ol className="runtimeStepList">
              {RUNTIME_STEPS.map(([title, note], index) => (
                <li key={title}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{title}</strong><p>{note}</p></div></li>
              ))}
            </ol>
          </section>
        </aside>
      )}

      {adminPromptOpen && (
        <div className="adminDialogBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdminPromptOpen(false); }}>
          <div className="adminDialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title">
            <button className="adminDialogClose" type="button" onClick={() => setAdminPromptOpen(false)} aria-label="关闭管理员验证">×</button>
            <p className="eyebrow">Restricted access</p>
            <h2 id="admin-dialog-title">管理员验证</h2>
            <p>调试工具包含运行时控制能力，仅管理员可以打开。</p>
            <form onSubmit={(event) => void handleAdminLogin(event)}>
              <label htmlFor="admin-token">管理员访问令牌</label>
              <input id="admin-token" type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} autoComplete="current-password" autoFocus />
              {adminAuthError && <p className="adminAuthError" role="alert">{adminAuthError}</p>}
              <button type="submit" disabled={!adminToken.trim() || adminAuthBusy}>{adminAuthBusy ? '正在验证…' : '验证并打开'}</button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
