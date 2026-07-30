'use client';

import { useState } from 'react';

interface AgentMomentQrCodeProps {
  url: string;
}

export default function AgentMomentQrCode({ url }: AgentMomentQrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );

  const generate = async () => {
    setPhase('loading');
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        throw new Error('二维码只为 HTTPS 分享链接生成');
      }
      const QRCode = await import('qrcode');
      const nextDataUrl = await QRCode.toDataURL(parsed.toString(), {
        errorCorrectionLevel: 'M',
        margin: 4,
        width: 512,
        type: 'image/png',
        color: { dark: '#17324a', light: '#ffffff' },
      });
      setDataUrl(nextDataUrl);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  };

  if (dataUrl) {
    return (
      <div className="agentMomentQr">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl} alt="成长瞬间分享二维码" width={192} height={192} />
        <a download="agent-moment.png" href={dataUrl}>
          下载二维码
        </a>
      </div>
    );
  }

  return (
    <button
      className="agentMomentTextAction"
      type="button"
      disabled={phase === 'loading'}
      onClick={() => void generate()}
    >
      {phase === 'loading'
        ? '正在生成…'
        : phase === 'error'
          ? '请使用 HTTPS 后重试'
          : '显示二维码'}
    </button>
  );
}

