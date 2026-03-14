CREATE TABLE "subscriptions" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "org_id" integer NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "stripe_customer_id" varchar(255),
  "stripe_subscription_id" varchar(255),
  "status" varchar(50) NOT NULL DEFAULT 'inactive',
  "plan" varchar(50) NOT NULL DEFAULT 'free',
  "current_period_end" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "idx_subscriptions_org_id" ON "subscriptions" ("org_id");
