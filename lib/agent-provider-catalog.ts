import type { AgentProvider } from './provider-binding-contract';

const OPENCLAW_PLUGIN_VERSION = 'v0.5.0-beta.4';
export const HERMES_PLUGIN_VERSION = 'v0.1.0-beta.1';
export const HERMES_PLUGIN_COMMIT =
  '9e32d7619c5b9b331704c725ff43ef5bebd8a0e6';

export const AGENT_DEPLOYMENTS = ['host', 'docker'] as const;
export type AgentDeployment = (typeof AGENT_DEPLOYMENTS)[number];

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
  'hermes gateway restart',
].join('\n');

const OPENCLAW_DOCKER_INSTALL_COMMAND = [
  `docker compose run --rm openclaw-cli plugins install 'git:https://github.com/oWinnieo/oc-kindergarten-openclaw-plugin.git#${OPENCLAW_PLUGIN_VERSION}' --force`,
  'docker compose run --rm openclaw-cli plugins enable oc-kindergarten-bridge',
  `docker compose run --rm openclaw-cli config set 'plugins.entries["oc-kindergarten-bridge"].hooks.allowConversationAccess' true --strict-json`,
  `docker compose run --rm openclaw-cli config set 'plugins.entries["oc-kindergarten-bridge"].config.shareAssistantMessages' true --strict-json`,
  'docker compose restart openclaw-gateway',
  'docker compose run --rm openclaw-cli kindergarten status',
  'docker compose run --rm openclaw-cli plugins doctor',
].join('\n');

const HERMES_DOCKER_INSTALL_COMMAND = [
  'docker compose exec --user hermes \\',
  '  -e HOME=/opt/data \\',
  '  -e HERMES_HOME=/opt/data \\',
  "  gateway sh -lc '",
  'set -eu',
  'HERMES_PROFILE_HOME="${HERMES_HOME:-$HOME/.hermes}"',
  'HERMES_PLUGIN_DIR="$HERMES_PROFILE_HOME/plugins/oc-kindergarten"',
  'test ! -e "$HERMES_PLUGIN_DIR" || { echo "oc-kindergarten already exists; stop and use the tested upgrade guide"; exit 1; }',
  `git clone --depth 1 --branch ${HERMES_PLUGIN_VERSION} https://github.com/oWinnieo/oc-kindergarten-hermes-plugin.git "$HERMES_PLUGIN_DIR"`,
  `test "$(git -C "$HERMES_PLUGIN_DIR" rev-parse HEAD)" = "${HERMES_PLUGIN_COMMIT}" || { echo "commit verification failed"; exit 1; }`,
  'hermes plugins enable oc-kindergarten',
  'hermes kindergarten doctor',
  "'",
  'docker compose restart gateway',
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
    statusCommand: 'openclaw kindergarten status',
    doctorCommand: 'openclaw plugins doctor',
    restartCopy: '安装、升级或新增 hook 权限后需要重启 Gateway。',
  },
};

export function providerLabel(provider: AgentProvider | undefined): string {
  return provider ? AGENT_PROVIDER_CATALOG[provider].label : 'Agent runtime';
}

export function deploymentLabel(deployment: AgentDeployment): string {
  return deployment === 'docker' ? 'Docker Compose' : '宿主机直接安装';
}

export function buildPluginInstallCommand(options: {
  provider: AgentProvider;
  deployment: AgentDeployment;
}): string {
  if (options.deployment === 'host') {
    return AGENT_PROVIDER_CATALOG[options.provider].installCommand;
  }
  return options.provider === 'hermes'
    ? HERMES_DOCKER_INSTALL_COMMAND
    : OPENCLAW_DOCKER_INSTALL_COMMAND;
}

export function buildRuntimePairingCommand(options: {
  provider: AgentProvider;
  deployment?: AgentDeployment;
  pairingCode: string;
  endpoint: string;
  nativeAgentId?: string;
  shareReplies?: boolean;
}): string {
  const deployment = options.deployment ?? 'host';
  if (options.provider === 'hermes') {
    const pairArguments = `kindergarten pair ${options.pairingCode} --endpoint ${options.endpoint}${
      options.shareReplies ? ' --share-replies' : ''
    }`;
    if (deployment === 'docker') {
      return [
        'docker compose exec --user hermes -e HOME=/opt/data -e HERMES_HOME=/opt/data gateway hermes ' +
          pairArguments,
        'docker compose restart gateway',
      ].join('\n');
    }
    return [
      `hermes ${pairArguments}`,
      'hermes gateway restart',
    ].join('\n');
  }
  if (deployment === 'docker') {
    return [
      `docker compose run --rm openclaw-cli kindergarten pair ${options.pairingCode} --agent ${
        options.nativeAgentId || 'YOUR_AGENT_ID'
      }`,
      'docker compose restart openclaw-gateway',
    ].join('\n');
  }
  return [
    `openclaw kindergarten pair ${options.pairingCode} --agent ${
      options.nativeAgentId || 'YOUR_AGENT_ID'
    }`,
    'openclaw kindergarten apply',
  ].join('\n');
}
