'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentActivityItem } from '@/lib/agent-activity-contract';

interface AgentActivityTimelineProps {
  enrollmentId: string;
  agentName: string;
  refreshToken?: number;
  compact?: boolean;
}

interface ActivityResponse {
  items?: AgentActivityItem[];
  nextCursor?: string | null;
  error?: string;
}

type LoadPhase = 'idle' | 'loading' | 'ready' | 'more' | 'error';

const activityTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatActivityTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '时间未知'
    : activityTimeFormatter.format(date);
}

export default function AgentActivityTimeline({
  enrollmentId,
  agentName,
  refreshToken = 0,
  compact = false,
}: AgentActivityTimelineProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<LoadPhase>('idle');
  const [items, setItems] = useState<AgentActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previousRefreshToken = useRef(refreshToken);
  const panelId = `agent-activity-${enrollmentId}`;

  const fetchPage = useCallback(
    async (cursor?: string, replace = false) => {
      setPhase(cursor ? 'more' : 'loading');
      setError(null);
      try {
        const search = new URLSearchParams({ limit: '5' });
        if (cursor) search.set('cursor', cursor);
        const response = await fetch(
          `/api/enrollments/${encodeURIComponent(enrollmentId)}/activity?${search}`,
          { cache: 'no-store' },
        );
        const body = (await response.json()) as ActivityResponse;
        if (!response.ok || !body.items || body.nextCursor === undefined) {
          throw new Error(body.error ?? '无法读取最近活动');
        }
        setItems((current) => {
          if (replace) return body.items!;
          const seen = new Set(current.map((item) => item.cursor));
          return [
            ...current,
            ...body.items!.filter((item) => !seen.has(item.cursor)),
          ];
        });
        setNextCursor(body.nextCursor);
        setPhase('ready');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '无法读取最近活动');
        setPhase('error');
      }
    },
    [enrollmentId],
  );

  useEffect(() => {
    if (previousRefreshToken.current === refreshToken) return;
    previousRefreshToken.current = refreshToken;
    if (open && phase !== 'idle') void fetchPage(undefined, true);
  }, [fetchPage, open, phase, refreshToken]);

  const toggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && phase === 'idle') void fetchPage(undefined, true);
  };

  return (
    <section
      className={`familyActivityTimeline${compact ? ' isCompact' : ''}`}
      aria-label={`${agentName}的最近活动`}
    >
      <button
        className="familyActivityToggle"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span>最近活动</span>
        <span>{open ? '收起' : '查看'}</span>
      </button>

      {open ? (
        <div className="familyActivityPanel" id={panelId}>
          {phase === 'loading' && items.length === 0 ? (
            <p className="familyActivityStatus" role="status">
              正在读取活动记录…
            </p>
          ) : null}
          {phase === 'error' ? (
            <div className="familyActivityError" role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => void fetchPage(undefined, true)}>
                重试
              </button>
            </div>
          ) : null}
          {phase !== 'error' && phase !== 'loading' && items.length === 0 ? (
            <p className="familyActivityStatus">还没有活动记录。</p>
          ) : null}
          {items.length > 0 ? (
            <ol className="familyActivityList">
              {items.map((item) => (
                <li className={`tone-${item.tone}`} key={item.cursor}>
                  <span className="familyActivityMarker" aria-hidden="true" />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <time dateTime={item.observedAt} title={new Date(item.observedAt).toLocaleString('zh-CN')}>
                    {formatActivityTime(item.observedAt)}
                  </time>
                </li>
              ))}
            </ol>
          ) : null}
          {nextCursor ? (
            <button
              className="familyActivityMore"
              type="button"
              disabled={phase === 'more'}
              onClick={() => void fetchPage(nextCursor)}
            >
              {phase === 'more' ? '读取中…' : '查看更多'}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
