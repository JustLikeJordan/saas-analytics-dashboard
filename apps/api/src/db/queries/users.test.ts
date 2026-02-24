import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockSet = vi.fn(() => ({ where: vi.fn(() => ({ returning: mockReturning })) }));

vi.mock('../../lib/db.js', () => ({
  db: {
    query: {
      users: {
        findFirst: mockFindFirst,
      },
    },
    insert: mockInsert.mockReturnValue({ values: mockValues }),
    update: mockUpdate.mockReturnValue({ set: mockSet }),
  },
}));

const { findUserByEmail, findUserByGoogleId, findUserById, createUser } = await import(
  './users.js'
);

describe('users queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findUserByEmail', () => {
    it('calls findFirst with email filter', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 1, email: 'test@example.com' });

      const result = await findUserByEmail('test@example.com');

      expect(mockFindFirst).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: 1, email: 'test@example.com' });
    });

    it('returns undefined when user not found', async () => {
      mockFindFirst.mockResolvedValueOnce(undefined);

      const result = await findUserByEmail('missing@example.com');

      expect(result).toBeUndefined();
    });
  });

  describe('findUserByGoogleId', () => {
    it('calls findFirst with googleId filter', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 1, googleId: 'google-123' });

      const result = await findUserByGoogleId('google-123');

      expect(mockFindFirst).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: 1, googleId: 'google-123' });
    });
  });

  describe('findUserById', () => {
    it('calls findFirst with id filter', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 42 });

      const result = await findUserById(42);

      expect(mockFindFirst).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: 42 });
    });
  });

  describe('createUser', () => {
    it('inserts a user and returns the created record', async () => {
      const created = { id: 1, email: 'new@example.com', name: 'New User' };
      mockReturning.mockResolvedValueOnce([created]);

      const result = await createUser({
        email: 'new@example.com',
        name: 'New User',
        googleId: 'google-456',
      });

      expect(mockInsert).toHaveBeenCalledOnce();
      expect(result).toEqual(created);
    });
  });
});
