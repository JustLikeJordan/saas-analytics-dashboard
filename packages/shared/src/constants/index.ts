export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const AI_TIMEOUT_MS = 15_000; // 15s total, TTFT < 2s

export const RATE_LIMITS = {
  auth: { max: 10, windowMs: 60_000 },
  ai: { max: 5, windowMs: 60_000 },
  public: { max: 60, windowMs: 60_000 },
} as const;

export const ROLES = {
  OWNER: 'owner',
  MEMBER: 'member',
} as const;

export const AUTH = {
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY_DAYS: 7,
  OAUTH_STATE_EXPIRY_SECONDS: 600,
  COOKIE_NAMES: {
    ACCESS_TOKEN: 'access_token',
    REFRESH_TOKEN: 'refresh_token',
    OAUTH_STATE: 'oauth_state',
  },
  GOOGLE_AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  GOOGLE_TOKEN_URL: 'https://oauth2.googleapis.com/token',
  GOOGLE_JWKS_URL: 'https://www.googleapis.com/oauth2/v3/certs',
  GOOGLE_SCOPES: 'openid email profile',
} as const;
