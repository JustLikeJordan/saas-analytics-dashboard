'use client';

import { Component, type ReactNode, useEffect } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Upload } from 'lucide-react';
import type { ChartData } from 'shared/types';
import { apiClient } from '@/lib/api-client';
import { useSidebar } from './contexts/SidebarContext';
import { RevenueChart } from './charts/RevenueChart';
import { ExpenseChart } from './charts/ExpenseChart';
import { ChartSkeleton } from './charts/ChartSkeleton';
import { LazyChart } from './charts/LazyChart';

interface DashboardShellProps {
  initialData: ChartData;
}

async function fetchChartData(): Promise<ChartData> {
  const res = await apiClient<ChartData>('/dashboard/charts');
  return res.data;
}

class ChartErrorBoundary extends Component<
  { children: ReactNode; onRetry: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="col-span-full flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">Unable to load charts</p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onRetry();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function EmptyState() {
  return (
    <div className="col-span-full flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-6 text-center">
      <Upload className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">No data to display</p>
      <Link
        href="/upload"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Upload a CSV
      </Link>
    </div>
  );
}

export function DashboardShell({ initialData }: DashboardShellProps) {
  const { setOrgName } = useSidebar();
  const { data = initialData, isLoading, mutate } = useSWR(
    '/dashboard/charts',
    fetchChartData,
    {
      fallbackData: initialData,
      revalidateOnFocus: true,
      revalidateOnReconnect: false,
    },
  );

  useEffect(() => {
    setOrgName(data.orgName);
  }, [data.orgName, setOrgName]);

  const hasRevenue = data.revenueTrend.length > 0;
  const hasExpenses = data.expenseBreakdown.length > 0;
  const hasData = hasRevenue || hasExpenses;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{data.orgName}</h1>
        {data.isDemo && (
          <p className="mt-1 text-sm text-muted-foreground">
            Viewing sample data &mdash; upload your own CSV to see insights about your business.
          </p>
        )}
      </div>

      <ChartErrorBoundary onRetry={() => mutate()}>
        {isLoading && !hasData ? (
          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            <ChartSkeleton variant="line" />
            <ChartSkeleton variant="bar" />
          </div>
        ) : !hasData ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 md:gap-6">
            {hasRevenue && (
              <LazyChart skeletonVariant="line">
                <RevenueChart data={data.revenueTrend} />
              </LazyChart>
            )}
            {hasExpenses && (
              <LazyChart skeletonVariant="bar">
                <ExpenseChart data={data.expenseBreakdown} />
              </LazyChart>
            )}
          </div>
        )}
      </ChartErrorBoundary>
    </div>
  );
}
