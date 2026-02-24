import {
  pgTable,
  pgEnum,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Enums ───────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['owner', 'member']);

// ─── Tables ──────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    email: varchar({ length: 255 }).notNull().unique(),
    name: varchar({ length: 255 }).notNull(),
    googleId: varchar('google_id', { length: 255 }).unique(),
    avatarUrl: text('avatar_url'),
    isPlatformAdmin: boolean('is_platform_admin').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_users_email').on(table.email),
    index('idx_users_google_id').on(table.googleId),
  ],
);

export const orgs = pgTable('orgs', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  slug: varchar({ length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userOrgs = pgTable(
  'user_orgs',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: integer('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    role: userRoleEnum('role').default('member').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('user_orgs_unique_user_org').on(table.userId, table.orgId),
    index('idx_user_orgs_user_id').on(table.userId),
    index('idx_user_orgs_org_id').on(table.orgId),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: integer('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_refresh_tokens_token_hash').on(table.tokenHash),
    index('idx_refresh_tokens_user_id').on(table.userId),
  ],
);

// ─── Relations ───────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  userOrgs: many(userOrgs),
  refreshTokens: many(refreshTokens),
}));

export const orgsRelations = relations(orgs, ({ many }) => ({
  userOrgs: many(userOrgs),
  refreshTokens: many(refreshTokens),
}));

export const userOrgsRelations = relations(userOrgs, ({ one }) => ({
  user: one(users, {
    fields: [userOrgs.userId],
    references: [users.id],
  }),
  org: one(orgs, {
    fields: [userOrgs.orgId],
    references: [orgs.id],
  }),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
  org: one(orgs, {
    fields: [refreshTokens.orgId],
    references: [orgs.id],
  }),
}));
