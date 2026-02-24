import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { refreshTokens } from '../schema.js';

export async function createRefreshToken(data: {
  tokenHash: string;
  userId: number;
  orgId: number;
  expiresAt: Date;
}) {
  const [token] = await db.insert(refreshTokens).values(data).returning();
  return token!;
}

export async function findByHash(tokenHash: string) {
  return db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      isNull(refreshTokens.revokedAt),
    ),
  });
}

export async function revokeToken(tokenId: number) {
  const [token] = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, tokenId))
    .returning();
  return token;
}

export async function revokeAllForUser(userId: number) {
  return db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
