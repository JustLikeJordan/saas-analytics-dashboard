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

export type Role = (typeof ROLES)[keyof typeof ROLES];
