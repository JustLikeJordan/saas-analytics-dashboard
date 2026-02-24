import { eq } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { orgs } from '../schema.js';

export async function createOrg(data: { name: string; slug: string }) {
  const [org] = await db.insert(orgs).values(data).returning();
  return org!;
}

export async function findOrgBySlug(slug: string) {
  return db.query.orgs.findFirst({
    where: eq(orgs.slug, slug),
  });
}

export async function findOrgById(orgId: number) {
  return db.query.orgs.findFirst({
    where: eq(orgs.id, orgId),
  });
}
