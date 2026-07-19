import type { AgentRegistryChange } from '@/lib/agent-registry';
import {
  DURABLE_REPLAY_BATCH_SIZE,
  dispatchPendingOutbox,
  registryChangesAfter,
  snapshotAgentProfiles,
} from '@/lib/durable-agent-store';
import { durableLiveEvents } from '@/lib/durable-live-events';
import type { DurableRegistryChange } from '@/lib/durable-live-events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const encoder = new TextEncoder();

function parseCursor(request: Request): number | null {
  const header = request.headers.get('last-event-id')?.trim();
  if (!header) return null;
  const match = /^registry:(\d+)$/.exec(header);
  if (!match) return null;
  const cursor = Number(match[1]);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : null;
}

function encodeChange(
  change: AgentRegistryChange,
  cursor?: number,
): Uint8Array {
  const id = cursor === undefined ? '' : `id: registry:${cursor}\n`;
  return encoder.encode(`${id}data: ${JSON.stringify(change)}\n\n`);
}

export async function GET(request: Request) {
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(': Agent Registry API v1 durable\n\n'));
      const pending: DurableRegistryChange[] = [];
      const seen = new Set<number>();
      let ready = false;

      const enqueue = (item: DurableRegistryChange) => {
        if (seen.has(item.cursor)) return;
        seen.add(item.cursor);
        controller.enqueue(encodeChange(item.change, item.cursor));
      };

      unsubscribe = durableLiveEvents.subscribeRegistryChanges((item) => {
        try {
          if (ready) enqueue(item);
          else pending.push(item);
        } catch {
          unsubscribe();
        }
      });

      void (async () => {
        await dispatchPendingOutbox();
        const cursor = parseCursor(request);
        if (cursor === null) {
          const profiles = await snapshotAgentProfiles();
          for (const profile of profiles) {
            controller.enqueue(
              encodeChange({
                type: 'agent.profile.upserted',
                agentId: profile.agentId,
                profile,
                revision: profile.revision,
                observedAt: profile.updatedAt,
              }),
            );
          }
        } else {
          let replayCursor = cursor;
          for (;;) {
            const changes = await registryChangesAfter(replayCursor);
            for (const change of changes) enqueue(change);
            if (changes.length < DURABLE_REPLAY_BATCH_SIZE) break;
            replayCursor = changes[changes.length - 1]?.cursor ?? replayCursor;
          }
        }
        ready = true;
        for (const item of pending) enqueue(item);
        pending.length = 0;
      })().catch((error) => controller.error(error));

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          unsubscribe();
        }
      }, 15000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    },
  });

  request.signal.addEventListener('abort', () => {
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe();
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
