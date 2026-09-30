import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { boolean, index, integer, pgEnum, pgTable, real, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { CausaFalloProveedor } from "@/lib/causa-fallo";
import { media } from "./esquema";
import { users } from "./esquema-auth";
import { proveedorCredencial } from "./esquema-boveda";
import { places } from "./esquema-lugares";
import { characters, characterVersions } from "./esquema-personajes";
import { promptTemplates, promptTemplateVersions } from "./esquema-presets";
import { products } from "./esquema-productos";
import { scenes } from "./esquema-proyectos";
import { jsonb } from "./jsonb";

/**
 * Trabajos de generación (`GenerationJob` completo desde 0.12.0: cola persistente, toma por worker,
 * reintentos y reserva de presupuesto) y registro versionado de precios por modelo (que amplía 0.11.0).
 *
 * El proveedor comparte enumeración con las credenciales: un trabajo se paga siempre con la clave del
 * usuario para ese mismo proveedor.
 */

/**
 * `voz` se añade en la 0.21.0: la pista de voz de una escena **también cuesta dinero** y su llamada al proveedor
 * es asíncrona, igual que un vídeo. Pasa por esta misma tabla a propósito, en lugar de por un camino paralelo:
 * así hereda sin repetir una sola regla la cola persistente, la reserva atómica, la idempotencia por
 * confirmación, el corte de «nada se reenvía tras un fallo sin respuesta» y el cierre del gasto.
 */
export const tipoTrabajo = pgEnum("generation_job_kind", ["fotograma", "animacion", "voz"]);

/** Con qué referencia de identidad se generó un trabajo (0.25.0). Ver `identity_reference_kind`. */
export const referenciaIdentidad = pgEnum("generation_identity_reference", ["vistas", "hoja_3x3"]);

/**
 * Estado propio, nunca el del proveedor tal cual: un estado que no se reconoce es `desconocido`.
 *
 * Los tres últimos los añade 0.12.0: `en_cola` es el estado con el que nace un trabajo encolado (antes se
 * enviaba en línea desde la petición del navegador), `esperando_limite` es un trabajo cuyo coste no se
 * puede acotar y que no se envía hasta que el usuario fija un límite, y `cancelado` es el que el usuario
 * retiró antes de que saliera hacia el proveedor.
 */
export const estadoTrabajo = pgEnum("generation_job_state", [
  "preparando",
  "enviado",
  "en_curso",
  "listo",
  "fallido",
  "desconocido",
  "en_cola",
  "esperando_limite",
  "cancelado",
  "enviando",
]);

/**
 * Motivo normalizado por el que un trabajo no ha salido adelante. Es lo que decide si se puede reintentar:
 * solo `interno` (falló nuestra preparación, antes de hablar con el proveedor) y `limite` (el proveedor
 * rechazó la petición por ritmo, así que no creó ninguna tarea) son fallos **sin coste**. `temporal` no lo
 * es: no se sabe si la tarea llegó a existir, y reenviarla podría cobrarse dos veces.
 */
export const motivoFalloTrabajo = pgEnum("generation_job_failure", [
  "temporal",
  "credencial",
  "saldo",
  "contenido",
  "limite",
  "respuesta",
  "interno",
  "sin_acotar",
  "cancelado",
  // 0.13.0: el personaje con el que se pidió el trabajo ya no puede usarse (consentimiento revocado o
  // rechazado, o referencias por debajo del mínimo). El trabajo se cierra **sin coste**, porque se detecta
  // antes de tocar al proveedor.
  "consentimiento",
]);

/**
 * Etapa real por la que va un trabajo (0.19.0), para el progreso por etapas de la rejilla de producción.
 *
 * **No es un porcentaje ni una fase calculada por tiempo**: cada valor se apunta cuando el hecho ocurre de
 * verdad (el worker lo toma, la tarea existe en el proveedor, el proveedor informa de que genera, se está
 * descargando el archivo, está guardado). Existe porque `descargando` es la única etapa que el estado propio no
 * distingue: durante la descarga el trabajo sigue en `en_curso`.
 */
export const etapaTrabajo = pgEnum("generation_job_stage", [
  "preparando",
  "enviado",
  "en_curso",
  "descargando",
  "listo",
]);

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: tipoTrabajo("kind").notNull(),
    provider: proveedorCredencial("provider").notNull(),
    model: text("model").notNull(),
    /** Identificador de la tarea en el proveedor; `null` mientras el trabajo se está preparando. */
    taskId: text("task_id"),
    /**
     * Clave que genera el navegador al confirmar el gasto. Si la misma confirmación llega dos veces (un
     * doble clic o un reintento tras un error de red), se devuelve el trabajo que ya existe en lugar de
     * crear otra tarea en el proveedor: es lo que evita pagar dos veces lo mismo.
     */
    idempotencyKey: text("idempotency_key"),
    state: estadoTrabajo("state").notNull().default("preparando"),
    /**
     * Última etapa por la que pasó (0.19.0); `null` mientras el trabajo espera turno. El estado manda sobre esto:
     * quien decide el dinero es `state`, y la etapa solo sirve para contar honestamente por dónde va.
     */
    stage: etapaTrabajo("stage"),
    /** Estado crudo del proveedor (`waiting`, `queuing`, `generating`, `success`, `fail`). */
    providerState: text("provider_state"),
    prompt: text("prompt").notNull(),
    /** Entrada enviada al proveedor (modelo y parámetros). Nunca contiene la credencial. */
    input: jsonb<Record<string, unknown>>("input").notNull(),
    sourceMediaId: uuid("source_media_id").references(() => media.id, { onDelete: "set null" }),
    /**
     * Personaje con el que se pidió el trabajo, si se pidió con uno (0.13.0). Es lo que permite borrar los
     * **derivados** al borrar el personaje: sin esta columna, un medio generado con la cara de alguien
     * sobreviviría a la revocación de su consentimiento. `set null` no sirve aquí, pero tampoco hace falta
     * una cascada: el borrado del personaje borra sus derivados y sus trabajos en la misma transacción.
     */
    characterId: uuid("character_id").references(() => characters.id, { onDelete: "set null" }),
    /**
     * Versión de la ficha con la que se pidió el trabajo (0.15.0). Es lo que hace auditable el prompt: la
     * ficha se añade al prompt como contexto, así que sin esta columna no se podría saber **qué** apariencia
     * se envió. `set null` por simetría con el personaje, pero en la práctica no se dispara: las versiones
     * solo desaparecen al borrar el personaje, que borra también sus trabajos.
     */
    characterVersionId: uuid("character_version_id").references(() => characterVersions.id, { onDelete: "set null" }),
    /**
     * Plantilla de prompt con la que se compuso el trabajo (0.16.0), y la **fila de la versión** que se citó.
     * La versión es lo que hace auditable el prompt: editar la plantilla crea otra versión y lo ya generado
     * sigue apuntando a la que usó, igual que la ficha del personaje. `set null` en las dos: una plantilla se
     * puede borrar y el trabajo, con su prompt final guardado, sigue siendo un hecho histórico.
     */
    promptTemplateId: uuid("prompt_template_id").references(() => promptTemplates.id, { onDelete: "set null" }),
    promptTemplateVersionId: uuid("prompt_template_version_id").references(() => promptTemplateVersions.id, {
      onDelete: "set null",
    }),
    /** `true` si el usuario editó a mano el texto que compuso la plantilla antes de confirmar. */
    promptEdited: boolean("prompt_edited").notNull().default(false),
    /**
     * Escena del proyecto de la que salió este trabajo (0.17.0). `null` en los trabajos del camino rápido de
     * «Crear», que sigue existiendo. `set null` y no cascada: borrar una escena no puede hacer desaparecer el
     * hecho histórico de un trabajo que ya se pagó.
     */
    sceneId: uuid("scene_id").references(() => scenes.id, { onDelete: "set null" }),
    /**
     * Proyecto de la escena **al encolar**, sin clave ajena a propósito: sobrevive a que la escena desaparezca. Es lo
     * que deja al worker reconocer un trabajo de un proyecto borrado (escena a nulo) y cerrarlo sin cobro, en lugar de
     * confundirlo con uno de «Crear». Nulo en «Crear» y en los clips convertidos, que siguen siendo de «Crear».
     */
    projectId: uuid("project_id"),
    /**
     * **Turno del clip dentro del intercambio** (0.28.0), desde 1. `null` en todo lo que no es un reparto de dos
     * personajes, que es todo lo anterior a esta versión.
     *
     * Es lo único que un podcast deja escrito para el montaje (0.32.0): dos clips de la misma escena, cada uno con
     * su personaje (`character_id`) y su sitio en la conversación. Sin esta columna, los dos clips serían dos
     * filas indistinguibles y alternar los planos habría que adivinarlo por la fecha de creación.
     */
    castClipOrder: integer("cast_clip_order"),
    /**
     * **Producto con el que se pidió el trabajo** (0.26.0), si se pidió con uno. Es lo que permite borrar los
     * derivados al borrar el producto: sin esta columna, un fotograma con la etiqueta de un producto retirado
     * seguiría en la biblioteca sin forma de encontrarlo.
     *
     * `set null` y **no** cascada, a diferencia del personaje: el trabajo puede llevar además la cara de un
     * personaje, y borrarlo por el producto se llevaría por delante el historial y los apuntes de gasto de ese
     * personaje. Lo que se borra al borrar el producto es el **medio resultante**; la fila del trabajo se
     * queda, con su prompt y su coste, que son hechos históricos.
     */
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    /** Clave de la acción de producto que se pidió. Se conserva aunque el producto desaparezca. */
    productAction: text("product_action").notNull().default(""),
    /**
     * Paso del **producto digital** con el que se pidió este trabajo (0.26.0): `pantalla_negra` para el
     * fotograma del dispositivo apagado e `insertar_captura` para la edición que mete la captura dentro.
     * Vacío en todo lo demás, que es todo lo que no es un fotograma de un producto digital.
     */
    digitalStep: text("digital_step").notNull().default(""),
    /**
     * Casilla **«tengo derecho a usar esta marca»** (0.26.0), con su fecha. Obligatoria en cuanto el envío
     * lleva producto, y `null` cuando no lleva ninguno: es una declaración del usuario sobre una marca, así
     * que hay que poder demostrar cuándo la hizo, igual que con la de la imagen.
     */
    brandRightsAt: timestamp("brand_rights_at", { withTimezone: true }),
    /**
     * **Lugar con el que se pidió el trabajo** y la versión que se usó. `set null` al borrar el lugar, como el
     * producto: lo generado se queda. La versión se conserva aunque el lugar desaparezca: es lo que se envió.
     */
    placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" }),
    placeVersion: integer("place_version"),
    resultMediaId: uuid("result_media_id").references(() => media.id, { onDelete: "set null" }),
    estimatedCredits: integer("estimated_credits").notNull(),
    /** Créditos que informa el proveedor; si no llegan, se conserva la estimación marcada como tal. */
    consumedCredits: integer("consumed_credits"),
    /** Mensaje apto para el usuario (nunca texto crudo del proveedor). */
    errorMessage: text("error_message"),
    /** Casilla obligatoria de derecho de uso de la imagen, tal como se confirmó al generar. */
    rightsConfirmedAt: timestamp("rights_confirmed_at", { withTimezone: true }),
    /**
     * Revisión de las referencias antes de enviarlas (ADR-0009): cuándo confirmó quien generó que en las
     * fotos del personaje no aparece ninguna otra persona ni ningún menor. Se guarda con su fecha, igual que
     * la confirmación de derechos, porque es una declaración y hay que poder demostrar cuándo se hizo.
     * `null` en los trabajos sin personaje.
     */
    referencesReviewedAt: timestamp("references_reviewed_at", { withTimezone: true }),
    /** Animación → fotograma del que salió. */
    parentJobId: uuid("parent_job_id").references((): AnyPgColumn => generationJobs.id, { onDelete: "set null" }),
    /** Motivo normalizado del fallo; decide si el trabajo se puede reintentar sin riesgo de doble cobro. */
    failureReason: motivoFalloTrabajo("failure_reason"),
    /**
     * Causa concreta cuando el proveedor no completa una tarea que aceptó (`CAUSAS_FALLO_PROVEEDOR`): una clave
     * propia de lista cerrada, **nunca** su texto. `null` en los trabajos anteriores y en los que no fallan así;
     * esos se muestran como siempre. Texto y no enum para poder ampliar la lista sin otra migración: se valida al
     * leerla.
     */
    failureCause: text("failure_cause").$type<CausaFalloProveedor>(),
    /** Más alta = antes en la cola. Igualdad de prioridad se resuelve por antigüedad. */
    priority: integer("priority").notNull().default(0),
    /** Veces que un worker ha tomado este trabajo para enviarlo. */
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    /** No se toma antes de esta fecha: es la espera entre reintentos. */
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    /** Worker que lo tiene tomado, y hasta cuándo vale esa toma (un worker caído lo suelta al caducar). */
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    /**
     * Apunte de reserva del presupuesto que respalda este trabajo (`usage_ledger`). Sin restricción de
     * clave ajena a propósito: los apuntes no se borran nunca y la tabla se define aparte para no montar
     * una referencia circular entre las dos.
     */
    reservationId: uuid("reservation_id"),
    /**
     * Tope de créditos que el usuario autoriza para este trabajo cuando el coste no se puede acotar
     * (PRD §6). Sin él, un trabajo `esperando_limite` no se envía.
     */
    creditLimit: integer("credit_limit"),
    /**
     * Créditos que el proveedor ha cobrado **por encima** del tope que autorizó el usuario. No se puede
     * impedir (el precio lo decide el proveedor), así que se apunta el gasto real y se avisa: el usuario lo ve
     * en su trabajo y quien administra, en `/admin/trabajos`.
     */
    excessCredits: integer("excess_credits"),
    /**
     * Huella del token de callback de este trabajo, `sha256(secreto:token)`. El token viaja solo en la URL que
     * se le da al proveedor y nunca se guarda: sin el secreto de la bóveda, esta huella no sirve de nada.
     * `null` si el trabajo se envió sin callbacks.
     */
    callbackTokenHash: text("callback_token_hash"),
    /**
     * Con qué referencia de identidad se generó esto (0.25.0): las **vistas sueltas** del personaje o su **hoja
     * 3×3**. Es el dato que permite comparar las dos y decidir con medidas, en vez de con impresiones, si la
     * hoja merece ser la referencia por defecto.
     *
     * `vistas` por defecto porque es lo que hacían todos los trabajos anteriores a esta versión.
     */
    identityReferenceKind: referenciaIdentidad("identity_reference_kind").notNull().default("vistas"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    polledAt: timestamp("polled_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    // Una tarea del proveedor es un solo trabajo: es lo que hace idempotente la reconciliación.
    unique("generation_jobs_proveedor_tarea_uq").on(t.provider, t.taskId),
    // Una confirmación es un solo trabajo: es lo que hace idempotente el envío.
    unique("generation_jobs_usuario_idempotencia_uq").on(t.userId, t.idempotencyKey),
    index("generation_jobs_usuario_idx").on(t.userId, t.createdAt),
    index("generation_jobs_estado_idx").on(t.state),
    // Índice de la toma de la cola: el worker busca `en_cola` disponible y ordena por prioridad y edad.
    index("generation_jobs_cola_idx").on(t.state, t.availableAt, t.priority),
    index("generation_jobs_toma_idx").on(t.lockedUntil),
    // Índice del borrado de derivados: al borrar un personaje hay que localizar todos sus trabajos.
    index("generation_jobs_personaje_idx").on(t.characterId),
    // Índice del proyecto: la página de un proyecto busca los trabajos de sus escenas.
    index("generation_jobs_escena_idx").on(t.sceneId),
    // Las versiones de una escena se leen por escena y de la más reciente a la más antigua (0.41.0).
    index("generation_jobs_escena_fecha_idx").on(t.sceneId, t.createdAt),
    index("generation_jobs_producto_idx").on(t.productId),
    index("generation_jobs_lugar_idx").on(t.placeId),
    // Los ejemplos de plantilla comprueban de dónde sale cada medio en cada lectura: por resultado y por punto de partida.
    index("generation_jobs_resultado_idx").on(t.resultMediaId),
    index("generation_jobs_origen_idx").on(t.sourceMediaId),
  ],
);

/**
 * Precio de un modelo en la unidad que factura el proveedor, con su fuente y la fecha en que se
 * comprobó: los precios cambian y una estimación sin fecha no vale nada.
 *
 * `version` sube en cada edición del precio: el sello que viaja con una estimación la incluye, así que
 * cambiar el precio caduca las estimaciones anteriores sin tocar los créditos ya consumidos.
 */
export const modelPrices = pgTable(
  "model_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: proveedorCredencial("provider").notNull(),
    model: text("model").notNull(),
    /** Qué se paga: «imagen», «vídeo de 4 s»… */
    unit: text("unit").notNull(),
    credits: real("credits").notNull(),
    source: text("source").notNull(),
    /**
     * `true` cuando el precio es la **tarifa publicada** por el proveedor y no una medición de esta instalación
     * (0.23.0). Es un hecho, no una frase dentro de `source`: de él depende que la pantalla diga «publicado por
     * el proveedor, no medido aquí» y que una diferencia con lo cobrado se registre como desviación.
     */
    published: boolean("published").notNull().default(false),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("model_prices_proveedor_modelo_unidad_uq").on(t.provider, t.model, t.unit)],
);

export type FilaTrabajo = typeof generationJobs.$inferSelect;
export type FilaPrecio = typeof modelPrices.$inferSelect;
