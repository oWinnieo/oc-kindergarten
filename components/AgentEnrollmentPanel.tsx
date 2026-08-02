'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import type { AgentAppearancePreset } from '@/lib/agent-registry-contract';
import {
  AGENT_DEPLOYMENTS,
  AGENT_PROVIDER_CATALOG,
  buildPluginInstallCommand,
  buildRuntimeInspectionCommand,
  buildRuntimePairingCommand,
  deploymentLabel,
  providerLabel,
} from '@/lib/agent-provider-catalog';
import type { AgentDeployment } from '@/lib/agent-provider-catalog';
import type { RuntimeCommandSettings } from '@/lib/agent-provider-catalog';
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

interface RuntimeCommandFormState {
  composeDirectory: string;
  composeFiles: string;
  gatewayService: string;
  cliService: string;
  hermesHostHome: string;
  hermesDockerHome: string;
}

const DEFAULT_COMMAND_FORMS: Record<AgentProvider, RuntimeCommandFormState> = {
  hermes: {
    composeDirectory: '',
    composeFiles: '',
    gatewayService: 'gateway',
    cliService: '',
    hermesHostHome: '',
    hermesDockerHome: '/opt/data',
  },
  openclaw: {
    composeDirectory: '',
    composeFiles: '',
    gatewayService: 'openclaw-gateway',
    cliService: 'openclaw-cli',
    hermesHostHome: '',
    hermesDockerHome: '',
  },
};

const COMPOSE_SERVICE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function commandSettings(
  provider: AgentProvider,
  deployment: AgentDeployment,
  form: RuntimeCommandFormState,
): RuntimeCommandSettings {
  return {
    composeDirectory: form.composeDirectory.trim(),
    composeFiles: form.composeFiles
      .split('\n')
      .map((file) => file.trim())
      .filter(Boolean),
    gatewayService: form.gatewayService.trim(),
    cliService: form.cliService.trim(),
    hermesHome:
      provider === 'hermes'
        ? deployment === 'docker'
          ? form.hermesDockerHome.trim()
          : form.hermesHostHome.trim()
        : undefined,
  };
}

function commandSettingsError(
  provider: AgentProvider,
  deployment: AgentDeployment,
  form: RuntimeCommandFormState,
): string {
  if (deployment === 'host') {
    if (
      provider === 'hermes' &&
      form.hermesHostHome.trim() &&
      !form.hermesHostHome.trim().startsWith('/')
    ) {
      return '命名 profile 的 HERMES_HOME 请填写容器或宿主机中的绝对路径。';
    }
    return '';
  }
  if (!form.composeDirectory.trim()) {
    return '请填写 Docker Compose 目录，生成的命令会先进入该目录。';
  }
  if (!COMPOSE_SERVICE_PATTERN.test(form.gatewayService.trim())) {
    return 'Gateway 服务名格式不正确。';
  }
  if (
    provider === 'openclaw' &&
    !COMPOSE_SERVICE_PATTERN.test(form.cliService.trim())
  ) {
    return 'OpenClaw CLI 服务名格式不正确。';
  }
  if (
    provider === 'hermes' &&
    !form.hermesDockerHome.trim().startsWith('/')
  ) {
    return 'Docker 内的 HERMES_HOME 必须是绝对路径。';
  }
  return '';
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
  const [deployment, setDeployment] = useState<AgentDeployment>('docker');
  const [commandForms, setCommandForms] = useState(DEFAULT_COMMAND_FORMS);
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
    const form = commandForms[provider];
    const settingsError = commandSettingsError(provider, deployment, form);
    if (settingsError) {
      setNotice(settingsError);
      return;
    }
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
          deployment,
          pairingCode: secret.code,
          endpoint: window.location.origin,
          nativeAgentId,
          shareReplies: shareReplies[enrollmentId] ?? false,
          settings: commandSettings(provider, deployment, form),
        }),
      );
      setNotice(
        `配对命令已复制。请在 ${deploymentLabel(deployment)} 的正确终端执行。`,
      );
    } catch {
      setNotice('浏览器无法复制，请手动复制命令。');
    }
  };

  const copyPluginInstallCommand = async (provider: AgentProvider) => {
    const form = commandForms[provider];
    const settingsError = commandSettingsError(provider, deployment, form);
    if (settingsError) {
      setNotice(settingsError);
      return;
    }
    try {
      await navigator.clipboard.writeText(
        buildPluginInstallCommand({
          provider,
          deployment,
          settings: commandSettings(provider, deployment, form),
        }),
      );
      setNotice(
        `${providerLabel(provider)} · ${deploymentLabel(deployment)} 插件安装命令已复制。`,
      );
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
  const selectedCommandForm = commandForms[newProvider];
  const selectedSettingsError = commandSettingsError(
    newProvider,
    deployment,
    selectedCommandForm,
  );
  const selectedInstallCommand = buildPluginInstallCommand({
    provider: newProvider,
    deployment,
    settings: commandSettings(newProvider, deployment, selectedCommandForm),
  });
  const selectedInspectionCommand = buildRuntimeInspectionCommand({
    provider: newProvider,
    deployment,
    settings: commandSettings(newProvider, deployment, selectedCommandForm),
  });

  const updateCommandForm = (patch: Partial<RuntimeCommandFormState>) => {
    setCommandForms((current) => ({
      ...current,
      [newProvider]: { ...current[newProvider], ...patch },
    }));
  };

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
          disabled={busyId !== null || Boolean(selectedSettingsError)}
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

      <fieldset className="agentVariantField">
        <legend>它安装在哪里？</legend>
        <div className="agentVariantOptions agentDeploymentOptions">
          {AGENT_DEPLOYMENTS.map((candidate) => (
            <label key={candidate}>
              <input
                type="radio"
                name="new-agent-deployment"
                value={candidate}
                checked={deployment === candidate}
                onChange={() => setDeployment(candidate)}
              />
              <span>{deploymentLabel(candidate)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="agentVariantField agentCommandSettings">
        <legend>命令参数</legend>
        <p>
          这里只在浏览器中生成命令，不会把服务器路径或服务名提交给幼儿园。
          安装命令和后面的配对命令会同步使用这些值。
        </p>
        {deployment === 'docker' ? (
          <div className="agentCommandSettingsGrid">
            <label>
              <span>Docker Compose 目录（必填）</span>
              <input
                value={selectedCommandForm.composeDirectory}
                placeholder={
                  newProvider === 'hermes'
                    ? '/opt/docker/hermes-agent'
                    : '/opt/docker/openclaw'
                }
                onChange={(event) =>
                  updateCommandForm({ composeDirectory: event.target.value })
                }
              />
              <small>
                获取：执行下方第 1 段，复制目标 runtime 那一行的{' '}
                <code>dir=</code> 值。
              </small>
            </label>
            <label>
              <span>Gateway 服务名</span>
              <input
                value={selectedCommandForm.gatewayService}
                onChange={(event) =>
                  updateCommandForm({ gatewayService: event.target.value })
                }
              />
              <small>
                获取：执行下方第 1 段，找到 Gateway 容器所在行，复制{' '}
                <code>service=</code> 值。
              </small>
            </label>
            {newProvider === 'openclaw' ? (
              <label>
                <span>OpenClaw CLI 服务名</span>
                <input
                  value={selectedCommandForm.cliService}
                  onChange={(event) =>
                    updateCommandForm({ cliService: event.target.value })
                  }
                />
                <small>
                  获取：执行下方第 1 段，找到 CLI 容器所在行，复制{' '}
                  <code>service=</code> 值。
                </small>
              </label>
            ) : (
              <label>
                <span>容器内 HERMES_HOME</span>
                <input
                  value={selectedCommandForm.hermesDockerHome}
                  placeholder="/opt/data 或 /opt/data/profiles/YOUR_PROFILE"
                  onChange={(event) =>
                    updateCommandForm({ hermesDockerHome: event.target.value })
                  }
                />
                <small>
                  获取：先填好 Compose 和 Gateway，再执行下方第 2 段，复制{' '}
                  <code>HERMES_HOME=</code> 值。
                </small>
              </label>
            )}
            <label className="agentCommandSettingsWide">
              <span>Compose 文件列表（可选，每行一个）</span>
              <textarea
                value={selectedCommandForm.composeFiles}
                placeholder={'docker-compose.yml\ndocker-compose.override.yml'}
                onChange={(event) =>
                  updateCommandForm({ composeFiles: event.target.value })
                }
              />
              <small>
                获取：查看下方第 1 段输出的 <code>files=</code>；多个文件按原顺序每行一个。
                留空时使用 Docker Compose 自动发现；填写后会生成每一个 <code>-f</code> 参数。
              </small>
            </label>
          </div>
        ) : newProvider === 'hermes' ? (
          <label>
            <span>命名 profile 的 HERMES_HOME（可选）</span>
            <input
              value={selectedCommandForm.hermesHostHome}
              placeholder="/home/hermes/.hermes/profiles/YOUR_PROFILE"
              onChange={(event) =>
                updateCommandForm({ hermesHostHome: event.target.value })
              }
            />
            <small>
              获取：用运行 Gateway 的系统账号执行下方第一行。默认 profile 请留空；
              命名 profile 填输出的绝对路径，安装和配对会沿用它。
            </small>
          </label>
        ) : (
          <p>
            OpenClaw 宿主机插件安装命令没有需要替换的部署参数；生成配对码后只需填写
            Agent ID。
          </p>
        )}
        {selectedSettingsError ? (
          <p className="agentCommandSettingsError">{selectedSettingsError}</p>
        ) : null}
        <div className="agentCommandLookup">
          <div>
            <strong>这些值怎么获取？</strong>
            {deployment === 'docker' ? (
              <ol>
                <li>
                  在 Docker 宿主机执行下方第 1 段。找到镜像名称属于{' '}
                  {selectedProvider.label} 的那一行。
                </li>
                <li>
                  将 <code>dir=</code> 后面的值填入“Docker Compose 目录”；
                  将 <code>service=</code> 后面的值填入对应服务名。
                </li>
                <li>
                  <code>files=</code> 后面如果有多个文件，按原顺序拆成每行一个；
                  如果为空，而且管理员平时没有使用 <code>-f</code> 或{' '}
                  <code>COMPOSE_FILE</code>，文件列表保持空白。
                </li>
                {newProvider === 'hermes' ? (
                  <li>
                    填完前三项后执行第 2 段；最后一行输出的{' '}
                    <code>HERMES_HOME=...</code> 就是当前 Gateway 实际使用的路径。
                  </li>
                ) : (
                  <li>
                    <code>docker compose config --services</code> 会再次列出服务名；
                    选择运行 Gateway 和 CLI 的服务。最后一行会列出 Agent ID。
                  </li>
                )}
              </ol>
            ) : newProvider === 'hermes' ? (
              <p>
                使用平时运行 Hermes Gateway 的同一个系统账号执行下方命令。
                第一行输出当前 <code>HERMES_HOME</code>；默认 profile
                请让表单保持空白，命名 profile 才填写该绝对路径。
              </p>
            ) : (
              <p>
                插件安装不需要部署参数。执行下方命令，从 Agent 列表复制要配对项的
                ID；不要复制展示名。
              </p>
            )}
          </div>
          <code className="agentPairingCommand agentInspectionCommand">
            {selectedInspectionCommand}
          </code>
          {deployment === 'docker' ? (
            <p>
              如果第 1 段显示 <code>&lt;no value&gt;</code>，或同一个 runtime
              有多个相似容器，请停止猜测，向服务器管理员索取启动时使用的 Compose
              目录、完整 <code>-f</code> 顺序和服务名。
            </p>
          ) : null}
        </div>
      </fieldset>

      <div className="agentPairingBox agentPluginSetup">
        <div>
          <span className="agentPluginStep">首次使用 · Private beta</span>
          <h3>
            先在 {selectedProvider.label} · {deploymentLabel(deployment)} 安装入园插件
          </h3>
        </div>
        <p>
          已测试版本：{selectedProvider.minimumVersion}。同一 profile 无需重复安装。
          {selectedProvider.restartCopy}
          {deployment === 'docker'
            ? ' 命令会先进入上方填写的 Docker Compose 目录，并使用同一组 Compose 文件、服务名和持久化目录。'
            : ' 请使用平时运行 Gateway 的同一个系统账号。'}
          {newProvider === 'hermes'
            ? ' 回复气泡默认关闭，只有配对时主动勾选才会发送清洗后的 280 字摘要。'
            : ' OpenClaw 插件会按 Agent ID 分别保存 scoped credential。'}
        </p>
        <code className="agentPairingCommand">
          {selectedInstallCommand}
        </code>
        <div className="agentPairingActions">
          <button
            className="parentSecondaryAction"
            type="button"
            disabled={Boolean(selectedSettingsError)}
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
          const enrollmentCommandForm = commandForms[provider];
          const enrollmentSettingsError = commandSettingsError(
            provider,
            deployment,
            enrollmentCommandForm,
          );
          const command = secret
            ? buildRuntimePairingCommand({
                provider,
                deployment,
                pairingCode: secret.code,
                endpoint:
                  typeof window === 'undefined'
                    ? 'https://YOUR_KINDERGARTEN_HOST'
                    : window.location.origin,
                nativeAgentId: nativeAgentId.trim() || undefined,
                shareReplies: shareReplies[enrollment.id] ?? false,
                settings: commandSettings(
                  provider,
                  deployment,
                  enrollmentCommandForm,
                ),
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
                          <small>
                            获取方法：执行上方“这些值怎么获取？”中的最后一行 Agent
                            列表命令，复制目标 Agent 的 ID 列，不要填写展示名。
                          </small>
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
                      <p>
                        配对命令会同步使用上方为 {providerCatalog.label} ·{' '}
                        {deploymentLabel(deployment)} 填写的部署参数。
                      </p>
                      {enrollmentSettingsError ? (
                        <p className="agentCommandSettingsError">
                          {enrollmentSettingsError}
                        </p>
                      ) : null}
                      <code className="agentPairingCommand">{command}</code>
                      <div className="agentPairingActions">
                        <button
                          className="parentPrimaryAction"
                          type="button"
                          disabled={
                            Boolean(enrollmentSettingsError) ||
                            (providerCatalog.needsNativeAgentId &&
                              !nativeAgentId.trim())
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
