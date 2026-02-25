import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { refreshTokens } from '../schema.js';

export async function createRefreshToken(data: {
  tokenHash: string;
  userId: number;
  orgId: number;
  expiresAt: Date;
}) {
  const [token] = await db.insert(refreshTokens).values(data).returning();
  if (!token) throw new Error('Insert failed to return refresh token');
  return token;
}

export async function findByHash(tokenHash: string) {
  return db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      isNull(refreshTokens.revokedAt),
      gt(refreshTokens.expiresAt, new Date()),
    ),
  });
}

/** Looks up a token by hash regardless of revocation status — used for reuse detection */
export async function findAnyByHash(tokenHash: string) {
  return db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.tokenHash, tokenHash),
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

/** Cross-org revocation — revokes all tokens for a user across all orgs (security: full logout) */
export async function revokeAllForUser(userId: number) {
  return db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}
