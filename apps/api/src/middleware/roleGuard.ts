import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './authMiddleware.js';
import { AuthorizationError } from '../lib/appError.js';

type GuardRole = 'owner' | 'member' | 'admin';

export function roleGuard(requiredRole: GuardRole) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const { user } = req as AuthenticatedRequest;

    if (requiredRole === 'admin') {
      if (!user.isAdmin) {
        throw new AuthorizationError('Platform admin access required');
      }
      return next();
    }

    if (requiredRole === 'owner') {
      if (user.role !== 'owner') {
        throw new AuthorizationError('Owner access required');
      }
      return next();
    }

    // 'member' — any authenticated user passes (owner or member)
    next();
  };
}
