import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';

const mockVerifyAccessToken = vi.fn();
const mockGetOrgsWithStats = vi.fn();
const mockGetUsers = vi.fn();
const mockGetOrgDetail = vi.fn();
const mockGetSystemHealth = vi.fn();

vi.mock('../services/auth/tokenService.js', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

vi.mock('../services/admin/index.js', () => ({
  getOrgsWithStats: mockGetOrgsWithStats,
  getUsers: mockGetUsers,
  getOrgDetail: mockGetOrgDetail,
  getSystemHealth: mockGetSystemHealth,
}));

vi.mock('../config.js', () => ({
  env: { NODE_ENV: 'test', APP_URL: 'http://localhost:3000' },
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

const { createTestApp } = await import('../test/helpers/testApp.js');
const { authMiddleware } = await import('../middleware/authMiddleware.js');
const { roleGuard } = await import('../middleware/roleGuard.js');
const { adminRouter } = await import('./admin.js');

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const result = await createTestApp((app) => {
    app.use(authMiddleware);
    app.use('/admin', roleGuard('admin'), adminRouter);
  });
  server = result.server;
  baseUrl = result.baseUrl;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => vi.clearAllMocks());

function adminPayload() {
  return {
    sub: '1',
    org_id: 10,
    role: 'owner' as const,
    isAdmin: true,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  };
}

function regularPayload() {
  return {
    sub: '2',
    org_id: 10,
    role: 'member' as const,
    isAdmin: false,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
  };
}

const authHeaders = {
  Cookie: 'access_token=valid-jwt',
  'Content-Type': 'application/json',
};

const fakeOrgs = [
  { id: 1, name: 'Acme', slug: 'acme', memberCount: 3, datasetCount: 2, subscriptionTier: 'pro', createdAt: '2026-01-01' },
];
const fakeStats = { totalOrgs: 1, totalUsers: 1, proSubscribers: 1 };
const fakeUsers = [
  { id: 1, email: 'a@b.com', name: 'Alice', isPlatformAdmin: true, orgs: [], createdAt: '2026-01-01' },
];

describe('GET /admin/orgs', () => {
  it('returns 200 with org list for admin', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(adminPayload());
    mockGetOrgsWithStats.mockResolvedValueOnce({ orgs: fakeOrgs, stats: fakeStats });

    const res = await fetch(`${baseUrl}/admin/orgs`, { headers: authHeaders });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual(fakeOrgs);
    expect(json.meta.total).toBe(1);
    expect(json.meta.stats).toEqual(fakeStats);
  });

  it('returns 403 for non-admin user', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(regularPayload());

    const res = await fetch(`${baseUrl}/admin/orgs`, { headers: authHeaders });
    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await fetch(`${baseUrl}/admin/orgs`);
    expect(res.status).toBe(401);
  });
});

describe('GET /admin/users', () => {
  it('returns 200 with user list for admin', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(adminPayload());
    mockGetUsers.mockResolvedValueOnce(fakeUsers);

    const res = await fetch(`${baseUrl}/admin/users`, { headers: authHeaders });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual(fakeUsers);
    expect(json.meta.total).toBe(1);
  });

  it('returns 403 for non-admin user', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(regularPayload());

    const res = await fetch(`${baseUrl}/admin/users`, { headers: authHeaders });
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/orgs/:orgId', () => {
  it('returns 200 with org detail for admin', async () => {
    const fakeOrg = { id: 1, name: 'Acme', members: [], datasets: [], subscription: null };
    mockVerifyAccessToken.mockResolvedValueOnce(adminPayload());
    mockGetOrgDetail.mockResolvedValueOnce(fakeOrg);

    const res = await fetch(`${baseUrl}/admin/orgs/1`, { headers: authHeaders });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual(fakeOrg);
    expect(mockGetOrgDetail).toHaveBeenCalledWith(1);
  });

  it('returns 403 for non-admin user', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(regularPayload());

    const res = await fetch(`${baseUrl}/admin/orgs/1`, { headers: authHeaders });
    expect(res.status).toBe(403);
  });

  it('returns 404 when org not found', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(adminPayload());
    const { NotFoundError } = await import('../lib/appError.js');
    mockGetOrgDetail.mockRejectedValueOnce(new NotFoundError('Org 999 not found'));

    const res = await fetch(`${baseUrl}/admin/orgs/999`, { headers: authHeaders });
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric orgId', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(adminPayload());

    const res = await fetch(`${baseUrl}/admin/orgs/abc`, { headers: authHeaders });
    expect(res.status).toBe(400);
  });
});

const fakeHealth = {
  services: {
    database: { status: 'ok', latencyMs: 2 },
    redis: { status: 'ok', latencyMs: 1 },
    claude: { status: 'ok', latencyMs: 50 },
  },
  uptime: { seconds: 3600, formatted: '1h 0m' },
  timestamp: '2026-03-30T12:00:00.000Z',
};

describe('GET /admin/health', () => {
  it('returns 200 with health data for admin', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(adminPayload());
    mockGetSystemHealth.mockResolvedValueOnce(fakeHealth);

    const res = await fetch(`${baseUrl}/admin/health`, { headers: authHeaders });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual(fakeHealth);
    expect(json.data.services.database).toHaveProperty('status');
    expect(json.data.services.redis).toHaveProperty('status');
    expect(json.data.services.claude).toHaveProperty('status');
    expect(json.data.uptime).toHaveProperty('seconds');
    expect(json.data.uptime).toHaveProperty('formatted');
  });

  it('returns 403 for non-admin user', async () => {
    mockVerifyAccessToken.mockResolvedValueOnce(regularPayload());

    const res = await fetch(`${baseUrl}/admin/health`, { headers: authHeaders });
    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await fetch(`${baseUrl}/admin/health`);
    expect(res.status).toBe(401);
  });
});
