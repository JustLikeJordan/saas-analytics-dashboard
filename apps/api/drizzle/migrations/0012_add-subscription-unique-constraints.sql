-- Story 5.2: unique constraints required for ON CONFLICT upsert and webhook lookups
DROP INDEX IF EXISTS "idx_subscriptions_org_id";
CREATE UNIQUE INDEX "idx_subscriptions_org_id_unique" ON "subscriptions" ("org_id");
CREATE UNIQUE INDEX "idx_subscriptions_stripe_sub_id" ON "subscriptions" ("stripe_subscription_id") WHERE "stripe_subscription_id" IS NOT NULL;
