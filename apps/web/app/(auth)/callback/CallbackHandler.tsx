'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CallbackHandler({
  code,
  state,
}: {
  code?: string;
  state?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !state) {
      setError('Missing authentication parameters');
      return;
    }

    let cancelled = false;

    async function exchangeCode() {
      try {
        const inviteToken = sessionStorage.getItem('pending_invite_token') ?? undefined;
        sessionStorage.removeItem('pending_invite_token');

        const response = await fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ code, state, inviteToken }),
        });

        if (!cancelled) {
          if (!response.ok) {
            const body = await response.json();
            throw new Error(body.error?.message ?? 'Authentication failed');
          }

          const stored = sessionStorage.getItem('auth_redirect') ?? '/dashboard';
          sessionStorage.removeItem('auth_redirect');
          // guard against open redirect — only allow relative paths starting with /
          const redirect = stored.startsWith('/') && !stored.startsWith('//') ? stored : '/dashboard';
          router.push(redirect);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Authentication failed');
        }
      }
    }

    exchangeCode();

    return () => {
      cancelled = true;
    };
  }, [code, state, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Sign In Failed</h1>
          <p className="text-sm text-red-600">{error}</p>
          <a
            href="/login"
            className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Try Again
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 text-center shadow-sm">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        <p className="text-sm text-gray-600">Signing you in...</p>
      </div>
    </div>
  );
}
