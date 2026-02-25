import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';

const protectedRouter = Router();

// every route mounted on this router requires a valid JWT
protectedRouter.use(authMiddleware);

// future stories mount their routes here:
// protectedRouter.use(datasetRouter);
// protectedRouter.use(aiRouter);
// protectedRouter.use(adminRouter); // + roleGuard('admin')

export default protectedRouter;
