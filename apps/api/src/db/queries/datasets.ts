import { eq, and, desc } from 'drizzle-orm';
import type { DemoModeState } from 'shared/types';
import { db } from '../../lib/db.js';
import { datasets } from '../schema.js';

export async function createDataset(
  orgId: number,
  data: { name: string; sourceType?: 'csv'; isSeedData?: boolean; uploadedBy?: number | null },
) {
  const [dataset] = await db
    .insert(datasets)
    .values({ orgId, ...data })
    .returning();
  if (!dataset) throw new Error('Insert failed to return dataset');
  return dataset;
}

export async function getDatasetsByOrg(orgId: number) {
  return db.query.datasets.findMany({
    where: eq(datasets.orgId, orgId),
    orderBy: desc(datasets.createdAt),
  });
}

/** User orgs only: returns 'empty' or 'user_only'. Seed org states handled separately. */
export async function getUserOrgDemoState(orgId: number): Promise<DemoModeState> {
  const userDataset = await db.query.datasets.findFirst({
    where: and(eq(datasets.orgId, orgId), eq(datasets.isSeedData, false)),
  });
  return userDataset ? 'user_only' : 'empty';
}

export async function getSeedDataset(orgId: number) {
  return db.query.datasets.findFirst({
    where: and(eq(datasets.orgId, orgId), eq(datasets.isSeedData, true)),
  });
}
