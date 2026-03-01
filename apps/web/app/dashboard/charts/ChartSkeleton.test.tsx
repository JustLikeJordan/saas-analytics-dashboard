import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { ChartSkeleton } from './ChartSkeleton';

afterEach(cleanup);

describe('ChartSkeleton', () => {
  it('renders with role="status" and sr-only loading text', () => {
    render(<ChartSkeleton />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Loading chart...')).toBeInTheDocument();
  });

  it('renders polyline for line variant', () => {
    const { container } = render(<ChartSkeleton variant="line" />);

    expect(container.querySelector('polyline')).toBeInTheDocument();
    expect(container.querySelector('rect')).not.toBeInTheDocument();
  });

  it('renders rect shapes for bar variant', () => {
    const { container } = render(<ChartSkeleton variant="bar" />);

    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThan(0);
    expect(container.querySelector('polyline')).not.toBeInTheDocument();
  });

  it('has title and value callout placeholder divs', () => {
    const { container } = render(<ChartSkeleton />);

    const placeholders = container.querySelectorAll('.animate-skeleton-pulse');
    expect(placeholders.length).toBeGreaterThanOrEqual(2);
  });

  it('applies custom className', () => {
    render(<ChartSkeleton className="my-custom-class" />);

    const el = screen.getByRole('status');
    expect(el.className).toContain('my-custom-class');
  });
});
