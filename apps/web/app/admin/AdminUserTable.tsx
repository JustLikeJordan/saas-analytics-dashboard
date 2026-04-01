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
import { ShieldCheck } from 'lucide-react';
import type { AdminUserRow } from './types';
import { dateFmt } from './formatters';

export function AdminUserTable({ users }: { users: AdminUserRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Organizations</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-1.5">
                    {user.name}
                    {user.isPlatformAdmin && (
                      <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-label="Platform admin" />
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  {user.orgs.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No org</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {user.orgs.map((o) => (
                        <span
                          key={o.orgId}
                          className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs"
                        >
                          {o.orgName}
                          <span className="ml-1 text-muted-foreground">({o.role})</span>
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {dateFmt.format(new Date(user.createdAt))}
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No users yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
