import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import { validCsv, missingColumn, emptyFile } from '../test/fixtures/csvFiles.js';

const mockVerifyAccessToken = vi.fn();
const mockTrackEvent = vi.fn();

vi.mock('../services/auth/tokenService.js', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

vi.mock('../services/analytics/trackEvent.js', () => ({
  trackEvent: mockTrackEvent,
}));

vi.mock('../config.js', () => ({
  env: { NODE_ENV: 'test' },
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

const { createTestApp } = await import('../test/helpers/testApp.js');
const { authMiddleware } = await import('../middleware/authMiddleware.js');
const { datasetsRouter } = await import('./datasets.js');

// Typed shapes for res.json() — avoids `unknown` property access errors
interface SuccessBody {
  data: {
    headers: string[];
    sampleRows: Record<string, string>[];
    rowCount: number;
    validRowCount: number;
    skippedRowCount: number;
    fileName: string;
  };
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details: {
      errors: { column: string; message: string }[];
      fileName?: string;
    };
  };
}

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const result = await createTestApp((app) => {
    app.use(authMiddleware);
    app.use('/datasets', datasetsRouter);
  });
  server = result.server;
  baseUrl = result.baseUrl;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => vi.clearAllMocks());

function userPayload() {
  return {
    sub: '42',
    org_id: 10,
    role: 'owner',
    isAdmin: false,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  };
}

const authHeaders = { Cookie: 'access_token=valid-jwt' };

function uploadCsv(csvContent: string, fileName = 'test.csv') {
  const form = new FormData();
  form.append('file', new Blob([csvContent], { type: 'text/csv' }), fileName);
  return fetch(`${baseUrl}/datasets`, {
    method: 'POST',
    body: form,
    headers: authHeaders,
  });
}

describe('POST /datasets', () => {
  it('returns 200 with preview data for valid CSV', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(userPayload());

    const res = await uploadCsv(validCsv);
    expect(res.status).toBe(200);

    const body = (await res.json()) as SuccessBody;
    expect(body.data).toBeDefined();
    expect(body.data.headers).toEqual(['date', 'amount', 'category']);
    expect(body.data.sampleRows).toHaveLength(3);
    expect(body.data.rowCount).toBe(3);
    expect(body.data.validRowCount).toBe(3);
    expect(body.data.skippedRowCount).toBe(0);
    expect(body.data.fileName).toBe('test.csv');
  });

  it('returns 400 for CSV with missing required columns', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(userPayload());

    const res = await uploadCsv(missingColumn);
    expect(res.status).toBe(400);

    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.errors[0]!.column).toBe('amount');
    expect(body.error.details.errors[0]!.message).toContain('We expected');
  });

  it('returns 400 for empty file', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(userPayload());

    const res = await uploadCsv(emptyFile);
    expect(res.status).toBe(400);

    const body = (await res.json()) as ErrorBody;
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('empty');
  });

  it('returns 401 without auth', async () => {
    const form = new FormData();
    form.append('file', new Blob(['date,amount,category'], { type: 'text/csv' }), 'test.csv');

    const res = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(401);
  });

  it('calls trackEvent on successful validation', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(userPayload());

    await uploadCsv(validCsv);

    expect(mockTrackEvent).toHaveBeenCalledWith(
      10,
      42,
      'dataset.uploaded',
      expect.objectContaining({ rowCount: 3, fileName: 'test.csv' }),
    );
  });

  it('returns 400 for wrong file type', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(userPayload());

    const form = new FormData();
    form.append('file', new Blob(['not csv'], { type: 'application/json' }), 'data.json');

    const res = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      body: form,
      headers: authHeaders,
    });
    expect(res.status).toBe(400);

    const body = (await res.json()) as ErrorBody;
    expect(body.error.message).toContain('expected a .csv file');
  });
});
