'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AdminOrgRow } from './types';
import { dateFmt } from './formatters';

function tierBadge(tier: string | null) {
  if (tier === 'pro') {
    return (
      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        Pro
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Free
    </span>
  );
}

export function AdminOrgTable({ orgs }: { orgs: AdminOrgRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organizations</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead className="text-right">Members</TableHead>
              <TableHead className="text-right">Datasets</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-medium">{org.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{org.slug}</TableCell>
                <TableCell className="text-right" style={{ fontFeatureSettings: '"tnum"' }}>
                  {org.memberCount}
                </TableCell>
                <TableCell className="text-right" style={{ fontFeatureSettings: '"tnum"' }}>
                  {org.datasetCount}
                </TableCell>
                <TableCell>{tierBadge(org.subscriptionTier)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {dateFmt.format(new Date(org.createdAt))}
                </TableCell>
              </TableRow>
            ))}
            {orgs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No organizations yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
