CREATE TABLE "shares" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shares_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"dataset_id" integer NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"insight_snapshot" jsonb NOT NULL,
	"chart_snapshot_url" varchar(2048),
	"created_by" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_shares_org_id" ON "shares" USING btree ("org_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_shares_token_hash" ON "shares" USING btree ("token_hash");
