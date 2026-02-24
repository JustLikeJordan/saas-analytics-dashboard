import { eq, and } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { userOrgs } from '../schema.js';

export async function addMember(
  orgId: number,
  userId: number,
  role: 'owner' | 'member' = 'member',
) {
  const [membership] = await db
    .insert(userOrgs)
    .values({ orgId, userId, role })
    .returning();
  return membership!;
}

export async function findMembership(orgId: number, userId: number) {
  return db.query.userOrgs.findFirst({
    where: and(eq(userOrgs.orgId, orgId), eq(userOrgs.userId, userId)),
  });
}

export async function getUserOrgs(userId: number) {
  return db.query.userOrgs.findMany({
    where: eq(userOrgs.userId, userId),
    with: { org: true },
  });
}

export async function getOrgMembers(orgId: number) {
  return db.query.userOrgs.findMany({
    where: eq(userOrgs.orgId, orgId),
    with: { user: true },
  });
}
