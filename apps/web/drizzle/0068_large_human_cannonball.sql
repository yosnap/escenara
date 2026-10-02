CREATE TABLE "admin_user_trash" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"eligible_at" timestamp with time zone NOT NULL,
	"permanent_requested_at" timestamp with time zone,
	"previous_banned" boolean NOT NULL,
	"previous_ban_reason" text,
	"previous_ban_expires" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "admin_user_trash" ADD CONSTRAINT "admin_user_trash_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_trash" ADD CONSTRAINT "admin_user_trash_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE OR REPLACE FUNCTION admin_impedir_sesion_bloqueada() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bloqueado boolean;
BEGIN
  SELECT banned INTO bloqueado FROM users WHERE id = NEW.user_id FOR SHARE;
  IF bloqueado IS TRUE OR EXISTS(SELECT 1 FROM admin_user_trash WHERE user_id = NEW.user_id)
  THEN RAISE EXCEPTION 'Cuenta deshabilitada'; END IF;
  RETURN NEW;
END;
$$;
