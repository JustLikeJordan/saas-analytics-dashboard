import {
  pgTable,
  pgEnum,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', ['owner', 'member']);

export const users = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: varchar({ length: 255 }).notNull().unique(),
  name: varchar({ length: 255 }).notNull(),
  googleId: varchar('google_id', { length: 255 }).unique(),
  avatarUrl: text('avatar_url'),
  isPlatformAdmin: boolean('is_platform_admin').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

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

export const orgInvites = pgTable(
  'org_invites',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    orgId: integer('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedBy: integer('used_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_org_invites_org_id').on(table.orgId),
    index('idx_org_invites_token_hash').on(table.tokenHash),
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
  (table) => [index('idx_refresh_tokens_user_id').on(table.userId)],
);

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    orgId: integer('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventName: varchar('event_name', { length: 100 }).notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_analytics_events_org_id').on(table.orgId),
    index('idx_analytics_events_event_name').on(table.eventName),
    index('idx_analytics_events_created_at').on(table.createdAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  userOrgs: many(userOrgs),
  refreshTokens: many(refreshTokens),
  createdInvites: many(orgInvites, { relationName: 'inviteCreator' }),
  analyticsEvents: many(analyticsEvents),
}));

export const orgsRelations = relations(orgs, ({ many }) => ({
  userOrgs: many(userOrgs),
  refreshTokens: many(refreshTokens),
  invites: many(orgInvites),
  analyticsEvents: many(analyticsEvents),
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

export const orgInvitesRelations = relations(orgInvites, ({ one }) => ({
  org: one(orgs, {
    fields: [orgInvites.orgId],
    references: [orgs.id],
  }),
  creator: one(users, {
    fields: [orgInvites.createdBy],
    references: [users.id],
    relationName: 'inviteCreator',
  }),
}));

export const analyticsEventsRelations = relations(analyticsEvents, ({ one }) => ({
  org: one(orgs, {
    fields: [analyticsEvents.orgId],
    references: [orgs.id],
  }),
  user: one(users, {
    fields: [analyticsEvents.userId],
    references: [users.id],
  }),
}));
