'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type { AgentAppearancePreset } from '@/lib/agent-registry-contract';
import {
  AGENT_PROVIDER_CATALOG,
  buildRuntimePairingCommand,
  providerLabel,
} from '@/lib/agent-provider-catalog';
import type { AgentProvider } from '@/lib/provider-binding-contract';
import { welcomeAgentHref } from '@/lib/classroom-welcome';
import AgentAppearancePicker, {
  APPEARANCE_PRESET_LABELS,
} from './AgentAppearancePicker';

type CharacterVariant = 'boy' | 'girl' | 'genderless';
type EnrollmentStatus =
  | 'draft'
  | 'awaiting_pairing'
  | 'pending_parent_confirmation'
  | 'active'
  | 'suspended'
  | 'archived';

interface AgentDraft {
  displayName?: string;
  role?: string;
  personalitySummary?: string;
  capabilities?: string[];
  characterVariant?: CharacterVariant;
  appearancePreset?: AgentAppearancePreset;
  color?: string;
}

interface AgentEnrollment {
  id: string;
  status: EnrollmentStatus;
  draftProfile?: AgentDraft;
  provider?: AgentProvider;
  runtimeInstanceId?: string;
  nativeAgentId?: string;
  pairingExpiresAt?: string;
  pairingExpired?: boolean;
  pairedAt?: string;
  createdAt: string;
  updatedAt: string;
  agent?: AgentDraft & {
    agentId: string;
    displayName: string;
    characterVariant: CharacterVariant;
    revision: number;
  };
}

interface PairingSecret {
  code: string;
  expiresAt: string;
}

interface ActivationDraft {
  displayName: string;
  role: string;
  personalitySummary: string;
  capabilities: string;
  characterVariant: '' | CharacterVariant;
  appearancePreset: AgentAppearancePreset;
  color: string;
}

const VARIANT_LABELS: Record<CharacterVariant, string> = {
  boy: '男孩外观',
  girl: '女孩外观',
  genderless: '无性别孩子外观',
};

function draftForActivation(enrollment: AgentEnrollment): ActivationDraft {
  const draft = enrollment.draftProfile;
  return {
    displayName: draft?.displayName ?? enrollment.nativeAgentId ?? '',
    role: draft?.role ?? '',
    personalitySummary: draft?.personalitySummary ?? '',
    capabilities: draft?.capabilities?.join(', ') ?? '',
    characterVariant: '',
    appearancePreset: 'classic',
    color: draft?.color ?? '#6576d8',
  };
}

async function responseBody(response: Response) {
  const body = (await response.json()) as {
    ok?: boolean;
    error?: string;
    enrollments?: AgentEnrollment[];
    enrollment?: AgentEnrollment;
    pairingCode?: string;
    pairingExpiresAt?: string;
  };
  if (!response.ok) throw new Error(body.error || '操作失败');
  return body;
}

export default function AgentEnrollmentPanel() {
  const [enrollments, setEnrollments] = useState<AgentEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [newProvider, setNewProvider] = useState<AgentProvider>('hermes');
  const [pairingSecrets, setPairingSecrets] = useState<
    Record<string, PairingSecret>
  >({});
  const [nativeAgentIds, setNativeAgentIds] = useState<Record<string, string>>(
    {},
  );
  const [shareReplies, setShareReplies] = useState<Record<string, boolean>>({});
  const [activationDrafts, setActivationDrafts] = useState<
    Record<string, ActivationDraft>
  >({});

  const loadEnrollments = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const body = await responseBody(
        await fetch('/api/enrollments', { cache: 'no-store' }),
      );
      const nextEnrollments = (body.enrollments ?? []).filter(
        (enrollment) => enrollment.status !== 'archived',
      );
      setEnrollments(nextEnrollments);
      setActivationDrafts((current) => {
        const next = { ...current };
        for (const enrollment of nextEnrollments) {
          if (
            enrollment.status === 'pending_parent_confirmation' &&
            !next[enrollment.id]
          ) {
            next[enrollment.id] = draftForActivation(enrollment);
          }
        }
        return next;
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法读取入园申请');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEnrollments();
  }, [loadEnrollments]);

  const waitingForRuntime = useMemo(
    () => enrollments.some((item) => item.status === 'awaiting_pairing'),
    [enrollments],
  );

  useEffect(() => {
    if (!waitingForRuntime) return;
    const timer = window.setInterval(() => void loadEnrollments(true), 3000);
    return () => window.clearInterval(timer);
  }, [loadEnrollments, waitingForRuntime]);

  const issueCode = async (enrollmentId: string) => {
    setBusyId(enrollmentId);
    setNotice('');
    try {
      const body = await responseBody(
        await fetch(`/api/enrollments/${enrollmentId}/pairing-code`, {
          method: 'POST',
        }),
      );
      if (!body.enrollment || !body.pairingCode || !body.pairingExpiresAt) {
        throw new Error('服务器没有返回完整配对码');
      }
      setPairingSecrets((current) => ({
        ...current,
        [enrollmentId]: {
          code: body.pairingCode!,
          expiresAt: body.pairingExpiresAt!,
        },
      }));
      setEnrollments((current) =>
        current.map((item) =>
          item.id === enrollmentId ? body.enrollment! : item,
        ),
      );
      const provider = body.enrollment.provider ?? 'openclaw';
      setNotice(
        `配对码已生成，请在 15 分钟内到 ${providerLabel(provider)} 主机执行命令。`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '生成配对码失败');
    } finally {
      setBusyId(null);
    }
  };

  const createEnrollment = async (provider: AgentProvider) => {
    setBusyId('new');
    setNotice('');
    try {
      const body = await responseBody(
        await fetch('/api/enrollments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider }),
        }),
      );
      if (!body.enrollment) throw new Error('服务器没有返回入园申请');
      setEnrollments((current) => [body.enrollment!, ...current]);
      await issueCode(body.enrollment.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '创建入园申请失败');
      setBusyId(null);
    }
  };

  const deleteEnrollment = async (enrollment: AgentEnrollment) => {
    if (!window.confirm('确定删除这条 AI Agent 入园申请吗？')) return;
    setBusyId(enrollment.id);
    setNotice('');
    try {
      await responseBody(
        await fetch(`/api/enrollments/${enrollment.id}`, { method: 'DELETE' }),
      );
      setEnrollments((current) =>
        current.filter((item) => item.id !== enrollment.id),
      );
      setPairingSecrets((current) => {
        const next = { ...current };
        delete next[enrollment.id];
        return next;
      });
      setNativeAgentIds((current) => {
        const next = { ...current };
        delete next[enrollment.id];
        return next;
      });
      setShareReplies((current) => {
        const next = { ...current };
        delete next[enrollment.id];
        return next;
      });
      setActivationDrafts((current) => {
        const next = { ...current };
        delete next[enrollment.id];
        return next;
      });
      setNotice('AI Agent 入园申请已删除。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除入园申请失败');
    } finally {
      setBusyId(null);
    }
  };

  const copyCommand = async (enrollment: AgentEnrollment) => {
    const enrollmentId = enrollment.id;
    const secret = pairingSecrets[enrollmentId];
    const nativeAgentId = nativeAgentIds[enrollmentId]?.trim();
    const provider = enrollment.provider ?? 'openclaw';
    if (!secret || (provider === 'openclaw' && !nativeAgentId)) return;
    if (
      provider === 'openclaw' &&
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(nativeAgentId ?? '')
    ) {
      setNotice('OpenClaw Agent ID 格式不正确');
      return;
    }
    try {
      await navigator.clipboard.writeText(
        buildRuntimePairingCommand({
          provider,
          pairingCode: secret.code,
          endpoint: window.location.origin,
          nativeAgentId,
          shareReplies: shareReplies[enrollmentId] ?? false,
        }),
      );
      setNotice(
        `配对命令已复制。请到安装 ${providerLabel(provider)} 的终端执行。`,
      );
    } catch {
      setNotice('浏览器无法复制，请手动复制命令。');
    }
  };

  const copyPluginInstallCommand = async (provider: AgentProvider) => {
    try {
      await navigator.clipboard.writeText(
        AGENT_PROVIDER_CATALOG[provider].installCommand,
      );
      setNotice(`${providerLabel(provider)} 插件安装命令已复制。`);
    } catch {
      setNotice('浏览器无法复制，请手动复制插件安装命令。');
    }
  };

  const updateActivation = (
    enrollmentId: string,
    patch: Partial<ActivationDraft>,
  ) => {
    setActivationDrafts((current) => ({
      ...current,
      [enrollmentId]: {
        ...(current[enrollmentId] ?? draftForActivation(
          enrollments.find((item) => item.id === enrollmentId)!,
        )),
        ...patch,
      },
    }));
  };

  const activate = async (
    event: FormEvent<HTMLFormElement>,
    enrollment: AgentEnrollment,
  ) => {
    event.preventDefault();
    const draft = activationDrafts[enrollment.id];
    if (!draft?.displayName.trim() || !draft.characterVariant) {
      setNotice('请填写展示名并亲自选择一个角色外观。');
      return;
    }
    setBusyId(enrollment.id);
    setNotice('');
    try {
      const capabilities = draft.capabilities
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const body = await responseBody(
        await fetch(`/api/enrollments/${enrollment.id}/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: draft.displayName,
            characterVariant: draft.characterVariant,
            appearancePreset: draft.appearancePreset,
            ...(draft.role.trim() ? { role: draft.role } : {}),
            ...(draft.personalitySummary.trim()
              ? { personalitySummary: draft.personalitySummary }
              : {}),
            ...(capabilities.length ? { capabilities } : {}),
            ...(draft.color.trim() ? { color: draft.color } : {}),
          }),
        }),
      );
      if (!body.enrollment) throw new Error('服务器没有返回已激活 Agent');
      setEnrollments((current) =>
        current.map((item) =>
          item.id === enrollment.id ? body.enrollment! : item,
        ),
      );
      const agentId = body.enrollment.agent?.agentId;
      setNotice('Agent 已确认入园，正在带它从入口进入教室。');
      if (agentId) {
        window.location.assign(welcomeAgentHref(agentId));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '确认入园失败');
    } finally {
      setBusyId(null);
    }
  };

  const selectedProvider = AGENT_PROVIDER_CATALOG[newProvider];

  return (
    <section className="parentCard agentEnrollmentPanel">
      <div className="parentCardHeading">
        <div>
          <p className="eyebrow">Agent enrollment</p>
          <h2>带一个 AI Agent 入园</h2>
        </div>
        <button
          className="parentPrimaryAction"
          type="button"
          disabled={busyId !== null}
          onClick={() => void createEnrollment(newProvider)}
        >
          {busyId === 'new' ? '创建中…' : '添加 AI Agent'}
        </button>
      </div>
      <p className="parentIntro">
        配对码只能使用一次，15 分钟后失效。Agent 提交的资料只是草稿，必须由你确认后才会公开。
      </p>

      <fieldset className="agentVariantField">
        <legend>你使用哪个 Agent runtime？</legend>
        <div className="agentVariantOptions">
          {(['hermes', 'openclaw'] as AgentProvider[]).map((provider) => (
            <label key={provider}>
              <input
                type="radio"
                name="new-agent-provider"
                value={provider}
                checked={newProvider === provider}
                onChange={() => setNewProvider(provider)}
              />
              <span>{providerLabel(provider)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="agentPairingBox agentPluginSetup">
        <div>
          <span className="agentPluginStep">首次使用 · Private beta</span>
          <h3>先在 {selectedProvider.label} 主机安装入园插件</h3>
        </div>
        <p>
          已测试版本：{selectedProvider.minimumVersion}。同一 profile 无需重复安装。
          {selectedProvider.restartCopy}
          {newProvider === 'hermes'
            ? ' 回复气泡默认关闭，只有配对时主动勾选才会发送清洗后的 280 字摘要。'
            : ' OpenClaw 插件会按 Agent ID 分别保存 scoped credential。'}
        </p>
        <code className="agentPairingCommand">
          {selectedProvider.installCommand}
        </code>
        <div className="agentPairingActions">
          <button
            className="parentSecondaryAction"
            type="button"
            onClick={() => void copyPluginInstallCommand(newProvider)}
          >
            复制插件安装命令
          </button>
        </div>
      </div>

      {loading ? <p className="parentStatus">正在读取你的 Agent…</p> : null}
      {!loading && enrollments.length === 0 ? (
        <div className="agentEmptyState">
          <span aria-hidden="true">🤖</span>
          <p>还没有 Agent 入园申请。点击“添加 AI Agent”开始配对。</p>
        </div>
      ) : null}

      <div className="agentEnrollmentList">
        {enrollments.map((enrollment, index) => {
          const secret = pairingSecrets[enrollment.id];
          const nativeAgentId = nativeAgentIds[enrollment.id] ?? '';
          const provider = enrollment.provider ?? 'openclaw';
          const providerCatalog = AGENT_PROVIDER_CATALOG[provider];
          const command = secret
            ? buildRuntimePairingCommand({
                provider,
                pairingCode: secret.code,
                endpoint:
                  typeof window === 'undefined'
                    ? 'https://YOUR_KINDERGARTEN_HOST'
                    : window.location.origin,
                nativeAgentId: nativeAgentId.trim() || undefined,
                shareReplies: shareReplies[enrollment.id] ?? false,
              })
            : '';
          const activation = activationDrafts[enrollment.id];
          return (
            <article className="agentEnrollmentCard" key={enrollment.id}>
              <div className="agentEnrollmentTitle">
                <strong>
                  {enrollment.agent?.displayName ??
                    enrollment.draftProfile?.displayName ??
                    `AI Agent ${index + 1}`}
                </strong>
                <div className="agentEnrollmentTitleActions">
                  <span className={`agentEnrollmentBadge status-${enrollment.status}`}>
                    {enrollment.status === 'draft'
                      ? '准备配对'
                      : enrollment.status === 'awaiting_pairing'
                        ? `等待 ${providerCatalog.label}`
                        : enrollment.status === 'pending_parent_confirmation'
                          ? '等待主人确认'
                          : enrollment.status === 'active'
                            ? '已入园'
                            : enrollment.status}
                  </span>
                  {enrollment.status === 'draft' ||
                  enrollment.status === 'awaiting_pairing' ? (
                    <button
                      className="agentEnrollmentDelete"
                      type="button"
                      disabled={busyId !== null}
                      aria-label={`删除 ${enrollment.agent?.displayName ?? enrollment.draftProfile?.displayName ?? `AI Agent ${index + 1}`} 入园申请`}
                      onClick={() => void deleteEnrollment(enrollment)}
                    >
                      {busyId === enrollment.id ? '删除中…' : '删除'}
                    </button>
                  ) : null}
                </div>
              </div>

              {enrollment.status === 'draft' ? (
                <button
                  className="parentSecondaryAction"
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void issueCode(enrollment.id)}
                >
                  生成配对码
                </button>
              ) : null}

              {enrollment.status === 'awaiting_pairing' ? (
                <div className="agentPairingBox">
                  {secret ? (
                    <>
                      <div className="agentPairingCode">{secret.code}</div>
                      <p>
                        有效期至{' '}
                        {new Date(secret.expiresAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {providerCatalog.needsNativeAgentId ? (
                        <label>
                          <span>要配对的 {providerCatalog.identityLabel}</span>
                          <input
                            value={nativeAgentId}
                            placeholder="例如 main、design 或 frontend"
                            onChange={(event) =>
                              setNativeAgentIds((current) => ({
                                ...current,
                                [enrollment.id]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      ) : (
                        <>
                          <p>
                            Hermes 会为当前 profile 生成稳定 identity；profile 的可见名称不会作为全局唯一键。
                          </p>
                          <label>
                            <input
                              type="checkbox"
                              checked={shareReplies[enrollment.id] ?? false}
                              onChange={(event) =>
                                setShareReplies((current) => ({
                                  ...current,
                                  [enrollment.id]: event.target.checked,
                                }))
                              }
                            />
                            <span>允许发送清洗并截断到 280 字的最终回复气泡（可选）</span>
                          </label>
                        </>
                      )}
                      <code className="agentPairingCommand">{command}</code>
                      <div className="agentPairingActions">
                        <button
                          className="parentPrimaryAction"
                          type="button"
                          disabled={
                            providerCatalog.needsNativeAgentId &&
                            !nativeAgentId.trim()
                          }
                          onClick={() => void copyCommand(enrollment)}
                        >
                          复制配对命令
                        </button>
                        <button
                          className="parentSecondaryAction"
                          type="button"
                          onClick={() => void loadEnrollments()}
                        >
                          检查配对状态
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>
                        原配对码只显示一次，刷新后不会从服务器取回。
                        {enrollment.pairingExpired ? '它已经过期。' : ''}
                      </p>
                      <button
                        className="parentSecondaryAction"
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void issueCode(enrollment.id)}
                      >
                        重新生成配对码
                      </button>
                    </>
                  )}
                </div>
              ) : null}

              {enrollment.status === 'pending_parent_confirmation' && activation ? (
                <form
                  className="agentConfirmForm"
                  onSubmit={(event) => void activate(event, enrollment)}
                >
                  <p>
                    {providerCatalog.identityLabel}：
                    <strong>{enrollment.nativeAgentId}</strong>。请检查并决定哪些资料公开。
                  </p>
                  <label>
                    <span>Agent 展示名</span>
                    <input
                      required
                      maxLength={48}
                      value={activation.displayName}
                      onChange={(event) =>
                        updateActivation(enrollment.id, {
                          displayName: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>角色／职责（可选）</span>
                    <input
                      maxLength={80}
                      value={activation.role}
                      onChange={(event) =>
                        updateActivation(enrollment.id, { role: event.target.value })
                      }
                    />
                  </label>
                  <label className="parentFullField">
                    <span>性格简介（可选）</span>
                    <textarea
                      maxLength={240}
                      value={activation.personalitySummary}
                      onChange={(event) =>
                        updateActivation(enrollment.id, {
                          personalitySummary: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="parentFullField">
                    <span>公开能力标签（用逗号分隔，可选）</span>
                    <input
                      value={activation.capabilities}
                      onChange={(event) =>
                        updateActivation(enrollment.id, {
                          capabilities: event.target.value,
                        })
                      }
                    />
                  </label>
                  <fieldset className="agentVariantField parentFullField">
                    <legend>由主人选择角色外观</legend>
                    {enrollment.draftProfile?.characterVariant ? (
                      <p>
                        Agent 建议：
                        {VARIANT_LABELS[enrollment.draftProfile.characterVariant]}。建议不会自动选中。
                      </p>
                    ) : null}
                    <div className="agentVariantOptions">
                      {(Object.keys(VARIANT_LABELS) as CharacterVariant[]).map(
                        (variant) => (
                          <label key={variant}>
                            <input
                              type="radio"
                              name={`variant-${enrollment.id}`}
                              value={variant}
                              checked={activation.characterVariant === variant}
                              onChange={() =>
                                updateActivation(enrollment.id, {
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
                    idPrefix={`activation-${enrollment.id}`}
                    characterVariant={activation.characterVariant}
                    value={activation.appearancePreset}
                    disabled={busyId !== null}
                    onChange={(appearancePreset) =>
                      updateActivation(enrollment.id, { appearancePreset })
                    }
                  />
                  <label>
                    <span>标识色（可选）</span>
                    <input
                      type="color"
                      value={activation.color}
                      onChange={(event) =>
                        updateActivation(enrollment.id, { color: event.target.value })
                      }
                    />
                  </label>
                  <div className="agentConfirmActions">
                    <button
                      className="parentPrimaryAction"
                      type="submit"
                      disabled={busyId !== null || !activation.characterVariant}
                    >
                      {busyId === enrollment.id ? '确认中…' : '确认资料并入园'}
                    </button>
                  </div>
                </form>
              ) : null}

              {enrollment.status === 'active' && enrollment.agent ? (
                <div className="agentActiveSummary">
                  <span aria-hidden="true">✅</span>
                  <div>
                    <strong>{enrollment.agent.displayName} 已入园</strong>
                    <p>
                      {providerCatalog.label} · {providerCatalog.identityLabel}：
                      {enrollment.nativeAgentId} · 外观：
                      {VARIANT_LABELS[enrollment.agent.characterVariant]} ·{' '}
                      {APPEARANCE_PRESET_LABELS[
                        enrollment.agent.appearancePreset ?? 'classic'
                      ]}
                    </p>
                    <p>Agent 已在园；打开教室会直接恢复它的当前状态。</p>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {notice ? (
        <p className={notice.includes('失败') || notice.includes('错误') ? 'parentError' : 'parentNotice'}>
          {notice}
        </p>
      ) : null}
    </section>
  );
}
