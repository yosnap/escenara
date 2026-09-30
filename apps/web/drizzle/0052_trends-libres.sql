ALTER TABLE "prompt_template_versions" ADD COLUMN "allowed_seconds" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_template_versions" ADD COLUMN "decided_direction" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "allowed_seconds" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN "decided_direction" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
-- Aditiva y sin cambiar comportamiento: cada trend que ya exigía una duración pasa a admitir exactamente esa, en la
-- fila y en todas sus versiones. `target_seconds` se conserva como dato histórico. Liberar la duración es cosa de la
-- migración siguiente, que lo hace con una versión nueva y su motivo.
UPDATE "prompt_templates"
SET "allowed_seconds" = json_build_array("target_seconds")::text
WHERE "kind" = 'trend' AND "target_seconds" IS NOT NULL;--> statement-breakpoint
UPDATE "prompt_template_versions" AS v
SET "allowed_seconds" = t."allowed_seconds"
FROM "prompt_templates" AS t
WHERE v."template_id" = t."id" AND t."kind" = 'trend';
