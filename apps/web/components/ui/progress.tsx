import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  indeterminate?: boolean;
}

function Progress({ className, value = 0, max = 100, indeterminate = false, ...props }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        className={cn(
          'h-full bg-primary transition-all duration-300',
          indeterminate && 'animate-indeterminate w-1/3',
        )}
        style={indeterminate ? undefined : { width: `${percentage}%` }}
      />
    </div>
  );
}

export { Progress, type ProgressProps };
