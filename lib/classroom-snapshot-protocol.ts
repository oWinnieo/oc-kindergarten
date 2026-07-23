export const CLASSROOM_SNAPSHOT_EVENT = 'classroom-snapshot';
export const CLASSROOM_SNAPSHOT_END_EVENT = 'classroom-snapshot-end';

export function encodeClassroomSnapshotSse(
  cursor: number,
  event: unknown,
): string {
  return `id: ${cursor}\nevent: ${CLASSROOM_SNAPSHOT_EVENT}\ndata: ${JSON.stringify(event)}\n\n`;
}

export const CLASSROOM_SNAPSHOT_END_SSE =
  `event: ${CLASSROOM_SNAPSHOT_END_EVENT}\ndata: {}\n\n`;
