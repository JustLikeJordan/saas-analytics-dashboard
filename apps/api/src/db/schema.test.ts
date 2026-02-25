import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  users,
  orgs,
  userOrgs,
  refreshTokens,
  userRoleEnum,
  usersRelations,
  orgsRelations,
  userOrgsRelations,
  refreshTokensRelations,
} from './schema.js';

describe('schema', () => {
  describe('userRoleEnum', () => {
    it('has owner and member values', () => {
      expect(userRoleEnum.enumValues).toEqual(['owner', 'member']);
    });
  });

  describe('users table', () => {
    it('is named "users"', () => {
      const config = getTableConfig(users);
      expect(config.name).toBe('users');
    });

    it('has all required columns', () => {
      const config = getTableConfig(users);
      const columnNames = config.columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('email');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('google_id');
      expect(columnNames).toContain('avatar_url');
      expect(columnNames).toContain('is_platform_admin');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('has is_platform_admin defaulting to false', () => {
      const config = getTableConfig(users);
      const adminCol = config.columns.find((c) => c.name === 'is_platform_admin');
      expect(adminCol).toBeDefined();
      expect(adminCol!.hasDefault).toBe(true);
    });

    it('has email and google_id unique constraints', () => {
      const config = getTableConfig(users);
      const emailCol = config.columns.find((c) => c.name === 'email');
      const googleIdCol = config.columns.find((c) => c.name === 'google_id');
      expect(emailCol!.isUnique).toBe(true);
      expect(googleIdCol!.isUnique).toBe(true);
    });

    it('has no redundant indexes (unique constraints already create indexes)', () => {
      const config = getTableConfig(users);
      expect(config.indexes).toHaveLength(0);
    });

    it('does not have an org_id column (cross-org by design)', () => {
      const config = getTableConfig(users);
      const columnNames = config.columns.map((c) => c.name);
      expect(columnNames).not.toContain('org_id');
    });
  });

  describe('orgs table', () => {
    it('is named "orgs"', () => {
      const config = getTableConfig(orgs);
      expect(config.name).toBe('orgs');
    });

    it('has all required columns', () => {
      const config = getTableConfig(orgs);
      const columnNames = config.columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('slug');
      expect(columnNames).toContain('created_at');
    });

    it('has unique slug', () => {
      const config = getTableConfig(orgs);
      const slugCol = config.columns.find((c) => c.name === 'slug');
      expect(slugCol!.isUnique).toBe(true);
    });
  });

  describe('user_orgs table', () => {
    it('is named "user_orgs"', () => {
      const config = getTableConfig(userOrgs);
      expect(config.name).toBe('user_orgs');
    });

    it('has all required columns including role enum', () => {
      const config = getTableConfig(userOrgs);
      const columnNames = config.columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('org_id');
      expect(columnNames).toContain('role');
      expect(columnNames).toContain('joined_at');
    });

    it('has foreign keys to users and orgs', () => {
      const config = getTableConfig(userOrgs);
      expect(config.foreignKeys).toHaveLength(2);

      const fkNames = config.foreignKeys.map((fk) => fk.getName());
      expect(fkNames.some((n) => n.includes('user_id'))).toBe(true);
      expect(fkNames.some((n) => n.includes('org_id'))).toBe(true);
    });

    it('has unique index on (user_id, org_id)', () => {
      const config = getTableConfig(userOrgs);
      const uniqueIdx = config.indexes.find((i) => i.config.name === 'user_orgs_unique_user_org');
      expect(uniqueIdx).toBeDefined();
    });

    it('has individual indexes on user_id and org_id', () => {
      const config = getTableConfig(userOrgs);
      const indexNames = config.indexes.map((i) => i.config.name);
      expect(indexNames).toContain('idx_user_orgs_user_id');
      expect(indexNames).toContain('idx_user_orgs_org_id');
    });
  });

  describe('refresh_tokens table', () => {
    it('is named "refresh_tokens"', () => {
      const config = getTableConfig(refreshTokens);
      expect(config.name).toBe('refresh_tokens');
    });

    it('has all required columns', () => {
      const config = getTableConfig(refreshTokens);
      const columnNames = config.columns.map((c) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('token_hash');
      expect(columnNames).toContain('user_id');
      expect(columnNames).toContain('org_id');
      expect(columnNames).toContain('expires_at');
      expect(columnNames).toContain('revoked_at');
      expect(columnNames).toContain('created_at');
    });

    it('has unique token_hash', () => {
      const config = getTableConfig(refreshTokens);
      const tokenHashCol = config.columns.find((c) => c.name === 'token_hash');
      expect(tokenHashCol!.isUnique).toBe(true);
    });

    it('has revoked_at as nullable', () => {
      const config = getTableConfig(refreshTokens);
      const revokedAtCol = config.columns.find((c) => c.name === 'revoked_at');
      expect(revokedAtCol!.notNull).toBe(false);
    });

    it('has foreign keys to users and orgs', () => {
      const config = getTableConfig(refreshTokens);
      expect(config.foreignKeys).toHaveLength(2);
    });

    it('has user_id index but not redundant token_hash index', () => {
      const config = getTableConfig(refreshTokens);
      const indexNames = config.indexes.map((i) => i.config.name);
      expect(indexNames).toContain('idx_refresh_tokens_user_id');
      expect(indexNames).not.toContain('idx_refresh_tokens_token_hash');
    });
  });

  describe('relations', () => {
    it('exports all relation definitions', () => {
      expect(usersRelations).toBeDefined();
      expect(orgsRelations).toBeDefined();
      expect(userOrgsRelations).toBeDefined();
      expect(refreshTokensRelations).toBeDefined();
    });
  });
});
