ALTER TABLE "prompt_template_versions" ADD COLUMN "trend_allows_speech" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "kind" text DEFAULT 'base' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "trend_status" text;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "trend_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "trend_platform" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "target_seconds" integer;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "reference_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "trend_allows_speech" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "template_version" integer;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_template_id_prompt_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE set null ON UPDATE no action;