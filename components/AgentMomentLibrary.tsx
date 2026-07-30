'use client';

import { useCallback, useEffect, useState } from 'react';

import type { OwnerAgentMoment } from '@/lib/agent-moment-owner-contract';
import AgentMomentComposer from './AgentMomentComposer';
import AgentMomentQrCode from './AgentMomentQrCode';

interface AgentMomentLibraryProps {
  enrollmentId: string;
  agentName: string;
  refreshToken?: number;
}

const STATUS_LABELS = {
  draft: '草稿',
  published: '已发布',
  revoked: '已下架',
} as const;

const VISIBILITY_LABELS = {
  private: '私有',
  unlisted: '仅链接',
  public: '公开',
} as const;

export default function AgentMomentLibrary({
  enrollmentId,
  agentName,
  refreshToken = 0,
}: AgentMomentLibraryProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<OwnerAgentMoment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [phase, setPhase] = useState<
    'idle' | 'loading' | 'ready' | 'more' | 'error'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OwnerAgentMoment | null>(null);

  const load = useCallback(
    async (cursor?: string, replace = false) => {
      setPhase(cursor ? 'more' : 'loading');
      setError(null);
      try {
        const search = new URLSearchParams({
          enrollmentId,
          limit: '10',
        });
        if (cursor) search.set('cursor', cursor);
        const response = await fetch(`/api/agent-moments?${search}`, {
          cache: 'no-store',
        });
        const body = (await response.json()) as {
          items?: OwnerAgentMoment[];
          nextCursor?: string | null;
          error?: string;
        };
        if (!response.ok || !body.items || body.nextCursor === undefined) {
          throw new Error(body.error ?? '无法读取成长册');
        }
        setItems((current) => {
          if (replace) return body.items!;
          const seen = new Set(current.map((item) => item.id));
          return [
            ...current,
            ...body.items!.filter((item) => !seen.has(item.id)),
          ];
        });
        setNextCursor(body.nextCursor);
        setPhase('ready');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : '无法读取成长册');
        setPhase('error');
      }
    },
    [enrollmentId],
  );

  useEffect(() => {
    if (open) void load(undefined, true);
  }, [load, open, refreshToken]);

  const replace = (moment: OwnerAgentMoment) => {
    setItems((current) =>
      current.some((item) => item.id === moment.id)
        ? current.map((item) => (item.id === moment.id ? moment : item))
        : [moment, ...current],
    );
    setEditing(moment);
  };

  const mutate = async (
    moment: OwnerAgentMoment,
    action: 'revoke' | 'duplicate',
  ) => {
    if (
      action === 'revoke' &&
      !window.confirm('下架后公开链接会立即失效。继续吗？')
    ) {
      return;
    }
    setError(null);
    try {
      const response = await fetch(
        `/api/agent-moments/${encodeURIComponent(moment.id)}/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      );
      const body = (await response.json()) as {
        moment?: OwnerAgentMoment;
        error?: string;
      };
      if (!response.ok || !body.moment) {
        throw new Error(body.error ?? '无法更新成长瞬间');
      }
      if (action === 'duplicate') {
        setItems((current) => [body.moment!, ...current]);
        setEditing(body.moment);
      } else {
        replace(body.moment);
        setEditing(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法更新成长瞬间');
    }
  };

  return (
    <section className="agentMomentLibrary" aria-label={`${agentName}的成长册`}>
      <button
        className="agentMomentLibraryToggle"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>成长册</span>
        <span>{open ? '收起' : '查看与管理'}</span>
      </button>
      {open ? (
        <div className="agentMomentLibraryPanel">
          {phase === 'loading' ? <p>正在读取成长册…</p> : null}
          {error ? <p className="agentMomentError" role="alert">{error}</p> : null}
          {phase === 'ready' && items.length === 0 ? (
            <p>还没有成长瞬间。可以从“最近活动”选择 1～2 条创建。</p>
          ) : null}
          {items.length > 0 ? (
            <ol>
              {items.map((moment) => {
                const shareUrl =
                  moment.status === 'published' && moment.shareSlug
                    ? `${window.location.origin}/moments/${moment.shareSlug}`
                    : null;
                return (
                  <li key={moment.id}>
                    <div>
                      <strong>{moment.title}</strong>
                      <span>
                        {STATUS_LABELS[moment.status]} ·{' '}
                        {VISIBILITY_LABELS[moment.visibility]}
                      </span>
                      <time dateTime={moment.updatedAt}>
                        更新于 {new Date(moment.updatedAt).toLocaleString('zh-CN')}
                      </time>
                    </div>
                    <div className="agentMomentLibraryActions">
                      {moment.status !== 'revoked' ? (
                        <button type="button" onClick={() => setEditing(moment)}>
                          编辑
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void mutate(moment, 'duplicate')}
                        >
                          复制为草稿
                        </button>
                      )}
                      {moment.status === 'published' ? (
                        <button
                          className="isDanger"
                          type="button"
                          onClick={() => void mutate(moment, 'revoke')}
                        >
                          下架
                        </button>
                      ) : null}
                      {shareUrl ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              void navigator.clipboard.writeText(shareUrl)
                            }
                          >
                            复制链接
                          </button>
                          <AgentMomentQrCode url={shareUrl} />
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : null}
          {nextCursor ? (
            <button
              className="familyActivityMore"
              type="button"
              disabled={phase === 'more'}
              onClick={() => void load(nextCursor)}
            >
              {phase === 'more' ? '读取中…' : '查看更多'}
            </button>
          ) : null}
        </div>
      ) : null}
      {editing ? (
        <AgentMomentComposer
          moment={editing}
          onClose={() => setEditing(null)}
          onChanged={replace}
        />
      ) : null}
    </section>
  );
}
