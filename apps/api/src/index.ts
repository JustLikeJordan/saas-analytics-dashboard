import express from 'express';
import pinoHttp from 'pino-http';
import { env } from './config.js';
import { logger } from './lib/logger.js';
import { correlationId } from './middleware/correlationId.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import { redis } from './lib/redis.js';

const app = express();

// 1. Correlation ID — FIRST (threads through all logs)
app.use(correlationId);

// 2. Stripe webhook route placeholder — BEFORE body parser (needs raw body)
// Will be mounted here in a later story

// 3. JSON body parser
app.use(express.json({ limit: '10mb' }));

// 4. Pino HTTP request logging
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
  }),
);

// 5. Route handlers
app.use(healthRouter);

// 6. Error handler — LAST
app.use(errorHandler);

async function start() {
  try {
    await redis.connect();
    logger.info('Redis connected successfully');
  } catch (err) {
    logger.error({ err }, 'Failed to connect to Redis');
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API server started');
  });
}

start();
