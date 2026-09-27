CREATE TABLE "character_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"character_version_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text DEFAULT '' NOT NULL,
	"invalidated_by_version_id" uuid
);
--> statement-breakpoint
CREATE TABLE "character_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"sheet" jsonb NOT NULL,
	"reference_media_ids" jsonb NOT NULL,
	"sheet_media_id" uuid,
	"change_reason" text DEFAULT '' NOT NULL,
	"changed_fields" jsonb NOT NULL,
	"invalidated_approvals" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_versions_personaje_numero_uq" UNIQUE("character_id","number")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "traits" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "style" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "wardrobe" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "personality" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "voice" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "character_version_id" uuid;--> statement-breakpoint
ALTER TABLE "character_approvals" ADD CONSTRAINT "character_approvals_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_approvals" ADD CONSTRAINT "character_approvals_character_version_id_character_versions_id_fk" FOREIGN KEY ("character_version_id") REFERENCES "public"."character_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_approvals" ADD CONSTRAINT "character_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_approvals" ADD CONSTRAINT "character_approvals_invalidated_by_version_id_character_versions_id_fk" FOREIGN KEY ("invalidated_by_version_id") REFERENCES "public"."character_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_versions" ADD CONSTRAINT "character_versions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_versions" ADD CONSTRAINT "character_versions_sheet_media_id_media_id_fk" FOREIGN KEY ("sheet_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_versions" ADD CONSTRAINT "character_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_approvals_personaje_idx" ON "character_approvals" USING btree ("character_id","approved_at");--> statement-breakpoint
CREATE INDEX "character_approvals_version_idx" ON "character_approvals" USING btree ("character_version_id");--> statement-breakpoint
CREATE INDEX "character_versions_personaje_idx" ON "character_versions" USING btree ("character_id","number");--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_character_version_id_character_versions_id_fk" FOREIGN KEY ("character_version_id") REFERENCES "public"."character_versions"("id") ON DELETE set null ON UPDATE no action;