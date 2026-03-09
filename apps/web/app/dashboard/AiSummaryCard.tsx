'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAiStream } from '@/lib/hooks/useAiStream';
import { AiSummarySkeleton } from './AiSummarySkeleton';

interface AiSummaryCardProps {
  datasetId: number | null;
  cachedContent?: string;
  className?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  TIMEOUT: 'The analysis took longer than expected.',
  AI_UNAVAILABLE: 'AI service is temporarily unavailable.',
  RATE_LIMITED: 'Too many requests — please wait a moment.',
  PIPELINE_ERROR: 'Something went wrong preparing your analysis.',
  EMPTY_RESPONSE: 'AI produced no results — please try again.',
  STREAM_ERROR: 'Something went wrong generating insights.',
};

function userMessage(code: string | null, fallback: string | null): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return fallback ?? 'Something went wrong generating insights.';
}

function RetrySpinner() {
  return (
    <svg
      className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
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
  const { status, text, error, code, retryable, maxRetriesReached, retry } =
    useAiStream(hasCached ? null : datasetId);
  const completedRef = useRef(false);
  const [retryPending, setRetryPending] = useState(false);

  useEffect(() => {
    if (status === 'done' && !completedRef.current) {
      completedRef.current = true;
    }
  }, [status]);

  useEffect(() => {
    completedRef.current = false;
    setRetryPending(false);
  }, [datasetId]);

  useEffect(() => {
    if (status !== 'error') setRetryPending(false);
  }, [status]);

  // cached content from RSC
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

  if (status === 'idle' || status === 'free_preview') return null;

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

  if (status === 'timeout') {
    return (
      <div
        className={cn(
          'rounded-lg border border-border border-l-4 border-l-primary bg-card p-4 shadow-md md:p-6',
          className,
        )}
        role="region"
        aria-label="AI business summary"
      >
        <div aria-live="polite">
          <SummaryText text={text} />
        </div>
        <hr className="my-4 border-muted" />
        <p className="text-sm italic text-muted-foreground">
          We focused on the most important findings to keep things quick.
        </p>
        <PostCompletionFooter />
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
        <div aria-live="assertive">
          <p className="text-sm font-medium text-destructive">
            {userMessage(code, error)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your data and charts are still available below.
          </p>
        </div>
        {retryable && !maxRetriesReached && (
          <button
            type="button"
            disabled={retryPending}
            onClick={() => {
              setRetryPending(true);
              retry();
            }}
            className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {retryPending && <RetrySpinner />}
            {retryPending ? 'Retrying...' : 'Try again'}
          </button>
        )}
        {retryable && maxRetriesReached && (
          <p className="mt-3 text-xs text-muted-foreground">
            Please try again later.
          </p>
        )}
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
