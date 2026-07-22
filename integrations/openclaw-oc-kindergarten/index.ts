import { randomUUID } from "node:crypto";

type BridgeConfig = {
  endpoint?: string;
  pairingEndpoint?: string;
  token?: string;
  identityMode?: "static" | "server";
  defaultAgentId?: string;
  agentMap?: Record<string, string>;
  unmappedAgentPolicy?: "skip" | "default";
};

type HookContext = {
  agentId?: string;
  runId?: string;
  sessionKey?: string;
  sessionId?: string;
  messageProvider?: string;
  trigger?: string;
  channelId?: string;
};

const DEFAULT_ENDPOINT = "http://127.0.0.1:3000/api/openclaw/events";
const DEFAULT_AGENT_ID = "agent-scout";
const BRIDGE_ADAPTER_VERSION = "2.1.0";
const PLUGIN_VERSION = "0.4.0";

function optionalMessageContent(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return Array.from(normalized).slice(0, 280).join("");
}

function isChannelMessageRun(context: HookContext): boolean {
  if (context.trigger === "user") return true;
  if (context.messageProvider || context.channelId) return true;
  return /(?:^|:)(?:telegram|discord|slack|whatsapp|signal|imessage|line|matrix|webchat)(?:$|:)/i.test(
    context.sessionKey ?? "",
  );
}

function messageText(value: unknown): string | undefined {
  if (typeof value === "string") return optionalMessageContent(value);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.type === "string" &&
    record.type !== "text" &&
    record.type !== "output_text"
  ) {
    return undefined;
  }
  return optionalMessageContent(record.text) ?? optionalMessageContent(record.content);
}

function finalAssistantMessage(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (typeof candidate !== "object" || candidate === null) continue;
    const message = candidate as Record<string, unknown>;
    if (message.role !== "assistant") continue;
    if (typeof message.content === "string") {
      return optionalMessageContent(message.content);
    }
    if (Array.isArray(message.content)) {
      const content = message.content
        .map(messageText)
        .filter((item): item is string => Boolean(item))
        .join(" ");
      const normalized = optionalMessageContent(content);
      if (normalized) return normalized;
    }
  }
  return undefined;
}

function derivePairingEndpoint(endpoint: string): string {
  return new URL("/api/runtime/enrollments/pair", endpoint).toString();
}

function contextFields(context: HookContext) {
  return {
    ...(context.runId ? { runId: context.runId } : {}),
    ...(context.sessionKey ? { sessionKey: context.sessionKey } : {}),
    ...(context.sessionId ? { sessionId: context.sessionId } : {}),
  };
}

const plugin = {
  id: "oc-kindergarten-bridge",
  name: "OC Kindergarten Bridge",
  description: "Projects OpenClaw lifecycle hooks into Agent Event API v1.",
  register(api) {
    const config = (api.pluginConfig ?? {}) as BridgeConfig;
    const endpoint = config.endpoint?.trim() || DEFAULT_ENDPOINT;
    const pairingEndpoint =
      config.pairingEndpoint?.trim() || derivePairingEndpoint(endpoint);
    const token = config.token?.trim();
    const identityMode = config.identityMode ?? "static";
    const defaultAgentId = config.defaultAgentId?.trim() || DEFAULT_AGENT_ID;
    const agentMap = config.agentMap ?? {};
    const unmappedAgentPolicy = config.unmappedAgentPolicy ?? "skip";
    const gatewayInstanceId = randomUUID();
    const sessionClassroomAgentMap = new Map<string, string>();
    const sessionNativeAgentMap = new Map<string, string>();
    const seenNativeAgentIds = new Set<string>();
    const warnedUnmappedAgentIds = new Set<string>();
    const warnedPendingAgentIds = new Set<string>();
    let bridgeSequence = 0;
    let deliveryQueue = Promise.resolve();

    const resolveClassroomAgentId = (
      context: HookContext,
    ): string | undefined => {
      if (context.agentId) {
        const mappedAgentId = agentMap[context.agentId]?.trim();
        if (mappedAgentId) return mappedAgentId;
        if (unmappedAgentPolicy === "default") return defaultAgentId;
        if (!warnedUnmappedAgentIds.has(context.agentId)) {
          warnedUnmappedAgentIds.add(context.agentId);
          api.logger.warn(
            `OC Kindergarten bridge skipped unmapped OpenClaw Agent: ${context.agentId}`,
          );
        }
        return undefined;
      }
      if (
        context.sessionKey &&
        sessionClassroomAgentMap.has(context.sessionKey)
      ) {
        return sessionClassroomAgentMap.get(context.sessionKey);
      }
      return defaultAgentId;
    };

    const resolveNativeAgentId = (
      context: HookContext,
      forcedNativeAgentId?: string,
    ): string | undefined => {
      const nativeAgentId =
        forcedNativeAgentId ??
        context.agentId ??
        (context.sessionKey
          ? sessionNativeAgentMap.get(context.sessionKey)
          : undefined);
      if (!nativeAgentId) return undefined;
      seenNativeAgentIds.add(nativeAgentId);
      if (context.sessionKey) {
        sessionNativeAgentMap.set(context.sessionKey, nativeAgentId);
      }
      return nativeAgentId;
    };

    const hasRoutableAgentIdentity = (context: HookContext): boolean =>
      Boolean(
        context.agentId ||
          (context.sessionKey &&
            (identityMode === "server"
              ? sessionNativeAgentMap.has(context.sessionKey)
              : sessionClassroomAgentMap.has(context.sessionKey))),
      );

    const postTo = async (
      target: string,
      payload: Record<string, unknown>,
    ): Promise<Record<string, unknown>> => {
      let lastError: unknown;
      for (const delayMs of [0, 250, 750]) {
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        try {
          const response = await fetch(target, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          const responseText = await response.text();
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${responseText}`);
          }
          if (!responseText) return {};
          try {
            const parsed = JSON.parse(responseText);
            return typeof parsed === "object" && parsed !== null ? parsed : {};
          } catch {
            return {};
          }
        } catch (error) {
          lastError = error;
        } finally {
          clearTimeout(timeout);
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    };

    const post = (payload: Record<string, unknown>) => postTo(endpoint, payload);

    const enqueue = (
      payload: Record<string, unknown>,
      nativeAgentId?: string,
    ) => {
      deliveryQueue = deliveryQueue
        .then(async () => {
          const response = await post(payload);
          if (
            nativeAgentId &&
            (response.ignored === "pending_binding" ||
              response.ignored === "revoked_binding")
          ) {
            if (!warnedPendingAgentIds.has(nativeAgentId)) {
              warnedPendingAgentIds.add(nativeAgentId);
              api.logger.warn(
                `OC Kindergarten bridge waiting for server binding: ${nativeAgentId}`,
              );
            }
          } else if (nativeAgentId) {
            warnedPendingAgentIds.delete(nativeAgentId);
          }
        })
        .catch((error: unknown) => {
          api.logger.warn(
            `OC Kindergarten bridge delivery failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      return deliveryQueue;
    };

    const emitStatic = (
      hook: string,
      context: HookContext,
      data: Record<string, unknown>,
      forcedClassroomAgentId?: string,
    ) => {
      const classroomAgentId =
        forcedClassroomAgentId ?? resolveClassroomAgentId(context);
      if (!classroomAgentId) return;
      bridgeSequence += 1;
      if (context.sessionKey) {
        sessionClassroomAgentMap.set(context.sessionKey, classroomAgentId);
      }
      return enqueue({
        bridgeVersion: 1,
        kind: "openclaw.hook",
        bridgeEventId: `openclaw:${gatewayInstanceId}:${bridgeSequence}`,
        hook,
        classroomAgentId,
        observedAt: new Date().toISOString(),
        ...(context.agentId ? { nativeAgentId: context.agentId } : {}),
        ...contextFields(context),
        data,
      });
    };

    const emitServerResolved = (
      hook: string,
      context: HookContext,
      data: Record<string, unknown>,
      forcedNativeAgentId?: string,
    ) => {
      const nativeAgentId = resolveNativeAgentId(
        context,
        forcedNativeAgentId,
      );
      if (!nativeAgentId) return;
      bridgeSequence += 1;
      return enqueue(
        {
          bridgeVersion: 2,
          kind: "openclaw.hook",
          bridgeEventId: `openclaw:${gatewayInstanceId}:${bridgeSequence}`,
          provider: "openclaw",
          nativeAgentId,
          runtimeInstanceId: gatewayInstanceId,
          adapterVersion: BRIDGE_ADAPTER_VERSION,
          hook,
          observedAt: new Date().toISOString(),
          ...contextFields(context),
          data,
        },
        nativeAgentId,
      );
    };

    const emit = (
      hook: string,
      context: HookContext,
      data: Record<string, unknown>,
      forcedIdentity?: string,
    ) =>
      identityMode === "server"
        ? emitServerResolved(hook, context, data, forcedIdentity)
        : emitStatic(hook, context, data, forcedIdentity);

    const configuredClassroomAgents = () =>
      [...new Set([defaultAgentId, ...Object.values(agentMap)].filter(Boolean))];

    const configuredNativeAgents = () =>
      [...new Set([...Object.keys(agentMap), ...seenNativeAgentIds])];

    api.registerCli(
      ({ program, config: openClawConfig }) => {
        const kindergarten = program
          .command("kindergarten")
          .description("OC Kindergarten enrollment commands");

        kindergarten
          .command("pair")
          .description("Pair one local OpenClaw Agent with a parent enrollment")
          .argument("<pairing-code>", "One-time code shown by OC Kindergarten")
          .requiredOption("--agent <native-agent-id>", "OpenClaw Agent ID")
          .option("--display-name <name>", "Suggested public display name")
          .option("--role <role>", "Suggested public role")
          .option(
            "--character-variant <variant>",
            "Optional suggestion: boy, girl, or genderless",
          )
          .option("--color <hex>", "Optional #RRGGBB color suggestion")
          .option(
            "--capabilities <csv>",
            "Optional comma-separated public capability tags",
          )
          .action(async (pairingCode, options) => {
            if (!token) {
              throw new Error(
                "OC Kindergarten Agent event token is not configured",
              );
            }
            const nativeAgentId = String(options.agent ?? "").trim();
            if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(nativeAgentId)) {
              throw new Error("OpenClaw Agent ID format is invalid");
            }
            const configuredAgents = Array.isArray(openClawConfig.agents?.list)
              ? openClawConfig.agents.list
              : [];
            const configuredAgent = configuredAgents.find(
              (agent) => agent.id === nativeAgentId,
            );
            if (!configuredAgent) {
              throw new Error(
                `OpenClaw Agent does not exist in this config: ${nativeAgentId}`,
              );
            }
            const characterVariant = options.characterVariant
              ? String(options.characterVariant).trim()
              : undefined;
            if (
              characterVariant &&
              !["boy", "girl", "genderless"].includes(characterVariant)
            ) {
              throw new Error(
                "character-variant must be boy, girl, or genderless",
              );
            }
            const capabilities = options.capabilities
              ? String(options.capabilities)
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
              : undefined;
            const displayName =
              String(options.displayName ?? "").trim() ||
              String(configuredAgent.name ?? "").trim() ||
              nativeAgentId;
            const role = String(options.role ?? "").trim() || undefined;
            const color = String(options.color ?? "").trim() || undefined;
            const profileDraft = {
              displayName,
              ...(role ? { role } : {}),
              ...(characterVariant ? { characterVariant } : {}),
              ...(color ? { color } : {}),
              ...(capabilities?.length ? { capabilities } : {}),
            };
            const response = await postTo(pairingEndpoint, {
              schemaVersion: 1,
              pairingCode,
              discovery: {
                schemaVersion: 1,
                provider: "openclaw",
                nativeAgentId,
                runtimeInstanceId: gatewayInstanceId,
                adapterVersion: `plugin-${PLUGIN_VERSION}`,
                profileDraft,
              },
            });
            const pairing: Record<string, unknown> =
              typeof response.pairing === "object" && response.pairing !== null
                ? (response.pairing as Record<string, unknown>)
                : {};
            console.log(
              JSON.stringify(
                {
                  ok: response.ok === true,
                  enrollmentId: pairing.enrollmentId,
                  status: pairing.status,
                  provider: pairing.provider,
                  nativeAgentId: pairing.nativeAgentId,
                  next: "Return to OC Kindergarten and confirm the Agent profile.",
                },
                null,
                2,
              ),
            );
          });
      },
      { commands: ["kindergarten"] },
    );

    api.on("gateway_start", (event) => {
      const identities =
        identityMode === "server"
          ? configuredNativeAgents()
          : configuredClassroomAgents();
      for (const identity of identities) {
        void emit("gateway_start", {}, { port: event.port }, identity);
      }
    });

    // OpenClaw 2026.3.x calls this hook before_agent_start. The bridge keeps
    // the provider-neutral v1 wire name before_agent_run for compatibility
    // with the server adapter and newer Gateway releases.
    api.on("before_agent_start", (event, context) => {
      const messageContent = isChannelMessageRun(context)
        ? optionalMessageContent(event.prompt)
        : undefined;
      void emit("before_agent_run", context, {
        ...(messageContent ? { messageContent } : {}),
      });
    });

    api.on("before_tool_call", (event, context) => {
      void emit("before_tool_call", context, {
        toolName: event.toolName,
        ...(event.toolCallId ? { toolCallId: event.toolCallId } : {}),
      });
    });

    api.on("after_tool_call", (event, context) => {
      void emit("after_tool_call", context, {
        toolName: event.toolName,
        ...(event.toolCallId ? { toolCallId: event.toolCallId } : {}),
        ...(event.error ? { error: "tool_failed" } : {}),
        ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
      });
    });

    api.on("agent_end", (event, context) => {
      const messageContent = event.success
        ? finalAssistantMessage(event.messages)
        : undefined;
      void emit("agent_end", context, {
        success: event.success,
        ...(messageContent ? { messageContent } : {}),
        ...(event.error ? { error: "agent_failed" } : {}),
        ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
      });
    });

    api.on("message_sending", (_event, context) => {
      // OpenClaw 2026.3.x message hooks normally omit agentId/sessionKey.
      // Skipping an unresolvable hook prevents one Agent's delivery state
      // from being assigned to the configured default Agent.
      if (!hasRoutableAgentIdentity(context)) return;
      void emit("message_sending", context, {});
    });

    api.on("message_sent", (event, context) => {
      if (!hasRoutableAgentIdentity(context)) return;
      void emit("message_sent", context, {
        success: event.success,
        ...(event.error ? { error: "message_failed" } : {}),
      });
    });

    api.on("gateway_stop", async (event) => {
      const identities =
        identityMode === "server"
          ? configuredNativeAgents()
          : configuredClassroomAgents();
      for (const identity of identities) {
        await emit(
          "gateway_stop",
          {},
          { ...(event.reason ? { reason: event.reason } : {}) },
          identity,
        );
      }
      await deliveryQueue;
    });
  },
};

export default plugin;
