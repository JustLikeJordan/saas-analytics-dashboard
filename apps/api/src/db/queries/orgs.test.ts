import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));

vi.mock('../../lib/db.js', () => ({
  db: {
    query: {
      orgs: {
        findFirst: mockFindFirst,
      },
    },
    insert: vi.fn().mockReturnValue({ values: mockValues }),
  },
}));

const { createOrg, findOrgBySlug, findOrgById } = await import('./orgs.js');

describe('orgs queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createOrg', () => {
    it('inserts an org and returns the created record', async () => {
      const created = { id: 1, name: 'Acme Inc', slug: 'acme-inc' };
      mockReturning.mockResolvedValueOnce([created]);

      const result = await createOrg({ name: 'Acme Inc', slug: 'acme-inc' });

      expect(result).toEqual(created);
    });

    it('throws if insert returns empty', async () => {
      mockReturning.mockResolvedValueOnce([]);

      await expect(createOrg({ name: 'Test', slug: 'test' })).rejects.toThrow(
        'Insert failed to return org',
      );
    });
  });

  describe('findOrgBySlug', () => {
    it('returns org when found', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 1, slug: 'acme-inc' });

      const result = await findOrgBySlug('acme-inc');

      expect(mockFindFirst).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: 1, slug: 'acme-inc' });
    });

    it('returns undefined when not found', async () => {
      mockFindFirst.mockResolvedValueOnce(undefined);

      const result = await findOrgBySlug('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('findOrgById', () => {
    it('returns org when found', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 42, name: 'Test Org' });

      const result = await findOrgById(42);

      expect(mockFindFirst).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: 42, name: 'Test Org' });
    });
  });
});
