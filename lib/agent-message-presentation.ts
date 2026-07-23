import type { AgentMessageOrigin } from './agent-event-contract';

export function agentIncomingMessageNotice(
  displayName: string,
  content: string,
  origin?: AgentMessageOrigin,
): string {
  if (!origin) {
    return `${displayName} 收到主人的消息“${content}”`;
  }

  const sender =
    origin.senderRole === 'owner'
      ? '主人'
      : origin.senderName?.trim() || '一位群聊成员';
  const source =
    origin.conversationType === 'group' ? `群聊里${sender}` : sender;
  return `${displayName} 收到${source}的消息“${content}”`;
}
