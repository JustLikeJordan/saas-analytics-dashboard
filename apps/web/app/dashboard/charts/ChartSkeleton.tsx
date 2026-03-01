'use client';

import { cn } from '@/lib/utils';

interface ChartSkeletonProps {
  className?: string;
  variant?: 'line' | 'bar';
}

export function ChartSkeleton({ className, variant = 'line' }: ChartSkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-4 shadow-sm md:p-6',
        className,
      )}
      role="status"
      aria-label="Loading chart"
    >
      <div className="mb-4 h-6 w-32 rounded bg-muted animate-skeleton-pulse motion-reduce:animate-none" />

      <div className="aspect-video overflow-hidden rounded bg-muted/50">
        <svg
          viewBox="0 0 320 180"
          className="h-full w-full animate-skeleton-pulse motion-reduce:animate-none"
          aria-hidden="true"
        >
          {variant === 'line' ? (
            <polyline
              points="20,140 70,100 120,120 170,60 220,80 270,40 300,70"
              fill="none"
              className="stroke-muted"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <>
              <rect x="30" y="80" width="40" height="90" rx="4" className="fill-muted" />
              <rect x="90" y="50" width="40" height="120" rx="4" className="fill-muted" />
              <rect x="150" y="100" width="40" height="70" rx="4" className="fill-muted" />
              <rect x="210" y="30" width="40" height="140" rx="4" className="fill-muted" />
              <rect x="270" y="70" width="40" height="100" rx="4" className="fill-muted" />
            </>
          )}
        </svg>
      </div>

      <div className="mt-3 h-4 w-40 rounded bg-muted animate-skeleton-pulse motion-reduce:animate-none" />

      <span className="sr-only">Loading chart...</span>
    </div>
  );
}
