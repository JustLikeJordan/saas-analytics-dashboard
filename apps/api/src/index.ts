import express from 'express';
import pinoHttp from 'pino-http';
import { env } from './config.js';
import { logger } from './lib/logger.js';
import { correlationId } from './middleware/correlationId.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import { redis } from './lib/redis.js';

const app = express();

app.use(correlationId);
// TODO: mount stripe webhook route here — needs raw body, must come before json parser
app.use(express.json({ limit: '10mb' }));
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
  }),
);
app.use(healthRouter);
app.use(errorHandler);

async function start() {
  try {
    await redis.connect();
  } catch (err) {
    logger.error({ err }, 'Redis connect failed — shutting down');
    process.exit(1);
  }

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API server started');
  });
}

start();
