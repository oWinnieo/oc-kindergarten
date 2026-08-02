import type { AgentProvider } from './provider-binding-contract';

const OPENCLAW_PLUGIN_VERSION = 'v0.5.0-beta.4';
export const HERMES_PLUGIN_VERSION = 'v0.1.0-beta.1';
export const HERMES_PLUGIN_COMMIT =
  '9e32d7619c5b9b331704c725ff43ef5bebd8a0e6';

export const AGENT_DEPLOYMENTS = ['host', 'docker'] as const;
export type AgentDeployment = (typeof AGENT_DEPLOYMENTS)[number];

export interface RuntimeCommandSettings {
  composeDirectory?: string;
  composeFiles?: string[];
  gatewayService?: string;
  cliService?: string;
  hermesHome?: string;
}

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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function composeCommand(settings: RuntimeCommandSettings): string {
  const files = (settings.composeFiles ?? []).filter((file) => file.trim());
  return [
    'docker compose',
    ...files.map((file) => `-f ${shellQuote(file.trim())}`),
  ].join(' ');
}

function composeDirectoryCommand(settings: RuntimeCommandSettings): string {
  return `cd ${shellQuote(
    settings.composeDirectory?.trim() || 'YOUR_COMPOSE_DIRECTORY',
  )}`;
}

function hermesHome(settings: RuntimeCommandSettings, deployment: AgentDeployment) {
  const fallback = deployment === 'docker' ? '/opt/data' : '';
  return settings.hermesHome?.trim() || fallback;
}

function buildHermesHostInstallCommand(settings: RuntimeCommandSettings): string {
  const profileHome = hermesHome(settings, 'host');
  return [
    ...(profileHome ? [`export HERMES_HOME=${shellQuote(profileHome)}`] : []),
    HERMES_INSTALL_COMMAND,
  ].join('\n');
}

function buildOpenClawDockerInstallCommand(
  settings: RuntimeCommandSettings,
): string {
  const compose = composeCommand(settings);
  const cliService = settings.cliService?.trim() || 'openclaw-cli';
  const gatewayService =
    settings.gatewayService?.trim() || 'openclaw-gateway';
  return [
    composeDirectoryCommand(settings),
    `${compose} run --rm ${cliService} plugins install 'git:https://github.com/oWinnieo/oc-kindergarten-openclaw-plugin.git#${OPENCLAW_PLUGIN_VERSION}' --force`,
    `${compose} run --rm ${cliService} plugins enable oc-kindergarten-bridge`,
    `${compose} run --rm ${cliService} config set 'plugins.entries["oc-kindergarten-bridge"].hooks.allowConversationAccess' true --strict-json`,
    `${compose} run --rm ${cliService} config set 'plugins.entries["oc-kindergarten-bridge"].config.shareAssistantMessages' true --strict-json`,
    `${compose} restart ${gatewayService}`,
    `${compose} run --rm ${cliService} kindergarten status`,
    `${compose} run --rm ${cliService} plugins doctor`,
  ].join('\n');
}

function buildHermesDockerInstallCommand(
  settings: RuntimeCommandSettings,
): string {
  const compose = composeCommand(settings);
  const gatewayService = settings.gatewayService?.trim() || 'gateway';
  const profileHome = hermesHome(settings, 'docker');
  return [
    composeDirectoryCommand(settings),
    `${compose} exec --user hermes \\`,
    '  -e HOME=/opt/data \\',
    `  -e HERMES_HOME=${shellQuote(profileHome)} \\`,
    `  ${gatewayService} sh -lc '`,
    'set -eu',
    'HERMES_PROFILE_HOME="${HERMES_HOME:-$HOME/.hermes}"',
    'HERMES_PLUGIN_DIR="$HERMES_PROFILE_HOME/plugins/oc-kindergarten"',
    'test ! -e "$HERMES_PLUGIN_DIR" || { echo "oc-kindergarten already exists; stop and use the tested upgrade guide"; exit 1; }',
    `git clone --depth 1 --branch ${HERMES_PLUGIN_VERSION} https://github.com/oWinnieo/oc-kindergarten-hermes-plugin.git "$HERMES_PLUGIN_DIR"`,
    `test "$(git -C "$HERMES_PLUGIN_DIR" rev-parse HEAD)" = "${HERMES_PLUGIN_COMMIT}" || { echo "commit verification failed"; exit 1; }`,
    'hermes plugins enable oc-kindergarten',
    'hermes kindergarten doctor',
    "'",
    `${compose} restart ${gatewayService}`,
  ].join('\n');
}

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
  settings?: RuntimeCommandSettings;
}): string {
  const settings = options.settings ?? {};
  if (options.deployment === 'host') {
    return options.provider === 'hermes'
      ? buildHermesHostInstallCommand(settings)
      : AGENT_PROVIDER_CATALOG[options.provider].installCommand;
  }
  return options.provider === 'hermes'
    ? buildHermesDockerInstallCommand(settings)
    : buildOpenClawDockerInstallCommand(settings);
}

export function buildRuntimePairingCommand(options: {
  provider: AgentProvider;
  deployment?: AgentDeployment;
  pairingCode: string;
  endpoint: string;
  nativeAgentId?: string;
  shareReplies?: boolean;
  settings?: RuntimeCommandSettings;
}): string {
  const deployment = options.deployment ?? 'host';
  const settings = options.settings ?? {};
  if (options.provider === 'hermes') {
    const pairArguments = `kindergarten pair ${options.pairingCode} --endpoint ${shellQuote(options.endpoint)}${
      options.shareReplies ? ' --share-replies' : ''
    }`;
    if (deployment === 'docker') {
      const compose = composeCommand(settings);
      const gatewayService = settings.gatewayService?.trim() || 'gateway';
      const profileHome = hermesHome(settings, 'docker');
      return [
        composeDirectoryCommand(settings),
        `${compose} exec --user hermes -e HOME=/opt/data -e HERMES_HOME=${shellQuote(profileHome)} ${gatewayService} hermes ${pairArguments}`,
        `${compose} restart ${gatewayService}`,
      ].join('\n');
    }
    const profileHome = hermesHome(settings, 'host');
    return [
      ...(profileHome ? [`export HERMES_HOME=${shellQuote(profileHome)}`] : []),
      `hermes ${pairArguments}`,
      'hermes gateway restart',
    ].join('\n');
  }
  if (deployment === 'docker') {
    const compose = composeCommand(settings);
    const cliService = settings.cliService?.trim() || 'openclaw-cli';
    const gatewayService =
      settings.gatewayService?.trim() || 'openclaw-gateway';
    return [
      composeDirectoryCommand(settings),
      `${compose} run --rm ${cliService} kindergarten pair ${options.pairingCode} --agent ${
        options.nativeAgentId || 'YOUR_AGENT_ID'
      }`,
      `${compose} restart ${gatewayService}`,
    ].join('\n');
  }
  return [
    `openclaw kindergarten pair ${options.pairingCode} --agent ${
      options.nativeAgentId || 'YOUR_AGENT_ID'
    }`,
    'openclaw kindergarten apply',
  ].join('\n');
}
