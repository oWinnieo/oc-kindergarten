'use client';

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AGENT_ACTION_LOCATIONS,
  agentActionNotice,
} from '@/lib/agent-action-notice';
import type { AgentAppearancePreset } from '@/lib/agent-registry-contract';
import {
  PARENT_LANGUAGE_OPTIONS,
  PARENT_TIMEZONE_OPTIONS,
  parentLanguageLabel,
  parentLanguageValue,
  parentTimezoneLabel,
  parentTimezoneValue,
} from '@/lib/parent-profile-options';
import AgentAppearancePicker, {
  APPEARANCE_PRESET_LABELS,
} from './AgentAppearancePicker';
import AgentActivityTimeline from './AgentActivityTimeline';
import CasdoorSignInButton from './CasdoorSignInButton';

type EnrollmentStatus =
  | 'draft'
  | 'awaiting_pairing'
  | 'pending_parent_confirmation'
  | 'active'
  | 'suspended'
  | 'archived';

type AgentAction =
  | 'idle'
  | 'writing'
  | 'researching'
  | 'executing'
  | 'syncing'
  | 'error';

type CharacterVariant = 'boy' | 'girl' | 'genderless';

interface ParentProfile {
  id: string;
  email?: string;
  displayName: string;
  avatarUrl?: string;
  timezone?: string;
  language?: string;
}

interface ParentProfileDraft {
  displayName: string;
  avatarUrl: string;
  timezone: string;
  language: string;
}

interface EnrollmentAgent {
  agentId: string;
  displayName: string;
  characterVariant: CharacterVariant;
  appearancePreset?: AgentAppearancePreset;
  role?: string;
  personalitySummary?: string;
  capabilities?: string[];
  color?: string;
}

interface AgentProfileDraft {
  displayName: string;
  role: string;
  personalitySummary: string;
  capabilities: string;
  characterVariant: CharacterVariant;
  appearancePreset: AgentAppearancePreset;
  color: string;
}

interface Enrollment {
  id: string;
  status: EnrollmentStatus;
  provider?: string;
  nativeAgentId?: string;
  pairingExpired?: boolean;
  updatedAt: string;
  agent?: EnrollmentAgent;
}

type DashboardState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'ready'; parent: ParentProfile; enrollments: Enrollment[] }
  | { kind: 'error'; message: string };

const ACTIONS: readonly { id: AgentAction; label: string; location: string }[] = [
  { id: 'idle', label: '休息', location: AGENT_ACTION_LOCATIONS.idle },
  { id: 'writing', label: '写画', location: AGENT_ACTION_LOCATIONS.writing },
  { id: 'researching', label: '阅读', location: AGENT_ACTION_LOCATIONS.researching },
  { id: 'executing', label: '手工', location: AGENT_ACTION_LOCATIONS.executing },
  { id: 'syncing', label: '交流', location: AGENT_ACTION_LOCATIONS.syncing },
  { id: 'error', label: '检查', location: AGENT_ACTION_LOCATIONS.error },
] as const;

const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  draft: '待生成配对码',
  awaiting_pairing: '等待配对',
  pending_parent_confirmation: '等待确认',
  active: '在园',
  suspended: '已暂停',
  archived: '已归档',
};

const VARIANT_LABELS: Record<EnrollmentAgent['characterVariant'], string> = {
  boy: '男孩角色',
  girl: '女孩角色',
  genderless: '无性别角色',
};

function requestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `family-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function profileDraftFor(agent: EnrollmentAgent): AgentProfileDraft {
  return {
    displayName: agent.displayName,
    role: agent.role ?? '',
    personalitySummary: agent.personalitySummary ?? '',
    capabilities: agent.capabilities?.join(', ') ?? '',
    characterVariant: agent.characterVariant,
    appearancePreset: agent.appearancePreset ?? 'classic',
    color: agent.color ?? '#297db6',
  };
}

function parentProfileDraftFor(parent: ParentProfile): ParentProfileDraft {
  return {
    displayName: parent.displayName,
    avatarUrl: parent.avatarUrl ?? '',
    timezone: parentTimezoneValue(parent.timezone),
    language: parentLanguageValue(parent.language),
  };
}

export default function FamilyDashboard() {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastActions, setLastActions] = useState<Record<string, AgentAction>>({});
  const [activityRefreshes, setActivityRefreshes] = useState<
    Record<string, number>
  >({});
  const [editingEnrollmentId, setEditingEnrollmentId] = useState<string | null>(
    null,
  );
  const [profileDrafts, setProfileDrafts] = useState<
    Record<string, AgentProfileDraft>
  >({});
  const [editingParentProfile, setEditingParentProfile] = useState(false);
  const [parentProfileDraft, setParentProfileDraft] =
    useState<ParentProfileDraft | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const [profileResponse, enrollmentsResponse] = await Promise.all([
        fetch('/api/me', { cache: 'no-store' }),
        fetch('/api/enrollments', { cache: 'no-store' }),
      ]);
      if (profileResponse.status === 401 || enrollmentsResponse.status === 401) {
        setState({ kind: 'signed-out' });
        return;
      }
      const profileBody = (await profileResponse.json()) as {
        parent?: ParentProfile;
        error?: string;
      };
      const enrollmentBody = (await enrollmentsResponse.json()) as {
        enrollments?: Enrollment[];
        error?: string;
      };
      if (!profileResponse.ok || !profileBody.parent) {
        throw new Error(profileBody.error ?? '无法读取主人资料');
      }
      if (!enrollmentsResponse.ok || !enrollmentBody.enrollments) {
        throw new Error(enrollmentBody.error ?? '无法读取家庭 Agent');
      }
      setState({
        kind: 'ready',
        parent: profileBody.parent,
        enrollments: enrollmentBody.enrollments,
      });
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : '家庭页载入失败',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const enrollments = state.kind === 'ready' ? state.enrollments : [];
    return {
      managed: enrollments.filter(
        (item) => item.status === 'active' || item.status === 'suspended',
      ),
      pending: enrollments.filter(
        (item) =>
          item.status === 'draft' ||
          item.status === 'awaiting_pairing' ||
          item.status === 'pending_parent_confirmation',
      ),
      archived: enrollments.filter((item) => item.status === 'archived'),
    };
  }, [state]);

  const replaceEnrollment = (next: Enrollment) => {
    setState((current) =>
      current.kind !== 'ready'
        ? current
        : {
            ...current,
            enrollments: current.enrollments.map((item) =>
              item.id === next.id ? next : item,
            ),
          },
    );
  };

  const toggleParentProfileEditor = () => {
    if (editingParentProfile) {
      setEditingParentProfile(false);
      return;
    }
    if (state.kind !== 'ready') return;
    setParentProfileDraft(parentProfileDraftFor(state.parent));
    setEditingParentProfile(true);
    setNotice(null);
  };

  const updateParentProfileDraft = (patch: Partial<ParentProfileDraft>) => {
    setParentProfileDraft((current) =>
      current ? { ...current, ...patch } : current,
    );
  };

  const saveParentProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!parentProfileDraft?.displayName.trim()) {
      setNotice('主人展示名不能为空。');
      return;
    }

    setBusyKey('parent:profile');
    setNotice(null);
    try {
      const response = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: parentProfileDraft.displayName,
          avatarUrl: parentProfileDraft.avatarUrl || null,
          timezone: parentProfileDraft.timezone || null,
          language: parentProfileDraft.language || null,
        }),
      });
      const body = (await response.json()) as {
        parent?: ParentProfile;
        error?: string;
      };
      if (!response.ok || !body.parent) {
        throw new Error(body.error ?? '无法更新主人资料');
      }
      setState((current) =>
        current.kind === 'ready'
          ? { ...current, parent: body.parent! }
          : current,
      );
      setParentProfileDraft(parentProfileDraftFor(body.parent));
      setEditingParentProfile(false);
      setNotice('主人资料已更新。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法更新主人资料');
    } finally {
      setBusyKey(null);
    }
  };

  const changeLifecycle = async (
    enrollment: Enrollment,
    action: 'suspend' | 'resume' | 'archive' | 'restore',
  ) => {
    if (
      action === 'archive' &&
      !window.confirm(
        enrollment.agent
          ? '归档这个 Agent？归档后它会离开教室并停止接收事件，你之后可以从已归档列表恢复。'
          : '撤销这个入园申请？此操作不可撤销。',
      )
    ) {
      return;
    }
    const key = `${enrollment.id}:${action}`;
    setBusyKey(key);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/enrollments/${encodeURIComponent(enrollment.id)}/${action}`,
        { method: 'POST' },
      );
      const body = (await response.json()) as {
        enrollment?: Enrollment;
        error?: string;
      };
      if (!response.ok || !body.enrollment) {
        throw new Error(body.error ?? '无法更新 Agent 状态');
      }
      replaceEnrollment(body.enrollment);
      setNotice(
        action === 'suspend'
          ? 'Agent 已暂停。'
          : action === 'resume'
            ? 'Agent 已恢复，下一条运行事件会让它重新入场。'
            : action === 'restore'
              ? 'Agent 已恢复到暂停状态，请确认后再恢复入园。'
              : enrollment.agent
                ? 'Agent 已归档，可从已归档列表恢复。'
                : '入园申请已撤销。',
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法更新 Agent 状态');
    } finally {
      setBusyKey(null);
    }
  };

  const issueAction = async (enrollment: Enrollment, action: AgentAction) => {
    if (!enrollment.agent) return;
    const key = `${enrollment.id}:action:${action}`;
    setBusyKey(key);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/agents/${encodeURIComponent(enrollment.agent.agentId)}/actions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schemaVersion: 1,
            action,
            requestId: requestId(),
          }),
        },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? '行为指令发送失败');
      setLastActions((current) => ({
        ...current,
        [enrollment.agent!.agentId]: action,
      }));
      setActivityRefreshes((current) => ({
        ...current,
        [enrollment.id]: (current[enrollment.id] ?? 0) + 1,
      }));
      setNotice(agentActionNotice(enrollment.agent.displayName, action));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '行为指令发送失败');
    } finally {
      setBusyKey(null);
    }
  };

  const toggleProfileEditor = (enrollment: Enrollment) => {
    if (!enrollment.agent) return;
    if (editingEnrollmentId === enrollment.id) {
      setEditingEnrollmentId(null);
      return;
    }
    setProfileDrafts((current) => ({
      ...current,
      [enrollment.id]: profileDraftFor(enrollment.agent!),
    }));
    setEditingEnrollmentId(enrollment.id);
    setNotice(null);
  };

  const updateProfileDraft = (
    enrollmentId: string,
    patch: Partial<AgentProfileDraft>,
  ) => {
    setProfileDrafts((current) => ({
      ...current,
      [enrollmentId]: { ...current[enrollmentId]!, ...patch },
    }));
  };

  const saveProfile = async (
    event: FormEvent<HTMLFormElement>,
    enrollment: Enrollment,
  ) => {
    event.preventDefault();
    const draft = profileDrafts[enrollment.id];
    if (!draft?.displayName.trim()) {
      setNotice('Agent 展示名不能为空。');
      return;
    }

    const key = `${enrollment.id}:profile`;
    setBusyKey(key);
    setNotice(null);
    try {
      const capabilities = draft.capabilities
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const response = await fetch(
        `/api/enrollments/${encodeURIComponent(enrollment.id)}/profile`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: draft.displayName,
            characterVariant: draft.characterVariant,
            appearancePreset: draft.appearancePreset,
            color: draft.color,
            ...(draft.role.trim() ? { role: draft.role } : {}),
            ...(draft.personalitySummary.trim()
              ? { personalitySummary: draft.personalitySummary }
              : {}),
            ...(capabilities.length ? { capabilities } : {}),
          }),
        },
      );
      const body = (await response.json()) as {
        enrollment?: Enrollment;
        error?: string;
      };
      if (!response.ok || !body.enrollment?.agent) {
        throw new Error(body.error ?? '无法更新 Agent 资料');
      }
      replaceEnrollment(body.enrollment);
      setEditingEnrollmentId(null);
      setNotice(`${body.enrollment.agent.displayName} 的资料已更新。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法更新 Agent 资料');
    } finally {
      setBusyKey(null);
    }
  };

  if (state.kind === 'loading') {
    return <p className="familyStatus">正在读取家庭资料...</p>;
  }

  if (state.kind === 'signed-out') {
    return (
      <section className="familyAuthState">
        <h2>登录后查看你的家庭</h2>
        <CasdoorSignInButton callbackUrl="/family" />
      </section>
    );
  }

  if (state.kind === 'error') {
    return (
      <section className="familyAuthState">
        <h2>家庭资料暂时不可用</h2>
        <p className="parentError">{state.message}</p>
        <button className="parentSecondaryAction" type="button" onClick={() => void load()}>
          重新加载
        </button>
      </section>
    );
  }

  return (
    <>
      <header className="familyHeader">
        <div>
          <p className="eyebrow">Family</p>
          <h1>{state.parent.displayName}的宝宝团</h1>
          <p className="familyCounts">
            {groups.managed.filter((item) => item.status === 'active').length} 名在园
            <span aria-hidden="true">/</span>
            {groups.pending.length} 项待处理
          </p>
        </div>
        <nav className="familyNav" aria-label="家庭页导航">
          <a href="/">教室</a>
          <a href="#parent-profile">主人资料</a>
          <a href="/onboarding/parent">添加 Agent</a>
          <a href="/api/auth/signout?callbackUrl=%2F">退出</a>
        </nav>
      </header>

      {notice ? (
        <p className="familyNotice" role="status">{notice}</p>
      ) : null}

      <section
        className="familySection familyParentSection"
        id="parent-profile"
        aria-labelledby="parent-profile-title"
      >
        <div className="familySectionHeading">
          <div>
            <p className="eyebrow">Parent profile</p>
            <h2 id="parent-profile-title">主人资料</h2>
          </div>
          <button
            className="parentSecondaryAction"
            type="button"
            disabled={busyKey !== null}
            aria-expanded={editingParentProfile}
            aria-controls="parent-profile-editor"
            onClick={toggleParentProfileEditor}
          >
            {editingParentProfile ? '收起编辑' : '编辑主人资料'}
          </button>
        </div>

        <div className="familyParentProfileCard">
          <div className="familyParentAvatar" aria-hidden="true">
            {state.parent.displayName.trim().slice(0, 1).toUpperCase() || '家'}
          </div>
          <dl className="familyParentDetails">
            <div>
              <dt>展示名</dt>
              <dd>{state.parent.displayName}</dd>
            </div>
            <div>
              <dt>邮箱</dt>
              <dd>{state.parent.email ?? '未提供'}</dd>
            </div>
            <div>
              <dt>时区</dt>
              <dd>{parentTimezoneLabel(state.parent.timezone)}</dd>
            </div>
            <div>
              <dt>语言</dt>
              <dd>{parentLanguageLabel(state.parent.language)}</dd>
            </div>
          </dl>

          {editingParentProfile && parentProfileDraft ? (
            <form
              className="familyParentEditForm"
              id="parent-profile-editor"
              aria-busy={busyKey === 'parent:profile'}
              onSubmit={(event) => void saveParentProfile(event)}
            >
              <h3>编辑主人资料</h3>
              <label>
                <span>社区展示名</span>
                <input
                  required
                  maxLength={48}
                  value={parentProfileDraft.displayName}
                  onChange={(event) =>
                    updateParentProfileDraft({ displayName: event.target.value })
                  }
                />
              </label>
              <label>
                <span>邮箱（由 Casdoor 提供）</span>
                <input value={state.parent.email ?? '未提供'} disabled />
              </label>
              <label className="familyParentEditWideField">
                <span>头像 URL（可选）</span>
                <input
                  type="url"
                  maxLength={2048}
                  placeholder="https://…"
                  value={parentProfileDraft.avatarUrl}
                  onChange={(event) =>
                    updateParentProfileDraft({ avatarUrl: event.target.value })
                  }
                />
              </label>
              <label>
                <span>时区（可选）</span>
                <select
                  value={parentProfileDraft.timezone}
                  onChange={(event) =>
                    updateParentProfileDraft({ timezone: event.target.value })
                  }
                >
                  <option value="">请选择时区</option>
                  {PARENT_TIMEZONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>语言（可选）</span>
                <select
                  value={parentProfileDraft.language}
                  onChange={(event) =>
                    updateParentProfileDraft({ language: event.target.value })
                  }
                >
                  <option value="">请选择语言</option>
                  {PARENT_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="familyParentEditActions familyParentEditWideField">
                <button
                  className="parentPrimaryAction"
                  type="submit"
                  disabled={busyKey !== null}
                >
                  {busyKey === 'parent:profile' ? '保存中…' : '保存主人资料'}
                </button>
                <button
                  className="parentSecondaryAction"
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => setEditingParentProfile(false)}
                >
                  取消
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </section>

      <section className="familySection familyAgentsSection" aria-labelledby="managed-agents-title">
        <div className="familySectionHeading">
          <div>
            <p className="eyebrow">Agents</p>
            <h2 id="managed-agents-title">在园 Agent</h2>
          </div>
          <a className="parentPrimaryAction" href="/onboarding/parent">
            添加 Agent
          </a>
        </div>

        {groups.managed.length === 0 ? (
          <div className="familyEmptyState">
            <p>还没有已入园的 Agent。</p>
            <a href="/onboarding/parent">开始入园</a>
          </div>
        ) : (
          <div className="familyAgentList">
            {groups.managed.map((enrollment) => {
              const agent = enrollment.agent;
              if (!agent) return null;
              const suspended = enrollment.status === 'suspended';
              const editing = editingEnrollmentId === enrollment.id;
              const profileDraft = profileDrafts[enrollment.id];
              return (
                <article className="familyAgentCard" key={enrollment.id}>
                  <div className="familyAgentIdentity">
                    <span
                      className="familyAgentSwatch"
                      style={{ background: agent.color ?? '#297db6' }}
                      aria-hidden="true"
                    />
                    <div>
                      <div className="familyAgentNameRow">
                        <h3>{agent.displayName}</h3>
                        <span className={`agentEnrollmentBadge status-${enrollment.status}`}>
                          {STATUS_LABELS[enrollment.status]}
                        </span>
                      </div>
                      <p>
                        {agent.role ?? 'AI Agent'} · {VARIANT_LABELS[agent.characterVariant]} ·{' '}
                        {APPEARANCE_PRESET_LABELS[agent.appearancePreset ?? 'classic']}
                      </p>
                      <code>{enrollment.provider}/{enrollment.nativeAgentId}</code>
                    </div>
                  </div>

                  <div className="familyBehaviorControl" aria-label={`${agent.displayName}的行为`}>
                    {ACTIONS.map((action) => (
                      <button
                        className={lastActions[agent.agentId] === action.id ? 'isSelected' : ''}
                        type="button"
                        key={action.id}
                        disabled={suspended || busyKey !== null}
                        onClick={() => void issueAction(enrollment, action.id)}
                        title={`前往${action.location}`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>

                  <div className="familyAgentLifecycle">
                    <button
                      className="parentSecondaryAction"
                      type="button"
                      disabled={busyKey !== null}
                      aria-expanded={editing}
                      aria-controls={`agent-profile-${enrollment.id}`}
                      onClick={() => toggleProfileEditor(enrollment)}
                    >
                      {editing ? '收起编辑' : '编辑资料'}
                    </button>
                    <button
                      className="parentSecondaryAction"
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() =>
                        void changeLifecycle(
                          enrollment,
                          suspended ? 'resume' : 'suspend',
                        )
                      }
                    >
                      {suspended ? '恢复入园' : '暂时出园'}
                    </button>
                    <button
                      className="familyArchiveAction"
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => void changeLifecycle(enrollment, 'archive')}
                    >
                      归档
                    </button>
                  </div>

                  <AgentActivityTimeline
                    enrollmentId={enrollment.id}
                    agentName={agent.displayName}
                    refreshToken={activityRefreshes[enrollment.id] ?? 0}
                  />

                  {editing && profileDraft ? (
                    <form
                      className="familyAgentEditForm"
                      id={`agent-profile-${enrollment.id}`}
                      aria-busy={busyKey === `${enrollment.id}:profile`}
                      onSubmit={(event) => void saveProfile(event, enrollment)}
                    >
                      <h4>编辑 Agent 资料</h4>
                      <label>
                        <span>展示名</span>
                        <input
                          required
                          maxLength={48}
                          value={profileDraft.displayName}
                          onChange={(event) =>
                            updateProfileDraft(enrollment.id, {
                              displayName: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        <span>角色／职责（可选）</span>
                        <input
                          maxLength={80}
                          value={profileDraft.role}
                          onChange={(event) =>
                            updateProfileDraft(enrollment.id, {
                              role: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="familyAgentEditWideField">
                        <span>性格简介（可选）</span>
                        <textarea
                          maxLength={240}
                          value={profileDraft.personalitySummary}
                          onChange={(event) =>
                            updateProfileDraft(enrollment.id, {
                              personalitySummary: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="familyAgentEditWideField">
                        <span>公开能力标签（可选）</span>
                        <input
                          maxLength={820}
                          value={profileDraft.capabilities}
                          onChange={(event) =>
                            updateProfileDraft(enrollment.id, {
                              capabilities: event.target.value,
                            })
                          }
                        />
                      </label>
                      <fieldset className="agentVariantField familyAgentEditWideField">
                        <legend>角色外观</legend>
                        <div className="agentVariantOptions">
                          {(Object.keys(VARIANT_LABELS) as CharacterVariant[]).map(
                            (variant) => (
                              <label key={variant}>
                                <input
                                  type="radio"
                                  name={`profile-variant-${enrollment.id}`}
                                  value={variant}
                                  checked={profileDraft.characterVariant === variant}
                                  onChange={() =>
                                    updateProfileDraft(enrollment.id, {
                                      characterVariant: variant,
                                    })
                                  }
                                />
                                <span>{VARIANT_LABELS[variant]}</span>
                              </label>
                            ),
                          )}
                        </div>
                      </fieldset>
                      <AgentAppearancePicker
                        idPrefix={`profile-${enrollment.id}`}
                        characterVariant={profileDraft.characterVariant}
                        value={profileDraft.appearancePreset}
                        disabled={busyKey !== null}
                        onChange={(appearancePreset) =>
                          updateProfileDraft(enrollment.id, { appearancePreset })
                        }
                      />
                      <label className="familyAgentColorField">
                        <span>标识色</span>
                        <div>
                          <input
                            type="color"
                            value={profileDraft.color}
                            onChange={(event) =>
                              updateProfileDraft(enrollment.id, {
                                color: event.target.value,
                              })
                            }
                          />
                          <output>{profileDraft.color.toUpperCase()}</output>
                        </div>
                      </label>
                      <div className="familyAgentEditActions">
                        <button
                          className="parentPrimaryAction"
                          type="submit"
                          disabled={busyKey !== null}
                        >
                          {busyKey === `${enrollment.id}:profile`
                            ? '保存中…'
                            : '保存资料'}
                        </button>
                        <button
                          className="parentSecondaryAction"
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => setEditingEnrollmentId(null)}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="familySection familyPendingSection" aria-labelledby="pending-enrollments-title">
        <div className="familySectionHeading">
          <div>
            <p className="eyebrow">Enrollment</p>
            <h2 id="pending-enrollments-title">待处理</h2>
          </div>
        </div>
        {groups.pending.length === 0 ? (
          <p className="familyEmptyLine">没有待处理的入园申请。</p>
        ) : (
          <div className="familyPendingList">
            {groups.pending.map((enrollment) => (
              <div className="familyPendingRow" key={enrollment.id}>
                <div>
                  <strong>{enrollment.nativeAgentId ?? '新的 Agent'}</strong>
                  <span>{STATUS_LABELS[enrollment.status]}</span>
                </div>
                <div className="familyPendingActions">
                  <a href="/onboarding/parent">继续处理</a>
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => void changeLifecycle(enrollment, 'archive')}
                  >
                    撤销申请
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {groups.archived.length > 0 ? (
        <details className="familyArchive">
          <summary>已归档 ({groups.archived.length})</summary>
          <ul>
            {groups.archived.map((enrollment) => (
              <li key={enrollment.id}>
                <div className="familyArchivedAgentRow">
                  <div>
                    <span>{enrollment.agent?.displayName ?? enrollment.nativeAgentId ?? 'Agent'}</span>
                    <time dateTime={enrollment.updatedAt}>
                      {new Date(enrollment.updatedAt).toLocaleDateString('zh-CN')}
                    </time>
                  </div>
                  {enrollment.agent ? (
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => void changeLifecycle(enrollment, 'restore')}
                    >
                      恢复到暂停
                    </button>
                  ) : null}
                </div>
                {enrollment.agent ? (
                  <AgentActivityTimeline
                    compact
                    enrollmentId={enrollment.id}
                    agentName={enrollment.agent.displayName}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
