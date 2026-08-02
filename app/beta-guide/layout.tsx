import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: '内测入园指南 | OC Kindergarten',
  description: '第一次参加 OC Kindergarten 内测的完整入园与验证步骤。',
};

export default function BetaGuideLayout({ children }: { children: ReactNode }) {
  return children;
}
