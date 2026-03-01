import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { TrendBadge } from './TrendBadge';

afterEach(cleanup);

describe('TrendBadge', () => {
  it('returns null for null value', () => {
    const { container } = render(<TrendBadge value={null} label="Revenue" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders up trend with correct aria-label', () => {
    render(<TrendBadge value={23} label="Revenue" />);

    const badge = screen.getByRole('img');
    expect(badge).toHaveAttribute('aria-label', 'Revenue up 23 percent');
    expect(badge).toHaveTextContent('+23%');
  });

  it('renders down trend with correct aria-label', () => {
    render(<TrendBadge value={-8} label="Revenue" />);

    const badge = screen.getByRole('img');
    expect(badge).toHaveAttribute('aria-label', 'Revenue down 8 percent');
    expect(badge).toHaveTextContent('-8%');
  });

  it('renders flat with "unchanged" aria-label', () => {
    render(<TrendBadge value={0} label="Revenue" />);

    const badge = screen.getByRole('img');
    expect(badge).toHaveAttribute('aria-label', 'Revenue unchanged 0 percent');
    expect(badge).toHaveTextContent('0%');
  });

  it('uses tabular figures', () => {
    render(<TrendBadge value={15} label="Revenue" />);

    const badge = screen.getByRole('img');
    const valueSpan = badge.querySelector('span[style]');
    expect(valueSpan?.getAttribute('style')).toContain('font-feature-settings');
    expect(valueSpan?.getAttribute('style')).toContain('"tnum"');
  });
});
