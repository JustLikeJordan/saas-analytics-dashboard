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

export type { ServiceStatus, SystemHealth } from 'shared/types';
