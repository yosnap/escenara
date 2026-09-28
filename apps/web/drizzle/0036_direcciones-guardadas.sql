CREATE TABLE "saved_directions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"direction" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_directions_dueno_nombre_uq" UNIQUE("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "saved_directions" ADD CONSTRAINT "saved_directions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_directions_dueno_idx" ON "saved_directions" USING btree ("user_id","updated_at");