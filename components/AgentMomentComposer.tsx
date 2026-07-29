'use client';

import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  AGENT_MOMENT_TEMPLATES,
  type AgentMomentPublishVisibility,
  type AgentMomentTemplate,
} from '@/lib/agent-moment-contract';
import type { OwnerAgentMoment } from '@/lib/agent-moment-owner-contract';
import AgentMomentQrCode from './AgentMomentQrCode';

interface AgentMomentComposerProps {
  moment: OwnerAgentMoment;
  onClose: () => void;
  onChanged: (moment: OwnerAgentMoment) => void;
}

const TEMPLATE_LABELS: Record<AgentMomentTemplate, string> = {
  daily: '日常片段',
  quote: '有趣回复',
  progress: '任务进度',
  achievement: '小小成就',
  recovery: '解决困难',
};

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]',
    ),
  );
}

export default function AgentMomentComposer({
  moment,
  onClose,
  onChanged,
}: AgentMomentComposerProps) {
  const [title, setTitle] = useState(moment.title);
  const [ownerCaption, setOwnerCaption] = useState(moment.ownerCaption ?? '');
  const [template, setTemplate] = useState(moment.template);
  const [visibility, setVisibility] =
    useState<AgentMomentPublishVisibility>('unlisted');
  const [current, setCurrent] = useState(moment);
  const [busy, setBusy] = useState<'save' | 'publish' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const returnFocus = document.activeElement;
    titleRef.current?.focus();
    return () => {
      if (returnFocus instanceof HTMLElement) returnFocus.focus();
    };
  }, []);

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = focusableElements(dialogRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const updateDraft = async (): Promise<OwnerAgentMoment> => {
    const response = await fetch(
      `/api/agent-moments/${encodeURIComponent(current.id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          ownerCaption: ownerCaption.trim() || null,
          template,
        }),
      },
    );
    const body = (await response.json()) as {
      moment?: OwnerAgentMoment;
      error?: string;
    };
    if (!response.ok || !body.moment) {
      throw new Error(body.error ?? '无法保存成长瞬间');
    }
    setCurrent(body.moment);
    onChanged(body.moment);
    return body.moment;
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('save');
    setError(null);
    try {
      await updateDraft();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法保存成长瞬间');
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    setBusy('publish');
    setError(null);
    try {
      const draft = await updateDraft();
      const response = await fetch(
        `/api/agent-moments/${encodeURIComponent(draft.id)}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visibility }),
        },
      );
      const body = (await response.json()) as {
        moment?: OwnerAgentMoment;
        error?: string;
      };
      if (!response.ok || !body.moment) {
        throw new Error(body.error ?? '无法发布成长瞬间');
      }
      setCurrent(body.moment);
      onChanged(body.moment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法发布成长瞬间');
    } finally {
      setBusy(null);
    }
  };

  const shareUrl =
    current.status === 'published' && current.shareSlug
      ? `${window.location.origin}/moments/${current.shareSlug}`
      : null;
  const hasRedaction = current.items.some(
    (item) =>
      item.title.includes('[已隐藏]') || item.detail.includes('[已隐藏]'),
  );

  return (
    <div className="agentMomentModalBackdrop" role="presentation">
      <div
        ref={dialogRef}
        className="agentMomentComposer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`agent-moment-title-${current.id}`}
        aria-describedby={`agent-moment-warning-${current.id}`}
        onKeyDown={handleDialogKeyDown}
      >
        <header>
          <div>
            <p className="eyebrow">Agent moment</p>
            <h3 id={`agent-moment-title-${current.id}`}>编辑成长瞬间</h3>
          </div>
          <button type="button" disabled={busy !== null} onClick={onClose}>
            关闭
          </button>
        </header>

        {error ? <p className="agentMomentError" role="alert">{error}</p> : null}
        {hasRedaction ? (
          <p className="agentMomentRedaction" role="status">
            快照中的敏感片段已经替换为“[已隐藏]”，发布前请再次确认。
          </p>
        ) : null}

        <ol className="agentMomentPreview">
          {current.items.map((item) => (
            <li key={item.position}>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
              <time dateTime={item.occurredAt}>
                {new Date(item.occurredAt).toLocaleString('zh-CN')}
              </time>
            </li>
          ))}
        </ol>

        <form onSubmit={(event) => void save(event)}>
          <label>
            <span>模板</span>
            <select
              value={template}
              disabled={busy !== null || current.status === 'revoked'}
              onChange={(event) =>
                setTemplate(event.target.value as AgentMomentTemplate)
              }
            >
              {AGENT_MOMENT_TEMPLATES.map((value) => (
                <option key={value} value={value}>
                  {TEMPLATE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>标题</span>
            <input
              ref={titleRef}
              required
              minLength={1}
              maxLength={80}
              value={title}
              disabled={busy !== null || current.status === 'revoked'}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="agentMomentWideField">
            <span>主人评语（可选）</span>
            <textarea
              maxLength={280}
              value={ownerCaption}
              disabled={busy !== null || current.status === 'revoked'}
              onChange={(event) => setOwnerCaption(event.target.value)}
            />
            <small>{Array.from(ownerCaption).length}/280</small>
          </label>

          {current.status !== 'revoked' ? (
            <fieldset className="agentMomentWideField">
              <legend>发布方式</legend>
              <label>
                <input
                  type="radio"
                  name={`moment-visibility-${current.id}`}
                  value="unlisted"
                  checked={visibility === 'unlisted'}
                  onChange={() => setVisibility('unlisted')}
                />
                <span>仅链接可见</span>
              </label>
              <label>
                <input
                  type="radio"
                  name={`moment-visibility-${current.id}`}
                  value="public"
                  checked={visibility === 'public'}
                  onChange={() => setVisibility('public')}
                />
                <span>公开到晒崽广场</span>
              </label>
            </fieldset>
          ) : null}

          <p
            className="agentMomentForwardWarning agentMomentWideField"
            id={`agent-moment-warning-${current.id}`}
          >
            分享后他人可能转发、截图或由外部平台缓存；站内下架不能召回这些副本。
            修改已发布内容会先让原链接暂时失效，重新发布后恢复。
          </p>

          {shareUrl ? (
            <div className="agentMomentPublished agentMomentWideField">
              <label>
                <span>分享链接</span>
                <input readOnly value={shareUrl} />
              </label>
              <button
                className="agentMomentTextAction"
                type="button"
                onClick={() => void navigator.clipboard.writeText(shareUrl)}
              >
                复制链接
              </button>
              <AgentMomentQrCode url={shareUrl} />
            </div>
          ) : null}

          <div className="agentMomentActions agentMomentWideField">
            {current.status !== 'revoked' ? (
              <>
                <button
                  className="parentSecondaryAction"
                  type="submit"
                  disabled={busy !== null}
                >
                  {busy === 'save' ? '保存中…' : '保存草稿'}
                </button>
                <button
                  className="parentPrimaryAction"
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void publish()}
                >
                  {busy === 'publish' ? '发布中…' : '确认并发布'}
                </button>
              </>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
