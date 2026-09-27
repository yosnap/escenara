ALTER TABLE "character_references" ADD COLUMN "view_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "character_references" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "character_references" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "character_references" ADD COLUMN "sharpness" real;--> statement-breakpoint
ALTER TABLE "character_references" ADD COLUMN "brightness" real;--> statement-breakpoint
ALTER TABLE "character_references" ADD COLUMN "face_ratio" real;--> statement-breakpoint
ALTER TABLE "character_references" ADD COLUMN "phash" text;--> statement-breakpoint
ALTER TABLE "character_references" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
CREATE INDEX "character_references_huella_idx" ON "character_references" USING btree ("character_id","phash");