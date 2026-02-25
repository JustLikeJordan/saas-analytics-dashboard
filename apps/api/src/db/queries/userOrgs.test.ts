import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));

vi.mock('../../lib/db.js', () => ({
  db: {
    query: {
      userOrgs: {
        findFirst: mockFindFirst,
        findMany: mockFindMany,
      },
    },
    insert: vi.fn().mockReturnValue({ values: mockValues }),
  },
}));

const { addMember, findMembership, getUserOrgs, getOrgMembers } = await import(
  './userOrgs.js'
);

describe('userOrgs queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addMember', () => {
    it('inserts a membership and returns it', async () => {
      const created = { id: 1, orgId: 10, userId: 20, role: 'member' };
      mockReturning.mockResolvedValueOnce([created]);

      const result = await addMember(10, 20);

      expect(result).toEqual(created);
    });

    it('accepts a role parameter', async () => {
      const created = { id: 2, orgId: 10, userId: 30, role: 'owner' };
      mockReturning.mockResolvedValueOnce([created]);

      const result = await addMember(10, 30, 'owner');

      expect(result).toEqual(created);
    });

    it('throws if insert returns empty', async () => {
      mockReturning.mockResolvedValueOnce([]);

      await expect(addMember(10, 20)).rejects.toThrow(
        'Insert failed to return membership',
      );
    });
  });

  describe('findMembership', () => {
    it('returns membership when found', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 1, orgId: 10, userId: 20 });

      const result = await findMembership(10, 20);

      expect(mockFindFirst).toHaveBeenCalledOnce();
      expect(result).toEqual({ id: 1, orgId: 10, userId: 20 });
    });

    it('returns undefined when not found', async () => {
      mockFindFirst.mockResolvedValueOnce(undefined);

      const result = await findMembership(99, 99);

      expect(result).toBeUndefined();
    });
  });

  describe('getUserOrgs', () => {
    it('returns all org memberships for a user', async () => {
      const memberships = [
        { id: 1, userId: 20, orgId: 10, org: { id: 10, name: 'Org A' } },
      ];
      mockFindMany.mockResolvedValueOnce(memberships);

      const result = await getUserOrgs(20);

      expect(mockFindMany).toHaveBeenCalledOnce();
      expect(result).toEqual(memberships);
    });
  });

  describe('getOrgMembers', () => {
    it('returns all members for an org', async () => {
      const members = [
        { id: 1, userId: 20, orgId: 10, user: { id: 20, name: 'Alice' } },
        { id: 2, userId: 30, orgId: 10, user: { id: 30, name: 'Bob' } },
      ];
      mockFindMany.mockResolvedValueOnce(members);

      const result = await getOrgMembers(10);

      expect(mockFindMany).toHaveBeenCalledOnce();
      expect(result).toEqual(members);
    });
  });
});
