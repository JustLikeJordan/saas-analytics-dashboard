CREATE TABLE "ai_summaries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_summaries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"dataset_id" integer NOT NULL,
	"content" text NOT NULL,
	"transparency_metadata" jsonb DEFAULT '{}' NOT NULL,
	"prompt_version" varchar(20) NOT NULL,
	"is_seed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stale_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_summaries_org_dataset" ON "ai_summaries" USING btree ("org_id","dataset_id");--> statement-breakpoint
ALTER TABLE "ai_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_summaries_org_isolation" ON "ai_summaries"
  USING ("org_id" = current_setting('app.current_org_id')::INTEGER);