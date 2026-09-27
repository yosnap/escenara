import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./esquema-auth";
import { scenes } from "./esquema-proyectos";
import { jsonb } from "./jsonb";

/**
 * Revisión de continuidad de las escenas producidas (RF07).
 *
 * Una fila por **revisión hecha**, no por escena: la comprobación automática de un clip, la decisión de la
 * persona que lo miró y, si se pidió, la opinión del modelo. Guardarlas todas es lo que permite responder «por
 * qué se dio por buena esta escena» meses después, y lo que hace que una regeneración pueda invalidar lo
 * anterior sin borrarlo.
 *
 * **No hay ninguna columna con «el proyecto está bloqueado»**: el bloqueo de la exportación se deriva de los
 * críticos abiertos, igual que lo comprometido del presupuesto se deriva de los apuntes. Una bandera guardada se
 * desincronizaría en cuanto alguien regenerase una escena.
 */

export const tipoRevision = pgEnum("review_kind", ["automatica", "humana", "multimodal"]);

export const severidadRevision = pgEnum("review_severity", ["informativa", "aviso", "critica"]);

export const veredictoRevision = pgEnum("review_verdict", ["acepta", "rechaza", "pendiente"]);

/**
 * Estado del **gasto** de la revisión, no de su veredicto:
 *
 * - `cerrado`: no hay nada que cerrar. Es el de la comprobación automática y el de la revisión humana, que no
 *   cuestan nada, y el de una multimodal cuyo gasto ya se ha apuntado del todo;
 * - `reservado`: se apartó su coste y todavía no se ha cerrado. Si el proceso muere entre reservar y cerrar, esta
 *   fila es lo único que permite saber que hay presupuesto apartado que nadie va a soltar: el barrido la cierra
 *   conservando la estimación como consumo (ADR-0016) y, mientras, cuenta como **retenido** en el depósito.
 */
export const estadoRevision = pgEnum("review_state", ["reservado", "cerrado"]);

/**
 * Una comprobación tal como se guardó. Es exactamente lo que se le mostró al usuario, con el valor medido y el
 * pedido: sin el valor, «falla la duración» no permite decidir nada.
 */
export interface ComprobacionGuardada {
  clave: string;
  resultado: "pasa" | "falla" | "no_medible";
  severidad: "informativa" | "aviso" | "critica";
  medido: string;
  esperado: string;
  motivo: string;
}

export const reviewResults = pgTable(
  "review_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    /**
     * Trabajo del que salió el clip revisado. **Sin clave ajena**, igual que `scenes.clip_job_id` y que
     * `usage_ledger.assistant_run_id`: `generation_jobs` ya referencia a `scenes`, y una referencia de vuelta
     * cerraría un ciclo entre los dos módulos del esquema. Si el trabajo desapareciera, lo que queda es una
     * revisión que cita un trabajo que no está, y la pantalla la trata como historial.
     */
    jobId: uuid("job_id"),
    /**
     * Medio del clip que se revisó. Es lo que permite comprobar, al guardar, que la escena **sigue teniendo ese
     * clip**: entre mirar el vídeo y pulsar «Aceptar» puede haberse regenerado, y un visto bueno que se guardara
     * después estaría aprobando algo que nadie ha visto.
     *
     * Sin clave ajena: un medio borrado de la biblioteca no debe borrar la revisión que lo juzgó ni ponerla a
     * nulo, porque entonces se perdería **a qué** clip se refería.
     */
    clipMediaId: uuid("clip_media_id"),
    kind: tipoRevision("kind").notNull(),
    severity: severidadRevision("severity").notNull(),
    verdict: veredictoRevision("verdict").notNull(),
    /** Comprobaciones con su resultado y su valor medido. Lista vacía en una revisión humana sin medidas. */
    checks: jsonb<ComprobacionGuardada[]>("checks").notNull(),
    /**
     * Quién revisó; `null` en la automática, que no la hace nadie. El dueño del proyecto es el único que revisa
     * su contenido (decisión provisional del propietario, 2026-09-27): quien administra no revisa lo ajeno salvo
     * moderación.
     */
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    /** Notas del revisor o resumen que devolvió el modelo. Nunca texto crudo sin limpiar. */
    notes: text("notes").notNull().default(""),
    /** Créditos que costó, si costó algo; `null` en las que no cuestan nada. */
    credits: real("credits"),
    /** Versión del conjunto de reglas con la que se comprobó (RF13). */
    rulesVersion: text("rules_version").notNull(),
    /**
     * Cuándo dejó de valer y por qué. Una regeneración o un cambio de versión del personaje invalidan la
     * revisión anterior de esa escena: lo revisado ya no es lo que hay. **No se borra**: se marca, porque es lo
     * que explica qué se dio por bueno y cuándo dejó de valer.
     */
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    invalidationReason: text("invalidation_reason").notNull().default(""),
    /**
     * Estado del gasto. `cerrado` por defecto porque la comprobación automática y la revisión humana **no cuestan
     * nada**: no hay nada que cerrar en ellas. Solo la multimodal nace `reservado`.
     */
    state: estadoRevision("state").notNull().default("cerrado"),
    /**
     * Clave con la que el navegador firma una revisión **de pago**; `null` en las que no cuestan nada, que no
     * necesitan idempotencia porque repetirlas no cobra.
     *
     * Es lo que impide que un doble clic o un reintento tras un error de red paguen dos veces la misma opinión:
     * con la clave repetida se devuelve la revisión que ya existe y **no se llama al proveedor**. Misma mecánica
     * que `assistant_runs.idempotency_key` y que el corte de idempotencia de la generación.
     */
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_results_escena_idx").on(t.sceneId, t.createdAt),
    // Índice de la invalidación y del recuento de críticos abiertos: se busca por escena y por vigencia.
    index("review_results_vigencia_idx").on(t.sceneId, t.invalidatedAt),
    /**
     * Una clave de confirmación, una revisión de pago. Parcial porque solo las multimodales la traen: sin el
     * filtro, todas las automáticas (con clave y revisor nulos) chocarían entre sí en unas bases y en otras no,
     * según cómo trate cada motor los nulos en un índice único.
     *
     * Las **dos** columnas tienen que ser no nulas para que el índice signifique algo: con `reviewer_id` nulo,
     * PostgreSQL considera distintas dos filas con la misma clave, así que el corte de idempotencia no cortaría
     * nada. Hoy no puede pasar (una revisión de pago siempre tiene revisor), y por eso se escribe aquí en lugar de
     * confiar en que siga siendo verdad.
     */
    uniqueIndex("review_results_revisor_idempotencia_uq")
      .on(t.reviewerId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null and ${t.reviewerId} is not null`),
    // Barrido de las revisiones que se quedaron con su coste apartado: se busca por estado y por antigüedad.
    index("review_results_reservadas_idx").on(t.state, t.createdAt),
  ],
);

export type FilaRevision = typeof reviewResults.$inferSelect;
