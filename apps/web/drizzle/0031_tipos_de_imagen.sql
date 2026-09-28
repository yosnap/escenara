-- El tipo se vuelve a crear entero en lugar de usar `ALTER TYPE ... ADD VALUE`: PostgreSQL no deja usar un
-- valor de enumeración recién añadido dentro de la misma transacción, y las migraciones de esta base se
-- aplican todas juntas en una. Recreándolo, la migración siguiente ya puede escribir 'text_to_image'.
ALTER TYPE "public"."model_capability" RENAME TO "model_capability_previo";--> statement-breakpoint
CREATE TYPE "public"."model_capability" AS ENUM('image_edit', 'text_to_image', 'image_to_video', 'text_to_video', 'text_generation', 'tts', 'speech_to_text', 'multimodal_review');--> statement-breakpoint
ALTER TABLE "model_capabilities" ALTER COLUMN "capability" SET DATA TYPE "public"."model_capability" USING "capability"::text::"public"."model_capability";--> statement-breakpoint
ALTER TABLE "prompt_templates" ALTER COLUMN "capability" SET DATA TYPE "public"."model_capability" USING "capability"::text::"public"."model_capability";--> statement-breakpoint
DROP TYPE "public"."model_capability_previo";
