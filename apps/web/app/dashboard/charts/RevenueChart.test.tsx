import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);

const mockUseReducedMotion = vi.fn(() => false);

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

let capturedLineProps: Record<string, unknown> = {};

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-container">{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: (props: Record<string, unknown>) => {
    capturedLineProps = props;
    return null;
  },
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

import { RevenueChart } from './RevenueChart';

const sampleData = [
  { month: 'Jan', revenue: 10000 },
  { month: 'Feb', revenue: 12000 },
  { month: 'Mar', revenue: 15000 },
];

afterEach(() => {
  capturedLineProps = {};
  mockUseReducedMotion.mockReturnValue(false);
});

describe('RevenueChart', () => {
  it('renders as a figure with "Revenue Trend" title', () => {
    render(<RevenueChart data={sampleData} />);

    expect(screen.getByRole('figure')).toBeInTheDocument();
    expect(screen.getByText('Revenue Trend')).toBeInTheDocument();
  });

  it('has role="img" with descriptive aria-label', () => {
    render(<RevenueChart data={sampleData} />);

    const chartArea = screen.getByRole('img', { name: /Line chart/ });
    const label = chartArea.getAttribute('aria-label')!;
    expect(label).toContain('Mar');
    expect(label).toContain('$15,000');
  });

  it('shows TrendBadge when data has 2+ points', () => {
    render(<RevenueChart data={sampleData} />);

    const badge = screen.getByRole('img', { name: /Revenue up/i });
    expect(badge).toBeInTheDocument();
  });

  it('shows value callout with formatted currency and month', () => {
    render(<RevenueChart data={sampleData} />);

    expect(screen.getByText('$15,000')).toBeInTheDocument();
    expect(screen.getByText(/Mar/)).toBeInTheDocument();
  });

  it('shows "$0" for zero last value', () => {
    const data = [
      { month: 'Jan', revenue: 100 },
      { month: 'Feb', revenue: 0 },
    ];
    render(<RevenueChart data={data} />);

    expect(screen.getByText('$0')).toBeInTheDocument();
  });

  it('enables animation when reduced motion is off', () => {
    mockUseReducedMotion.mockReturnValue(false);
    render(<RevenueChart data={sampleData} />);

    expect(capturedLineProps.isAnimationActive).toBe(true);
  });

  it('disables animation when prefers-reduced-motion is active', () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<RevenueChart data={sampleData} />);

    expect(capturedLineProps.isAnimationActive).toBe(false);
  });
});
