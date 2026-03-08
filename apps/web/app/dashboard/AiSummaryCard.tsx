'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useAiStream } from '@/lib/hooks/useAiStream';
import { AiSummarySkeleton } from './AiSummarySkeleton';

interface AiSummaryCardProps {
  datasetId: number | null;
  cachedContent?: string;
  className?: string;
}

function StreamingCursor() {
  return (
    <span
      className="animate-blink motion-reduce:animate-none"
      aria-hidden="true"
    >
      ▋
    </span>
  );
}

function SummaryText({ text }: { text: string }) {
  const paragraphs = text.split('\n\n').filter(Boolean);

  return (
    <div className="max-w-prose text-base leading-[1.6] md:text-[17px] md:leading-[1.8] [&>p+p]:mt-[1.5em]">
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}

function PostCompletionFooter() {
  return (
    <div className="mt-4 flex items-center gap-3 border-t border-border pt-4 animate-fade-in">
      <span className="text-xs text-muted-foreground">Powered by AI</span>
      <span className="text-xs text-muted-foreground">·</span>
      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        disabled
      >
        How I reached this conclusion
      </button>
      <div className="ml-auto">
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          disabled
        >
          Share
        </button>
      </div>
    </div>
  );
}

export function AiSummaryCard({ datasetId, cachedContent, className }: AiSummaryCardProps) {
  const hasCached = !!cachedContent && !datasetId;
  const { status, text, error, start } = useAiStream(hasCached ? null : datasetId);
  const completedRef = useRef(false);

  // backend fires AI_SUMMARY_COMPLETED — client-side trackEvent
  // will be added when web analytics infra lands (Epic 7)
  useEffect(() => {
    if (status === 'done' && !completedRef.current) {
      completedRef.current = true;
    }
  }, [status]);

  // reset analytics flag when datasetId changes
  useEffect(() => {
    completedRef.current = false;
  }, [datasetId]);

  // cached content from RSC — no streaming needed
  if (hasCached) {
    return (
      <div
        className={cn(
          'rounded-lg border border-border border-l-4 border-l-primary bg-card p-4 shadow-md md:p-6',
          className,
        )}
        role="region"
        aria-label="AI business summary"
      >
        <SummaryText text={cachedContent!} />
        <PostCompletionFooter />
      </div>
    );
  }

  if (status === 'idle') return null;

  if (status === 'connecting') {
    return (
      <div className={cn('relative', className)}>
        <AiSummarySkeleton />
        <p className="mt-2 text-sm text-muted-foreground animate-fade-in">
          Analyzing your data...
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className={cn(
          'rounded-lg border border-border border-l-4 border-l-destructive bg-card p-4 shadow-md md:p-6',
          className,
        )}
        role="region"
        aria-label="AI business summary"
      >
        <p className="text-sm text-destructive">{error ?? 'Something went wrong'}</p>
        <button
          type="button"
          onClick={() => start()}
          className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Retry
        </button>
      </div>
    );
  }

  const isActive = status === 'streaming';
  const isDone = status === 'done';

  return (
    <div
      className={cn(
        'rounded-lg border border-border border-l-4 border-l-primary bg-card p-4 shadow-md transition-opacity duration-150 md:p-6',
        className,
      )}
      role="region"
      aria-label="AI business summary"
    >
      <div
        aria-live="polite"
        aria-busy={isActive}
      >
        <SummaryText text={text} />
        {isActive && <StreamingCursor />}
      </div>
      {isDone && <PostCompletionFooter />}
    </div>
  );
}
