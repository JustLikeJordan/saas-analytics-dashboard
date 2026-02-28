'use client';

import { useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Upload, Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebar } from '@/app/dashboard/contexts/SidebarContext';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/settings/invites', label: 'Settings', icon: Settings },
] as const;

function SidebarNav({ orgName, onNavigate }: { orgName?: string; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <div className="flex h-14 items-center justify-between border-b border-border px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-lg font-semibold text-foreground"
          onClick={onNavigate}
        >
          <BarChart3 className="h-5 w-5 text-primary" />
          Insight
        </Link>
        {onNavigate && (
          <button
            onClick={onNavigate}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {orgName && (
        <div className="border-b border-border px-6 py-3">
          <p className="truncate text-sm font-medium text-foreground">{orgName}</p>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main navigation">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-l-4 border-primary bg-accent text-foreground'
                  : 'border-l-4 border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function Sidebar() {
  const { open, setOpen, orgName } = useSidebar();
  const pathname = usePathname();
  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, close]);

  return (
    <>
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-border lg:bg-background">
        <SidebarNav orgName={orgName} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50 animate-fade-in"
            onClick={close}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-background shadow-xl animate-slide-in-left"
          >
            <SidebarNav orgName={orgName} onNavigate={close} />
          </aside>
        </div>
      )}
    </>
  );
}
