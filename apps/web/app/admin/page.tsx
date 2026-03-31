import { cookies } from 'next/headers';
import { AUTH } from 'shared/constants';
import { apiServer } from '@/lib/api-server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, CreditCard } from 'lucide-react';
import { AdminOrgTable } from './AdminOrgTable';
import { AdminUserTable } from './AdminUserTable';
import { SystemHealthPanel } from './SystemHealthPanel';
import type { AdminOrgRow, AdminUserRow, AdminStats } from './types';

async function fetchAdminOrgs(cookieHeader: string) {
  const res = await apiServer<AdminOrgRow[]>('/admin/orgs', { cookies: cookieHeader });
  return { orgs: res.data, stats: (res.meta?.stats as AdminStats) ?? { totalOrgs: 0, totalUsers: 0, proSubscribers: 0 } };
}

async function fetchAdminUsers(cookieHeader: string) {
  const res = await apiServer<AdminUserRow[]>('/admin/users', { cookies: cookieHeader });
  return res.data;
}

export default async function AdminPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.get(AUTH.COOKIE_NAMES.ACCESS_TOKEN)
    ? cookieStore.toString()
    : '';

  const [{ orgs, stats }, users] = await Promise.all([
    fetchAdminOrgs(cookieHeader),
    fetchAdminUsers(cookieHeader),
  ]);

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Platform Admin</h1>

      <div className="grid gap-4 md:grid-cols-3" role="group" aria-label="Platform statistics">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Organizations</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ fontFeatureSettings: '"tnum"' }} aria-label={`${stats.totalOrgs} organizations`}>
              {stats.totalOrgs}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ fontFeatureSettings: '"tnum"' }} aria-label={`${stats.totalUsers} users`}>
              {stats.totalUsers}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pro Subscribers</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ fontFeatureSettings: '"tnum"' }} aria-label={`${stats.proSubscribers} pro subscribers`}>
              {stats.proSubscribers}
            </div>
          </CardContent>
        </Card>
      </div>

      <SystemHealthPanel />

      <div className="space-y-6">
        <AdminOrgTable orgs={orgs} />
        <AdminUserTable users={users} />
      </div>
    </div>
  );
}
