'use client';

import { useEffect, useState } from 'react';

import type { OwnerAgentShareSettings } from '@/lib/agent-moment-owner-contract';

interface AgentShareSettingsProps {
  enrollmentId: string;
  agentName: string;
  onChanged?: () => void;
}

export default function AgentShareSettings({
  enrollmentId,
  agentName,
  onChanged,
}: AgentShareSettingsProps) {
  const [settings, setSettings] = useState<OwnerAgentShareSettings | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'saving' | 'error'>(
    'loading',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/enrollments/${encodeURIComponent(enrollmentId)}/share-settings`,
          { cache: 'no-store' },
        );
        const body = (await response.json()) as {
          settings?: OwnerAgentShareSettings;
          error?: string;
        };
        if (!response.ok || !body.settings) {
          throw new Error(body.error ?? '无法读取成长册设置');
        }
        if (active) {
          setSettings(body.settings);
          setPhase('ready');
        }
      } catch (caught) {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : '无法读取成长册设置',
          );
          setPhase('error');
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [enrollmentId]);

  const update = async (
    patch: Partial<
      Pick<
        OwnerAgentShareSettings,
        'profileVisibility' | 'allowReplyExcerpt'
      >
    >,
  ) => {
    if (
      settings?.profileVisibility === 'public' &&
      patch.profileVisibility === 'private' &&
      !window.confirm(
        '关闭成长册公开权限后，当前已发布内容会转回草稿，公开链接立即失效。继续吗？',
      )
    ) {
      return;
    }
    setPhase('saving');
    setError(null);
    try {
      const response = await fetch(
        `/api/enrollments/${encodeURIComponent(enrollmentId)}/share-settings`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        },
      );
      const body = (await response.json()) as {
        settings?: OwnerAgentShareSettings;
        error?: string;
      };
      if (!response.ok || !body.settings) {
        throw new Error(body.error ?? '无法更新成长册设置');
      }
      setSettings(body.settings);
      setPhase('ready');
      onChanged?.();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '无法更新成长册设置',
      );
      setPhase('error');
    }
  };

  if (phase === 'loading') {
    return <p className="agentShareSettingsStatus">正在读取成长册设置…</p>;
  }
  if (!settings) {
    return (
      <div className="agentShareSettingsError" role="alert">
        <span>{error ?? '成长册设置不可用'}</span>
      </div>
    );
  }

  return (
    <section className="agentShareSettings" aria-label={`${agentName}的成长册设置`}>
      <div>
        <strong>成长册发布权限</strong>
        <small>
          只控制成长瞬间，不影响教室中的 Agent。默认保持私有。
        </small>
      </div>
      <label>
        <span>允许主人发布</span>
        <input
          type="checkbox"
          checked={settings.profileVisibility === 'public'}
          disabled={phase === 'saving'}
          onChange={(event) =>
            void update({
              profileVisibility: event.target.checked ? 'public' : 'private',
            })
          }
        />
      </label>
      <label>
        <span>允许回复摘录</span>
        <input
          type="checkbox"
          checked={settings.allowReplyExcerpt}
          disabled={phase === 'saving'}
          onChange={(event) =>
            void update({ allowReplyExcerpt: event.target.checked })
          }
        />
      </label>
      <p>
        回复摘录只读取 bridge 已清洗的 outgoing 预览，仍会在创建草稿和发布时再次检查。
      </p>
      {error ? <p className="agentShareSettingsError" role="alert">{error}</p> : null}
    </section>
  );
}

