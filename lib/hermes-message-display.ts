export function sanitizeHermesDisplayText(value: string): string {
  const compact = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  const characters = Array.from(compact);
  return characters.length <= 280
    ? compact
    : `${characters.slice(0, 279).join('')}…`;
}
