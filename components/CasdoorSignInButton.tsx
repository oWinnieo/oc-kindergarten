'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

interface CasdoorSignInButtonProps {
  callbackUrl: string;
}

export default function CasdoorSignInButton({
  callbackUrl,
}: CasdoorSignInButtonProps) {
  const [signingIn, setSigningIn] = useState(false);

  const startSignIn = async () => {
    setSigningIn(true);
    try {
      await signIn('casdoor', { callbackUrl });
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <button
      className="parentPrimaryAction"
      type="button"
      disabled={signingIn}
      aria-busy={signingIn}
      onClick={() => void startSignIn()}
    >
      {signingIn ? '正在前往 Casdoor…' : '使用 Casdoor 登录'}
    </button>
  );
}
