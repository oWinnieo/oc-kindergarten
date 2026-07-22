export function agentIncomingMessageNotice(
  displayName: string,
  content: string,
): string {
  return `${displayName} 收到主人的消息“${content}”`;
}
