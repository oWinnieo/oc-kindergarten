import type { CSSProperties } from 'react';

interface AgentSpeechBubbleProps {
  agentName: string;
  content: string;
  accentColor: string;
  xPercent: number;
  yPercent: number;
}

export default function AgentSpeechBubble({
  agentName,
  content,
  accentColor,
  xPercent,
  yPercent,
}: AgentSpeechBubbleProps) {
  const style = {
    left: `clamp(96px, ${xPercent}%, calc(100% - 96px))`,
    top: `${Math.max(7, yPercent)}%`,
    '--agent-speech-accent': accentColor,
  } as CSSProperties;

  return (
    <div
      className="agentSpeechBubble"
      style={style}
      role="status"
      aria-label={`${agentName} 回复：${content}`}
    >
      <span className="agentSpeechBubbleName">{agentName}</span>
      <span>{content}</span>
    </div>
  );
}
