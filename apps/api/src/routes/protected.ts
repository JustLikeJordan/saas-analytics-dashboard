import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';

const protectedRouter = Router();

// every route mounted on this router requires a valid JWT
protectedRouter.use(authMiddleware);

// Story 2+: mount dataset/AI/admin routes here
// AI routes need rateLimitAi (per-user, 5/min) — see rateLimiter.ts

export default protectedRouter;
