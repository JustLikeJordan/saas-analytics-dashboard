import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { correlationId } from '../../middleware/correlationId.js';
import { errorHandler } from '../../middleware/errorHandler.js';

type AppSetup = (app: express.Express) => void;

/**
 * Spins up a throwaway Express app with the standard middleware skeleton
 * (correlationId, json, cookieParser, errorHandler). The setup callback
 * lets each test file mount its own middleware and routes in between.
 *
 * Returns the running server and its base URL. Caller is responsible
 * for closing the server in afterAll.
 */
export async function createTestApp(setup: AppSetup) {
  const app = express();
  app.use(correlationId);
  app.use(express.json());
  app.use(cookieParser());

  setup(app);

  app.use(errorHandler);

  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return { server, baseUrl, app };
}
