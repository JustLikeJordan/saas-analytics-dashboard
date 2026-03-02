import { eq, and, desc } from 'drizzle-orm';
import type { DemoModeState } from 'shared/types';
import { db, type DbTransaction } from '../../lib/db.js';
import { datasets } from '../schema.js';
import { insertBatch } from './dataRows.js';

interface NormalizedRow {
  sourceType?: 'csv';
  category: string;
  parentCategory?: string | null;
  date: Date;
  amount: string;
  label?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Atomic upload: delete seed data, insert dataset + rows, compute demo state. */
export async function persistUpload(
  orgId: number,
  userId: number,
  fileName: string,
  normalizedRows: NormalizedRow[],
) {
  return db.transaction(async (tx) => {
    await deleteSeedDatasets(orgId, tx);

    const dataset = await createDataset(orgId, {
      name: fileName,
      sourceType: 'csv',
      uploadedBy: userId,
    }, tx);
    await insertBatch(orgId, dataset.id, normalizedRows, tx);

    // TODO(epic-3): invalidate ai_summaries for orgId — stale on data upload per architecture
    const demoState = await getUserOrgDemoState(orgId, tx);
    return { datasetId: dataset.id, rowCount: normalizedRows.length, demoState };
  });
}

export async function createDataset(
  orgId: number,
  data: { name: string; sourceType?: 'csv'; isSeedData?: boolean; uploadedBy?: number | null },
  client: typeof db | DbTransaction = db,
) {
  const [dataset] = await client
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
export async function getUserOrgDemoState(
  orgId: number,
  client: typeof db | DbTransaction = db,
): Promise<DemoModeState> {
  const userDataset = await client.query.datasets.findFirst({
    where: and(eq(datasets.orgId, orgId), eq(datasets.isSeedData, false)),
  });
  return userDataset ? 'user_only' : 'empty';
}

export async function getSeedDataset(
  orgId: number,
  client: typeof db | DbTransaction = db,
) {
  return client.query.datasets.findFirst({
    where: and(eq(datasets.orgId, orgId), eq(datasets.isSeedData, true)),
  });
}

/** Removes all seed datasets (and their data rows via cascade) for an org. */
export async function deleteSeedDatasets(
  orgId: number,
  client: typeof db | DbTransaction = db,
) {
  return client
    .delete(datasets)
    .where(and(eq(datasets.orgId, orgId), eq(datasets.isSeedData, true)));
}
