ALTER TABLE "scenes" ADD COLUMN "extra_instructions" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "expert_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "expert_description" text DEFAULT '' NOT NULL;