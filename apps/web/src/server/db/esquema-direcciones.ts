import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { DireccionElegidaConAcento } from "@/lib/direccion";
import { users } from "./esquema-auth";
import { jsonb } from "./jsonb";

/**
 * **Direcciones guardadas** (0.25.2): una forma de dirigir un clip, con nombre, para volver a usarla sin
 * reconstruirla botón a botón.
 *
 * Reglas duras que sostiene este esquema:
 *
 * - **es de su dueño y de nadie más**. No hay `owner_id` nulo ni copias de la instalación: compartir es otra
 *   cosa y no está en esta versión. Todas las lecturas filtran por `user_id`, y una de otro responde 404;
 * - lo guardado son **claves del catálogo y texto limpio**, nunca un fragmento de prompt en inglés
 *   (ADR-0022). Es exactamente lo que el navegador ya manda al confirmar un clip, y entra por la misma puerta
 *   (`direccion/eleccion.ts › leerDireccionElegida`);
 * - el JSON se valida **en la aplicación**, con la misma función que valida el borde, igual que los valores de
 *   un preset o los parámetros del catálogo. Una clave que quien administra desactive después no rompe nada:
 *   al aplicarla se ignora y se avisa.
 */
export const savedDirections = pgTable(
  "saved_directions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** El nombre que le puso su dueño, en castellano. Es lo que lee en la lista. */
    name: text("name").notNull(),
    /** La dirección elegida entera (clip y 6C del fotograma), validada por el borde antes de guardarse. */
    direction: jsonb<DireccionElegidaConAcento>("direction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Dos direcciones del mismo usuario no comparten nombre: una lista con dos «Primer plano» no sirve.
    unique("saved_directions_dueno_nombre_uq").on(t.userId, t.name),
    index("saved_directions_dueno_idx").on(t.userId, t.updatedAt),
  ],
);

export type FilaDireccionGuardada = typeof savedDirections.$inferSelect;
