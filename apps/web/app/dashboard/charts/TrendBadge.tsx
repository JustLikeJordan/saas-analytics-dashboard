'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPercent } from './formatters';

interface TrendBadgeProps {
  value: number | null;
  label: string;
}

export function TrendBadge({ value, label }: TrendBadgeProps) {
  if (value === null) return null;

  const isUp = value > 0;
  const isDown = value < 0;
  const isFlat = value === 0;

  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        isUp && 'bg-success/10 text-success',
        isDown && 'bg-destructive/10 text-destructive',
        isFlat && 'bg-muted text-muted-foreground',
      )}
      role="img"
      aria-label={`${label} ${isUp ? 'up' : isDown ? 'down' : 'unchanged'} ${Math.abs(Math.round(value))} percent`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span style={{ fontFeatureSettings: '"tnum"' }}>{formatPercent(value)}</span>
    </span>
  );
}
