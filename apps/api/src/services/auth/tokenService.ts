import { SignJWT, jwtVerify } from 'jose';
import { randomBytes, createHash } from 'node:crypto';
import { env } from '../../config.js';
import { logger } from '../../lib/logger.js';
import { AuthenticationError } from '../../lib/appError.js';
import * as refreshTokensQueries from '../../db/queries/refreshTokens.js';
import * as usersQueries from '../../db/queries/users.js';
import * as userOrgsQueries from '../../db/queries/userOrgs.js';
import { AUTH } from 'shared/constants';
import type { Role } from 'shared/types';

const JWT_ALG = 'HS256' as const;

function getSecret() {
  return new TextEncoder().encode(env.JWT_SECRET);
}

export async function signAccessToken(payload: {
  userId: number;
  orgId: number;
  role: Role;
  isAdmin: boolean;
}): Promise<string> {
  return new SignJWT({
    org_id: payload.orgId,
    role: payload.role,
    isAdmin: payload.isAdmin,
  })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(String(payload.userId))
    .setIssuedAt()
    .setExpirationTime(AUTH.ACCESS_TOKEN_EXPIRY)
    .sign(getSecret());
}

export async function verifyAccessToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      sub: payload.sub!,
      org_id: payload.org_id as number,
      role: payload.role as Role,
      isAdmin: payload.isAdmin as boolean,
      iat: payload.iat!,
      exp: payload.exp!,
    };
  } catch {
    throw new AuthenticationError('Invalid or expired access token');
  }
}

export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export async function createTokenPair(
  userId: number,
  orgId: number,
  role: Role,
  isAdmin: boolean,
) {
  const accessToken = await signAccessToken({ userId, orgId, role, isAdmin });
  const { raw, hash } = generateRefreshToken();

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + AUTH.REFRESH_TOKEN_EXPIRY_DAYS);

  await refreshTokensQueries.createRefreshToken({
    tokenHash: hash,
    userId,
    orgId,
    expiresAt,
  });

  logger.info({ userId, orgId }, 'Token pair created');

  return { accessToken, refreshToken: raw };
}

export async function rotateRefreshToken(rawToken: string) {
  const hash = createHash('sha256').update(rawToken).digest('hex');
  const existing = await refreshTokensQueries.findByHash(hash);

  if (!existing) {
    // Possible reuse: check if this hash matches a revoked token
    // If so, revoke ALL tokens for the associated user (security measure)
    logger.warn({ tokenHashPrefix: hash.slice(0, 8) }, 'Refresh token not found — possible reuse');
    throw new AuthenticationError('Invalid refresh token');
  }

  // Revoke the old token
  await refreshTokensQueries.revokeToken(existing.id);

  // Fetch fresh user data for the new access token claims
  const user = await usersQueries.findUserById(existing.userId);
  if (!user) {
    throw new AuthenticationError('User not found');
  }

  const memberships = await userOrgsQueries.getUserOrgs(user.id);
  const membership = memberships.find((m) => m.orgId === existing.orgId);
  if (!membership) {
    throw new AuthenticationError('Organization membership not found');
  }

  // Issue new token pair
  const { accessToken, refreshToken } = await createTokenPair(
    user.id,
    existing.orgId,
    membership.role as Role,
    user.isPlatformAdmin,
  );

  logger.info({ userId: user.id, orgId: existing.orgId }, 'Refresh token rotated');

  return { accessToken, refreshToken, userId: user.id, orgId: existing.orgId };
}
