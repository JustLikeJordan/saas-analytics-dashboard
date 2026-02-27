CREATE TYPE "public"."source_type" AS ENUM('csv', 'quickbooks', 'xero', 'stripe', 'plaid');--> statement-breakpoint
CREATE TABLE "data_rows" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "data_rows_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"dataset_id" integer NOT NULL,
	"source_type" "source_type" DEFAULT 'csv' NOT NULL,
	"category" varchar(255) NOT NULL,
	"parent_category" varchar(255),
	"date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"label" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "datasets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"org_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"source_type" "source_type" DEFAULT 'csv' NOT NULL,
	"is_seed_data" boolean DEFAULT false NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_rows" ADD CONSTRAINT "data_rows_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_rows" ADD CONSTRAINT "data_rows_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_data_rows_org_id_date" ON "data_rows" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "idx_data_rows_dataset_id" ON "data_rows" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "idx_data_rows_category" ON "data_rows" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_datasets_org_id" ON "datasets" USING btree ("org_id");