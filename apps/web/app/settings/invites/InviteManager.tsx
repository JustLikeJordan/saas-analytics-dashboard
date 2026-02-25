'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

interface GeneratedInvite {
  url: string;
  token: string;
  expiresAt: string;
}

interface ActiveInvite {
  id: number;
  expiresAt: string;
  createdBy: number;
}

export default function InviteManager() {
  const [invite, setInvite] = useState<GeneratedInvite | null>(null);
  const [activeInvites, setActiveInvites] = useState<ActiveInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const loadActiveInvites = useCallback(async () => {
    try {
      const { data } = await apiClient<ActiveInvite[]>('/invites');
      setActiveInvites(data);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Owner access required')) {
        setForbidden(true);
      }
    }
  }, []);

  useEffect(() => {
    loadActiveInvites();
  }, [loadActiveInvites]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const { data } = await apiClient<GeneratedInvite>('/invites', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setInvite(data);
      await loadActiveInvites();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate invite';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!invite) return;

    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — select and copy the link manually');
    }
  }

  function formatExpiry(iso: string) {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function daysUntil(iso: string) {
    const diff = new Date(iso).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }

  if (forbidden) {
    return (
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">Invite Team Members</h1>
        <p className="text-sm text-gray-600">
          Only organization owners can generate invite links. Ask your org owner if you need to invite someone.
        </p>
        <a
          href="/dashboard"
          className="inline-block text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          &larr; Back to dashboard
        </a>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Invite Team Members</h1>
        <p className="mt-1 text-sm text-gray-600">
          Generate a link to invite someone to your organization.
        </p>
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading}
        className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Generating...' : 'Generate Invite Link'}
      </button>

      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {invite && (
        <div className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Invite Link</span>
            <span className="text-xs text-gray-400">
              Expires {formatExpiry(invite.expiresAt)}
            </span>
          </div>

          <div className="flex gap-2">
            <input
              readOnly
              value={invite.url}
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 focus:outline-none"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <p className="text-xs text-gray-500">
            Anyone with this link can join your organization by signing in with Google.
          </p>
        </div>
      )}

      {activeInvites.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-700">
            Active Invites ({activeInvites.length})
          </h2>
          <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
            {activeInvites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-xs text-gray-500">Invite #{inv.id}</span>
                <span className="text-xs text-gray-400">
                  {daysUntil(inv.expiresAt)}d left
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-gray-200 pt-4">
        <a
          href="/dashboard"
          className="text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          &larr; Back to dashboard
        </a>
      </div>
    </div>
  );
}
