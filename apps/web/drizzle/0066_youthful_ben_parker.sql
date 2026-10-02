CREATE TABLE "admin_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"target_id" uuid,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"result" text DEFAULT 'completado' NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_mail_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"actor_id" uuid,
	"operation_id" uuid NOT NULL,
	"state" text DEFAULT 'solicitado' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "admin_mail_state_valid" CHECK ("admin_mail_events"."state" in ('solicitado', 'aceptado', 'fallido', 'incierto'))
);
--> statement-breakpoint
CREATE TABLE "user_policies" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"budget_mode" text DEFAULT 'heredar' NOT NULL,
	"budget_value" real,
	"job_mode" text DEFAULT 'heredar' NOT NULL,
	"job_value" real,
	CONSTRAINT "user_policies_budget_valid" CHECK (("user_policies"."budget_mode" in ('heredar', 'sin-tope') and "user_policies"."budget_value" is null) or ("user_policies"."budget_mode" = 'limite' and "user_policies"."budget_value" > 0 and "user_policies"."budget_value" < 'Infinity'::real)),
	CONSTRAINT "user_policies_job_valid" CHECK (("user_policies"."job_mode" in ('heredar', 'sin-tope') and "user_policies"."job_value" is null) or ("user_policies"."job_mode" = 'limite' and "user_policies"."job_value" > 0 and "user_policies"."job_value" < 'Infinity'::real))
);
--> statement-breakpoint
ALTER TABLE "admin_events" ADD CONSTRAINT "admin_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_events" ADD CONSTRAINT "admin_events_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_mail_events" ADD CONSTRAINT "admin_mail_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_mail_events" ADD CONSTRAINT "admin_mail_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_policies" ADD CONSTRAINT "user_policies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_events_operation_uq" ON "admin_events" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "admin_events_target_date_idx" ON "admin_events" USING btree ("target_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_events_actor_date_idx" ON "admin_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_mail_operation_uq" ON "admin_mail_events" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "admin_mail_user_date_idx" ON "admin_mail_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_mail_actor_date_idx" ON "admin_mail_events" USING btree ("actor_id","created_at");