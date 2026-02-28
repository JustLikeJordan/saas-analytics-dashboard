import { cookies } from 'next/headers';
import type { ChartData } from 'shared/types';
import { AUTH } from 'shared/constants';
import { apiServer, ApiServerError } from '@/lib/api-server';
import { DashboardShell } from './DashboardShell';

const EMPTY_CHART_DATA: ChartData = {
  revenueTrend: [],
  expenseBreakdown: [],
  orgName: 'Dashboard',
  isDemo: true,
};

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  let chartData: ChartData;
  try {
    const res = await apiServer<ChartData>('/dashboard/charts', {
      cookies: cookieHeader,
    });
    chartData = res.data;
  } catch (err) {
    if (err instanceof ApiServerError) {
      chartData = EMPTY_CHART_DATA;
    } else {
      throw err;
    }
  }

  const isAuthenticated = !!cookieStore.get(AUTH.COOKIE_NAMES.ACCESS_TOKEN)?.value;

  return (
    <DashboardShell
      initialData={chartData}
      isAuthenticated={isAuthenticated}
    />
  );
}
