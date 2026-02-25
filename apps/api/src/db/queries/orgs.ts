import { eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { orgs } from '../schema.js';

export async function createOrg(data: { name: string; slug: string }) {
  const [org] = await db.insert(orgs).values(data).returning();
  if (!org) throw new Error('Insert failed to return org');
  return org;
}

/** Cross-org lookup — orgs table is the org entity itself (intentional exception) */
export async function findOrgBySlug(slug: string) {
  return db.query.orgs.findFirst({
    where: eq(orgs.slug, slug),
  });
}

/** Cross-org lookup — orgs table is the org entity itself (intentional exception) */
export async function findOrgById(orgId: number) {
  return db.query.orgs.findFirst({
    where: eq(orgs.id, orgId),
  });
}
