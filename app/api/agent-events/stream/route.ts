import {
  DURABLE_REPLAY_BATCH_SIZE,
  agentEventsAfter,
  dispatchPendingOutbox,
  snapshotAgentEvents,
} from '@/lib/durable-agent-store';
import { durableLiveEvents } from '@/lib/durable-live-events';
import type { DurableAgentEvent } from '@/lib/durable-live-events';
import {
  CLASSROOM_SNAPSHOT_END_SSE,
  encodeClassroomSnapshotSse,
} from '@/lib/classroom-snapshot-protocol';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const encoder = new TextEncoder();

function parseCursor(request: Request): number | null {
  const raw = request.headers.get('last-event-id')?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const cursor = Number(raw);
  return Number.isSafeInteger(cursor) && cursor >= 0 ? cursor : null;
}

function encodeEvent(stored: DurableAgentEvent): Uint8Array {
  return encoder.encode(
    `id: ${stored.cursor}\ndata: ${JSON.stringify(stored.event)}\n\n`,
  );
}

function encodeSnapshotEvent(stored: DurableAgentEvent): Uint8Array {
  return encoder.encode(encodeClassroomSnapshotSse(stored.cursor, stored.event));
}

export async function GET(request: Request) {
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(': Agent Event API v1 durable\n\n'));
      const pending: DurableAgentEvent[] = [];
      const seen = new Set<number>();
      let ready = false;

      const enqueue = (stored: DurableAgentEvent) => {
        if (seen.has(stored.cursor)) return;
        seen.add(stored.cursor);
        controller.enqueue(encodeEvent(stored));
      };

      unsubscribe = durableLiveEvents.subscribeAgentEvents((stored) => {
        try {
          if (ready) enqueue(stored);
          else pending.push(stored);
        } catch {
          unsubscribe();
        }
      });

      void (async () => {
        await dispatchPendingOutbox();
        const cursor = parseCursor(request);
        if (cursor === null) {
          for (const stored of await snapshotAgentEvents()) {
            if (seen.has(stored.cursor)) continue;
            seen.add(stored.cursor);
            controller.enqueue(encodeSnapshotEvent(stored));
          }
          controller.enqueue(encoder.encode(CLASSROOM_SNAPSHOT_END_SSE));
        } else {
          let replayCursor = cursor;
          for (;;) {
            const events = await agentEventsAfter(replayCursor);
            for (const stored of events) enqueue(stored);
            if (events.length < DURABLE_REPLAY_BATCH_SIZE) break;
            replayCursor = events[events.length - 1]?.cursor ?? replayCursor;
          }
        }
        ready = true;
        for (const stored of pending) enqueue(stored);
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
