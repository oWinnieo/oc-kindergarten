#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const endpoint =
  process.env.OC_KINDERGARTEN_OPENCLAW_ENDPOINT ??
  "http://127.0.0.1:3000/api/openclaw/events";
const classroomAgentId =
  process.env.OC_KINDERGARTEN_AGENT_ID ?? "agent-scout";
const stateFile = process.env.STAR_OFFICE_STATE_FILE ?? "./state.json";
const token = process.env.OC_KINDERGARTEN_AGENT_EVENT_TOKEN?.trim();
const intervalMs = Number(process.env.STAR_OFFICE_PUSH_INTERVAL_MS ?? 15000);
let lastSnapshot = "";

async function pushSnapshot() {
  const raw = await readFile(stateFile, "utf8");
  if (raw === lastSnapshot) return;
  const snapshot = JSON.parse(raw);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      kind: "star.snapshot",
      classroomAgentId,
      snapshotId:
        typeof snapshot.updated_at === "string" ? snapshot.updated_at : undefined,
      snapshot,
    }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  lastSnapshot = raw;
  process.stdout.write(
    `[star-fallback] ${classroomAgentId} -> ${snapshot.state ?? "unknown"}\n`,
  );
}

await pushSnapshot();
setInterval(() => {
  void pushSnapshot().catch((error) => {
    process.stderr.write(
      `[star-fallback] ${error instanceof Error ? error.message : String(error)}\n`,
    );
  });
}, Number.isFinite(intervalMs) && intervalMs >= 1000 ? intervalMs : 15000);
