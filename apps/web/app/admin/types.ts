export interface AdminOrgRow {
  id: number;
  name: string;
  slug: string;
  memberCount: number;
  datasetCount: number;
  subscriptionTier: string | null;
  createdAt: string;
}

export interface AdminUserRow {
  id: number;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  orgs: Array<{ orgId: number; orgName: string; role: string }>;
  createdAt: string;
}

export interface AdminStats {
  totalOrgs: number;
  totalUsers: number;
  proSubscribers: number;
}

export interface AnalyticsEventRow {
  id: number;
  eventName: string;
  orgName: string;
  userEmail: string;
  userName: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AnalyticsEventsMeta {
  total: number;
  pagination: { page: number; pageSize: number; totalPages: number };
}

export type { ServiceStatus, SystemHealth } from 'shared/types';
