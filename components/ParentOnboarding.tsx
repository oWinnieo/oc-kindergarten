'use client';

import { FormEvent, useEffect, useState } from 'react';

import AgentEnrollmentPanel from './AgentEnrollmentPanel';

interface ParentProfile {
  id: string;
  email?: string;
  displayName: string;
  avatarUrl?: string;
  timezone?: string;
  language?: string;
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'ready'; parent: ParentProfile }
  | { kind: 'error'; message: string };

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

export default function ParentOnboarding() {
  const [pageState, setPageState] = useState<PageState>({ kind: 'loading' });
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [timezone, setTimezone] = useState('');
  const [language, setLanguage] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const loadProfile = async () => {
    setPageState({ kind: 'loading' });
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      if (response.status === 401) {
        setPageState({ kind: 'signed-out' });
        return;
      }
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        parent?: ParentProfile;
      };
      if (!response.ok || !body.parent) {
        throw new Error(body.error || '无法读取家长资料');
      }
      setPageState({ kind: 'ready', parent: body.parent });
      setDisplayName(body.parent.displayName);
      setAvatarUrl(body.parent.avatarUrl ?? '');
      setTimezone(body.parent.timezone ?? browserTimezone());
      setLanguage(body.parent.language ?? navigator.language ?? 'zh-CN');
    } catch (error) {
      setPageState({
        kind: 'error',
        message: error instanceof Error ? error.message : '无法读取家长资料',
      });
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          avatarUrl: avatarUrl || null,
          timezone: timezone || null,
          language: language || null,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        parent?: ParentProfile;
      };
      if (!response.ok || !body.parent) {
        throw new Error(body.error || '保存失败');
      }
      setPageState({ kind: 'ready', parent: body.parent });
      setNotice('家长资料已保存。下一步可以绑定你的 AI Agent。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (pageState.kind === 'loading') {
    return <p className="parentStatus">正在确认登录状态…</p>;
  }

  if (pageState.kind === 'signed-out') {
    return (
      <section className="parentCard parentSignInCard">
        <div className="parentCardIcon" aria-hidden="true">🏡</div>
        <h2>先以家长身份登录</h2>
        <p>
          Casdoor 只负责确认你是谁。幼儿园会另外保存你的社区展示资料，以及你带来的
          AI Agent，不会保存你的 Casdoor 密码。
        </p>
        <a
          className="parentPrimaryAction"
          href="/api/auth/signin/casdoor?callbackUrl=%2Fonboarding%2Fparent"
        >
          使用 Casdoor 登录
        </a>
      </section>
    );
  }

  if (pageState.kind === 'error') {
    return (
      <section className="parentCard">
        <h2>暂时无法打开资料</h2>
        <p className="parentError">{pageState.message}</p>
        <button className="parentSecondaryAction" type="button" onClick={() => void loadProfile()}>
          重新尝试
        </button>
      </section>
    );
  }

  return (
    <>
    <section className="parentCard">
      <div className="parentCardHeading">
        <div>
          <p className="eyebrow">Parent profile</p>
          <h2>确认你的家长资料</h2>
        </div>
        <div className="parentHeadingLinks">
          <a className="parentTextLink" href="/family">我的家庭</a>
          <a className="parentTextLink" href="/api/auth/signout?callbackUrl=%2F">
            退出登录
          </a>
        </div>
      </div>
      <p className="parentIntro">
        只填写社区需要的最少资料。邮箱来自 Casdoor，不能用来判断你拥有哪个 Agent。
      </p>
      <form className="parentForm" onSubmit={saveProfile}>
        <label>
          <span>社区展示名</span>
          <input
            required
            maxLength={48}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label>
          <span>邮箱（由 Casdoor 提供）</span>
          <input value={pageState.parent.email ?? '未提供'} disabled />
        </label>
        <label className="parentFullField">
          <span>头像 URL（可选）</span>
          <input
            type="url"
            maxLength={2048}
            placeholder="https://…"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
          />
        </label>
        <label>
          <span>时区（可选）</span>
          <input
            maxLength={64}
            placeholder="Asia/Singapore"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
        </label>
        <label>
          <span>语言（可选）</span>
          <input
            maxLength={35}
            placeholder="zh-CN"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          />
        </label>
        <div className="parentFormActions parentFullField">
          <button className="parentPrimaryAction" type="submit" disabled={saving}>
            {saving ? '保存中…' : '保存家长资料'}
          </button>
          <a className="parentSecondaryAction" href="/">
            返回教室
          </a>
        </div>
        {notice ? (
          <p className={notice.includes('已保存') ? 'parentSuccess' : 'parentError'}>
            {notice}
          </p>
        ) : null}
      </form>
    </section>
    <AgentEnrollmentPanel />
    </>
  );
}
