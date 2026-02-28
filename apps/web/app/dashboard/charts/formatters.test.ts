import { describe, it, expect } from 'vitest';

import {
  formatCurrency,
  formatAbbreviated,
  formatPercent,
  computeTrend,
} from './formatters';

describe('formatCurrency', () => {
  it('formats whole numbers without decimals', () => {
    expect(formatCurrency(42300)).toBe('$42,300');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('$0');
  });

  it('handles negative values', () => {
    expect(formatCurrency(-1500)).toBe('-$1,500');
  });
});

describe('formatAbbreviated', () => {
  it('returns $0 for zero', () => {
    expect(formatAbbreviated(0)).toBe('$0');
  });

  it('abbreviates thousands', () => {
    expect(formatAbbreviated(1200)).toBe('$1.2K');
    expect(formatAbbreviated(42300)).toBe('$42.3K');
  });

  it('abbreviates millions', () => {
    expect(formatAbbreviated(1200000)).toBe('$1.2M');
  });

  it('formats values under 1000 as full currency', () => {
    expect(formatAbbreviated(750)).toBe('$750');
  });
});

describe('formatPercent', () => {
  it('prefixes positive values with +', () => {
    expect(formatPercent(23)).toBe('+23%');
  });

  it('shows negative values with -', () => {
    expect(formatPercent(-8)).toBe('-8%');
  });

  it('shows zero without sign', () => {
    expect(formatPercent(0)).toBe('0%');
  });
});

describe('computeTrend', () => {
  it('returns null for fewer than 2 data points', () => {
    expect(computeTrend([])).toBeNull();
    expect(computeTrend([{ revenue: 100 }])).toBeNull();
  });

  it('calculates percentage change between last two entries', () => {
    const data = [{ revenue: 100 }, { revenue: 120 }];
    expect(computeTrend(data)).toBe(20);
  });

  it('handles zero previous value', () => {
    expect(computeTrend([{ revenue: 0 }, { revenue: 50 }])).toBe(100);
    expect(computeTrend([{ revenue: 0 }, { revenue: 0 }])).toBe(0);
  });
});

