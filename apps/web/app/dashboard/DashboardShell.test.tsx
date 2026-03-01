import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const mockMutate = vi.fn();
let mockSwrReturn = {
  data: undefined as unknown,
  isLoading: false,
  mutate: mockMutate,
};

vi.mock('swr', () => ({
  default: (_key: string, _fetcher: unknown, opts: { fallbackData: unknown }) => ({
    ...mockSwrReturn,
    data: mockSwrReturn.data ?? opts.fallbackData,
  }),
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: vi.fn(),
}));

let shouldThrow = false;

vi.mock('./charts/RevenueChart', () => ({
  RevenueChart: () => {
    if (shouldThrow) throw new Error('Render failed');
    return <div data-testid="revenue-chart">Revenue</div>;
  },
}));

vi.mock('./charts/ExpenseChart', () => ({
  ExpenseChart: () => <div data-testid="expense-chart">Expense</div>,
}));

vi.mock('./charts/ChartSkeleton', () => ({
  ChartSkeleton: ({ variant }: { variant?: string }) => (
    <div data-testid={`skeleton-${variant ?? 'line'}`}>Skeleton</div>
  ),
}));

vi.mock('./charts/LazyChart', () => ({
  LazyChart: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./contexts/SidebarContext', () => ({
  useSidebar: () => ({ setOrgName: vi.fn() }),
}));

import { DashboardShell } from './DashboardShell';
import type { ChartData } from 'shared/types';

const fullData: ChartData = {
  revenueTrend: [
    { month: 'Jan', revenue: 5000 },
    { month: 'Feb', revenue: 7000 },
  ],
  expenseBreakdown: [
    { category: 'Payroll', total: 3000 },
    { category: 'Rent', total: 1500 },
  ],
  orgName: 'Acme Corp',
  isDemo: false,
};

const emptyData: ChartData = {
  revenueTrend: [],
  expenseBreakdown: [],
  orgName: 'Dashboard',
  isDemo: true,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  shouldThrow = false;
  mockSwrReturn = { data: undefined as unknown, isLoading: false, mutate: mockMutate };
});

describe('DashboardShell', () => {
  it('renders org name as heading', () => {
    render(<DashboardShell initialData={fullData} />);

    expect(screen.getByRole('heading', { name: 'Acme Corp' })).toBeInTheDocument();
  });

  it('shows demo banner when isDemo is true', () => {
    render(<DashboardShell initialData={{ ...fullData, isDemo: true }} />);

    expect(screen.getByText(/Viewing sample data/)).toBeInTheDocument();
  });

  it('hides demo banner when isDemo is false', () => {
    render(<DashboardShell initialData={fullData} />);

    expect(screen.queryByText(/Viewing sample data/)).not.toBeInTheDocument();
  });

  it('renders both charts when data exists', () => {
    render(<DashboardShell initialData={fullData} />);

    expect(screen.getByTestId('revenue-chart')).toBeInTheDocument();
    expect(screen.getByTestId('expense-chart')).toBeInTheDocument();
  });

  it('shows empty state with upload CTA when no data', () => {
    render(<DashboardShell initialData={emptyData} />);

    expect(screen.getByText('No data to display')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload a CSV' })).toHaveAttribute('href', '/upload');
  });

  it('shows skeletons during loading with no fallback data', () => {
    mockSwrReturn = { data: emptyData, isLoading: true, mutate: mockMutate };

    render(<DashboardShell initialData={emptyData} />);

    expect(screen.getByTestId('skeleton-line')).toBeInTheDocument();
    expect(screen.getByTestId('skeleton-bar')).toBeInTheDocument();
  });

  it('only renders revenue chart when expense data is empty', () => {
    render(
      <DashboardShell initialData={{ ...fullData, expenseBreakdown: [] }} />,
    );

    expect(screen.getByTestId('revenue-chart')).toBeInTheDocument();
    expect(screen.queryByTestId('expense-chart')).not.toBeInTheDocument();
  });

  it('only renders expense chart when revenue data is empty', () => {
    render(
      <DashboardShell initialData={{ ...fullData, revenueTrend: [] }} />,
    );

    expect(screen.queryByTestId('revenue-chart')).not.toBeInTheDocument();
    expect(screen.getByTestId('expense-chart')).toBeInTheDocument();
  });

  describe('error boundary', () => {
    it('shows "Unable to load charts" with retry button when a chart throws', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      shouldThrow = true;

      render(<DashboardShell initialData={fullData} />);

      expect(screen.getByText('Unable to load charts')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('recovers on retry click', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      shouldThrow = true;

      render(<DashboardShell initialData={fullData} />);
      expect(screen.getByText('Unable to load charts')).toBeInTheDocument();

      shouldThrow = false;
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

      expect(screen.queryByText('Unable to load charts')).not.toBeInTheDocument();
      expect(screen.getByTestId('revenue-chart')).toBeInTheDocument();
    });
  });
});
