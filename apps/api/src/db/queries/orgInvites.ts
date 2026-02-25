import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { orgInvites } from '../schema.js';

export async function createInvite(
  orgId: number,
  tokenHash: string,
  createdBy: number,
  expiresAt: Date,
) {
  const [invite] = await db
    .insert(orgInvites)
    .values({ orgId, tokenHash, createdBy, expiresAt })
    .returning();
  if (!invite) throw new Error('Insert failed to return invite');
  return invite;
}

export async function findByTokenHash(tokenHash: string) {
  return db.query.orgInvites.findFirst({
    where: eq(orgInvites.tokenHash, tokenHash),
    with: { org: true },
  });
}

export async function markUsed(id: number, usedBy: number) {
  const [invite] = await db
    .update(orgInvites)
    .set({ usedAt: new Date(), usedBy })
    .where(eq(orgInvites.id, id))
    .returning();
  return invite;
}

export async function getActiveInvites(orgId: number) {
  return db.query.orgInvites.findMany({
    where: and(
      eq(orgInvites.orgId, orgId),
      isNull(orgInvites.usedAt),
      gt(orgInvites.expiresAt, new Date()),
    ),
  });
}
