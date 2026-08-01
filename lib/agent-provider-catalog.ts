import type { AgentProvider } from './provider-binding-contract';

const OPENCLAW_PLUGIN_VERSION = 'v0.5.0-beta.3';
export const HERMES_PLUGIN_VERSION = 'v0.1.0-beta.1';
export const HERMES_PLUGIN_COMMIT =
  '9e32d7619c5b9b331704c725ff43ef5bebd8a0e6';

export interface AgentProviderCatalogEntry {
  provider: AgentProvider;
  label: string;
  minimumVersion: string;
  identityLabel: string;
  needsNativeAgentId: boolean;
  installCommand: string;
  statusCommand: string;
  doctorCommand: string;
  restartCopy: string;
}

const OPENCLAW_INSTALL_COMMAND = [
  `openclaw plugins install 'git:https://github.com/oWinnieo/oc-kindergarten-openclaw-plugin.git#${OPENCLAW_PLUGIN_VERSION}' --force`,
  'openclaw plugins enable oc-kindergarten-bridge',
  `openclaw config set 'plugins.entries["oc-kindergarten-bridge"].hooks.allowConversationAccess' true --strict-json`,
  `openclaw config set 'plugins.entries["oc-kindergarten-bridge"].config.shareAssistantMessages' true --strict-json`,
  'openclaw gateway restart',
].join('\n');

const HERMES_INSTALL_COMMAND = [
  'HERMES_PROFILE_HOME="${HERMES_HOME:-$HOME/.hermes}"',
  'HERMES_PLUGIN_DIR="$HERMES_PROFILE_HOME/plugins/oc-kindergarten"',
  'test ! -e "$HERMES_PLUGIN_DIR" || { echo "oc-kindergarten already exists; stop and use the tested upgrade guide"; exit 1; }',
  `git clone --depth 1 --branch ${HERMES_PLUGIN_VERSION} https://github.com/oWinnieo/oc-kindergarten-hermes-plugin.git "$HERMES_PLUGIN_DIR"`,
  `test "$(git -C "$HERMES_PLUGIN_DIR" rev-parse HEAD)" = "${HERMES_PLUGIN_COMMIT}" || { echo "commit verification failed"; exit 1; }`,
  'hermes plugins enable oc-kindergarten',
  'hermes kindergarten doctor',
].join('\n');

export const AGENT_PROVIDER_CATALOG: Record<
  AgentProvider,
  AgentProviderCatalogEntry
> = {
  hermes: {
    provider: 'hermes',
    label: 'Hermes Agent',
    minimumVersion: 'v2026.7.30 / 0.19.1',
    identityLabel: 'Hermes profile',
    needsNativeAgentId: false,
    installCommand: HERMES_INSTALL_COMMAND,
    statusCommand: 'hermes kindergarten status',
    doctorCommand: 'hermes kindergarten doctor',
    restartCopy: 'CLI 立即生效；已运行的 Gateway 需重启一次才会加载新插件。',
  },
  openclaw: {
    provider: 'openclaw',
    label: 'OpenClaw',
    minimumVersion: '2026.7.1-2',
    identityLabel: 'OpenClaw Agent ID',
    needsNativeAgentId: true,
    installCommand: OPENCLAW_INSTALL_COMMAND,
    statusCommand: 'openclaw plugins list',
    doctorCommand: 'openclaw gateway status',
    restartCopy: '安装、升级或新增 hook 权限后需要重启 Gateway。',
  },
};

export function providerLabel(provider: AgentProvider | undefined): string {
  return provider ? AGENT_PROVIDER_CATALOG[provider].label : 'Agent runtime';
}

export function buildRuntimePairingCommand(options: {
  provider: AgentProvider;
  pairingCode: string;
  endpoint: string;
  nativeAgentId?: string;
  shareReplies?: boolean;
}): string {
  if (options.provider === 'hermes') {
    return [
      `hermes kindergarten pair ${options.pairingCode} --endpoint ${options.endpoint}${
        options.shareReplies ? ' --share-replies' : ''
      }`,
      '# 若 Gateway 正在运行，完成配对后重启 Gateway 一次',
    ].join('\n');
  }
  return [
    `openclaw kindergarten pair ${options.pairingCode} --agent ${
      options.nativeAgentId || 'YOUR_AGENT_ID'
    }`,
    'openclaw gateway restart',
  ].join('\n');
}
