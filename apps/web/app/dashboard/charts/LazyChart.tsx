'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { CHART_CONFIG } from 'shared/constants';
import { ChartSkeleton } from './ChartSkeleton';

interface LazyChartProps {
  children: ReactNode;
  className?: string;
  skeletonVariant?: 'line' | 'bar';
}

function subscribeToResize(callback: () => void) {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

function getIsDesktop() {
  return window.innerWidth >= 768;
}

function getIsDesktopServer() {
  return false;
}

export function LazyChart({ children, className, skeletonVariant = 'line' }: LazyChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const isDesktop = useSyncExternalStore(subscribeToResize, getIsDesktop, getIsDesktopServer);

  useEffect(() => {
    if (isDesktop) return;

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: CHART_CONFIG.LAZY_THRESHOLD },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isDesktop]);

  if (isDesktop) return <>{children}</>;

  return (
    <div ref={ref} className={className}>
      {visible ? (
        <div
          className="animate-fade-in motion-reduce:animate-none"
          style={{ animationDuration: `${CHART_CONFIG.SKELETON_FADE_MS}ms` }}
        >
          {children}
        </div>
      ) : (
        <ChartSkeleton variant={skeletonVariant} />
      )}
    </div>
  );
}
