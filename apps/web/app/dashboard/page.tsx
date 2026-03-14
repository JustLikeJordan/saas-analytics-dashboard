import { cookies } from 'next/headers';
import type { ChartData, SubscriptionTier } from 'shared/types';
import { apiServer, ApiServerError } from '@/lib/api-server';
import { AUTH } from 'shared/constants';
import { DashboardShell } from './DashboardShell';

const EMPTY_CHART_DATA: ChartData = {
  revenueTrend: [],
  expenseBreakdown: [],
  orgName: 'Dashboard',
  isDemo: true,
  availableCategories: [],
  dateRange: null,
  demoState: 'empty',
  datasetId: null,
};

async function fetchCachedSummary(datasetId: number): Promise<string | undefined> {
  try {
    const res = await apiServer<{ content: string }>(`/ai-summaries/${datasetId}/cached`);
    return res.data.content;
  } catch {
    return undefined;
  }
}

async function fetchTier(cookieHeader: string): Promise<SubscriptionTier> {
  try {
    const res = await apiServer<{ tier: SubscriptionTier }>('/subscriptions/tier', {
      cookies: cookieHeader,
    });
    return res.data.tier;
  } catch {
    return 'free';
  }
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const hasAuth = cookieStore.has(AUTH.COOKIE_NAMES.ACCESS_TOKEN);

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

  // anonymous visitors get pre-cached seed AI summary (no streaming)
  // no tier gating — full seed summary is the "aha moment"
  let cachedSummary: string | undefined;
  if (!hasAuth && chartData.datasetId) {
    cachedSummary = await fetchCachedSummary(chartData.datasetId);
  }

  // authenticated users get tier-gated experience
  const tier = hasAuth ? await fetchTier(cookieHeader) : undefined;

  return <DashboardShell initialData={chartData} cachedSummary={cachedSummary} tier={tier} />;
}
