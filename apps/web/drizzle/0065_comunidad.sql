-- Comunidad: publicaciones de contenido sintético (copias con su declaración expresa y su moderación), sus medios
-- copiados a claves propias del almacenamiento, retos, usos de trends y plantillas compartidos (atribución) y logros
-- por hitos reales (uno por persona y logro).
--
-- Aditiva e idempotente: solo crea tipos, tablas, índices y claves ajenas; no cambia ni borra ninguna fila. Volver a
-- aplicarla no hace nada. Haz copia de la base antes (`bun run db:backup`) y migra con el worker parado.
DO $$ BEGIN
  CREATE TYPE "public"."community_post_state" AS ENUM('pendiente', 'aprobada', 'rechazada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."community_post_kind" AS ENUM('personaje', 'clip', 'trend', 'plantilla');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"template_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_challenges_periodo" CHECK ("community_challenges"."ends_at" > "community_challenges"."starts_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_post_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" real,
	"alt_es" text DEFAULT '' NOT NULL,
	CONSTRAINT "community_post_media_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"kind" "community_post_kind" NOT NULL,
	"state" "community_post_state" DEFAULT 'pendiente' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"signature" text NOT NULL,
	"source_character_id" uuid,
	"source_media_id" uuid,
	"template_id" uuid,
	"challenge_id" uuid,
	"consent_text" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"rejection_reason" text DEFAULT '' NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_uses" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_uses_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_achievements" (
	"user_id" uuid NOT NULL,
	"achievement" text NOT NULL,
	"achieved_at" timestamp with time zone NOT NULL,
	"celebrated_at" timestamp with time zone,
	CONSTRAINT "user_achievements_user_id_achievement_pk" PRIMARY KEY("user_id","achievement")
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_challenges" ADD CONSTRAINT "community_challenges_template_id_prompt_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_challenges" ADD CONSTRAINT "community_challenges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_post_media" ADD CONSTRAINT "community_post_media_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_source_character_id_characters_id_fk" FOREIGN KEY ("source_character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_source_media_id_media_id_fk" FOREIGN KEY ("source_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_template_id_prompt_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_challenge_id_community_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."community_challenges"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_uses" ADD CONSTRAINT "community_uses_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "community_uses" ADD CONSTRAINT "community_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_challenges_periodo_idx" ON "community_challenges" USING btree ("starts_at","ends_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_post_media_posicion_uq" ON "community_post_media" USING btree ("post_id","position");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_posts_personaje_uq" ON "community_posts" USING btree ("source_character_id") WHERE "community_posts"."source_character_id" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_posts_medio_uq" ON "community_posts" USING btree ("source_media_id") WHERE "community_posts"."source_media_id" is not null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_posts_galeria_idx" ON "community_posts" USING btree ("state","approved_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_posts_autor_idx" ON "community_posts" USING btree ("author_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_posts_reto_idx" ON "community_posts" USING btree ("challenge_id");
