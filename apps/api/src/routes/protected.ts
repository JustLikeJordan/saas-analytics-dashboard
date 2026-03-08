import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { inviteRouter } from './invites.js';
import { datasetsRouter } from './datasets.js';
import { aiSummaryRouter } from './aiSummary.js';

const protectedRouter = Router();

// every route mounted on this router requires a valid JWT
protectedRouter.use(authMiddleware);

protectedRouter.use('/invites', inviteRouter);
protectedRouter.use('/datasets', datasetsRouter);

protectedRouter.use('/ai-summaries', aiSummaryRouter);

export default protectedRouter;
