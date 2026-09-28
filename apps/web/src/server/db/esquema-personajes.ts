import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { media } from "./esquema";
import { users } from "./esquema-auth";
import { jsonb } from "./jsonb";

/**
 * Personajes con sus fotos de referencia y su registro de consentimiento (RF02 y RF10).
 *
 * Reglas duras que sostiene este esquema:
 *
 * - un personaje pertenece a un usuario y nada más (`owner_id`, borrado en cascada);
 * - el consentimiento es una fila propia con fecha, quién lo registró, quién lo revisó y su revocación:
 *   **nunca** una casilla en la fila del personaje, porque hay que poder demostrar qué se declaró y cuándo;
 * - un medio de la biblioteca puede ser referencia de varios personajes (`character_references` es una
 *   relación, no una copia), así que borrar un personaje no borra las fotos del usuario;
 * - lo que sí desaparece con el personaje son sus **derivados**: los medios generados con él, que se
 *   localizan por `generation_jobs.character_id`.
 */

export const tipoPersonaje = pgEnum("character_kind", ["persona", "animal"]);

export const estadoPersonaje = pgEnum("character_state", ["borrador", "en_revision", "listo", "bloqueado"]);

/**
 * Estado de la hoja de identidad 3×3 (0.25.0). `candidata` es el único valor con el que puede nacer: la hoja se
 * mide antes de ascender.
 */
export const estadoHojaIdentidad = pgEnum("character_identity_sheet_status", [
  "candidata",
  "por_defecto",
  "descartada",
]);

export const titularConsentimiento = pgEnum("consent_holder", ["yo", "tercero", "animal_propio", "inventado"]);

export const alcanceUso = pgEnum("consent_scope", ["personal", "comercial"]);

export const origenReferencia = pgEnum("reference_origin", ["foto_original", "vista_generada"]);

/**
 * Veredicto de la comprobación de identidad de una referencia (0.24.0). `sin_comprobar` es el estado de todo lo
 * anterior a esta versión y el de todo lo que no se compara: **no** significa «sospechosa».
 */
export const veredictoIdentidad = pgEnum("reference_identity_verdict", ["sin_comprobar", "pasa", "revisar", "no_pasa"]);

export const characters = pgTable(
  "characters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: tipoPersonaje("kind").notNull(),
    /** Especie o notas del animal; en personas sirve para matices que no son descripción de escena. */
    speciesNotes: text("species_notes").notNull().default(""),
    description: text("description").notNull().default(""),
    /**
     * Ficha de apariencia (0.15.0): lo que se añade al prompt como contexto de generación. Estos cinco campos
     * y `description` son los que **versionan**; el nombre y las notas de especie, no. Se guardan aquí porque
     * son el valor vigente que edita el formulario; su instantánea vive en `character_versions`.
     */
    traits: text("traits").notNull().default(""),
    style: text("style").notNull().default(""),
    wardrobe: text("wardrobe").notNull().default(""),
    personality: text("personality").notNull().default(""),
    /** Voz **prevista**, solo declarada: la voz real llega en 0.21.0. */
    voice: text("voice").notNull().default(""),
    /**
     * Personaje **inventado** (0.22.0): no existe, nace de una descripción y su cara se genera. Se guarda en la
     * fila del personaje además de en su consentimiento porque es una **puerta** que se comprueba en cada foto
     * que se intenta añadir y en cada texto que se guarda, y leer el consentimiento vigente para cada una de esas
     * comprobaciones sería releer la misma respuesta una y otra vez.
     *
     * No se puede cambiar después de crearlo: un personaje que dejara de ser inventado tendría ya generadas
     * vistas de una cara sin consentimiento de nadie.
     */
    virtual: boolean("virtual").notNull().default(false),
    /**
     * **La voz se fija por personaje** (0.25.0), no por escena: es parte de quién es, como su cara. Son los
     * cinco ejes de `lib/direccion.ts` (género, edad, gravedad, textura y entrega) y, opcionalmente, una de las
     * voces predefinidas del proveedor sobre la que se matizan.
     *
     * Cambiarlos **crea versión de personaje** e invalida su registro de voz en el proveedor, por lo mismo que
     * lo invalida cambiar la ficha: lo que se registró era la voz de antes.
     *
     * Vacío por defecto y no con los ejes de fábrica: así se distingue un personaje que todavía no ha elegido
     * voz de uno que ha elegido precisamente la de fábrica, y solo el segundo invalida algo al cambiarla.
     */
    /**
     * **Estética de modelo, solo en personajes inventados y solo si el usuario la pide** (decisión firme del
     * propietario, 2026-09-28). Es lo que pone a `true` el `atractivoElegido` del método 6C.
     *
     * Con una persona real **no se aplica nunca**, valga lo que valga esta columna: la puerta está en el
     * compositor (`direccion/fotograma.ts`), no en la interfaz, porque una puerta que solo vive en un
     * formulario se salta con una petición.
     */
    beautyOptIn: boolean("beauty_opt_in").notNull().default(false),
    voiceAxes: jsonb<Record<string, string>>("voice_axes").notNull().default({}),
    voicePresetId: text("voice_preset_id").notNull().default(""),
    /**
     * **Hoja de identidad 3×3** (0.25.0): una sola imagen con nueve retratos del personaje (frente, perfiles,
     * tres cuartos, miradas y expresiones), generada desde sus referencias.
     *
     * Nace **siempre** como `candidata` y no sustituye a las vistas sueltas por decreto (decisión firme del
     * propietario, 2026-09-28): Jev compara en sombra los clips hechos con una y con otras, y la hoja pasa a
     * `por_defecto` solo si gana en esa métrica y el propietario lo aprueba.
     */
    identitySheetMediaId: uuid("identity_sheet_media_id").references(() => media.id, { onDelete: "set null" }),
    identitySheetStatus: estadoHojaIdentidad("identity_sheet_status").notNull().default("candidata"),
    state: estadoPersonaje("state").notNull().default("borrador"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Dos personajes del mismo usuario no se llaman igual: elegir en «Crear» sería una lotería.
    unique("characters_propietario_nombre_uq").on(t.ownerId, t.name),
    index("characters_propietario_idx").on(t.ownerId, t.createdAt),
    index("characters_estado_idx").on(t.state),
  ],
);

/**
 * Registro de consentimiento de un personaje. Hay **como mucho uno vigente** por personaje (restricción
 * parcial en la migración); los revocados se conservan porque son la prueba de lo que se declaró.
 */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    holderType: titularConsentimiento("holder_type").notNull(),
    /**
     * Declaración de mayoría de edad. Es obligatoria para registrar: un control, no una garantía. El titular
     * `inventado` es el único que no la declara, porque no hay ninguna persona cuya edad declarar.
     */
    adultDeclared: boolean("adult_declared").notNull().default(false),
    /**
     * Declaración de que el personaje es inventado y no representa a ninguna persona real (0.22.0). Obligatoria
     * para el titular `inventado` y siempre `false` en los demás. Con `registered_by` y `registered_at` ya
     * guardados aquí, la declaración queda con su cuenta y su fecha, que es lo que hay que poder demostrar.
     */
    syntheticDeclared: boolean("synthetic_declared").notNull().default(false),
    /**
     * Declaración de que el titular acepta que **su cara se envíe al servicio de comprobación de coherencia**
     * (0.24.0). Es una declaración aparte y no se deduce de ninguna otra a propósito: comprobar que una vista
     * generada es la misma persona obliga a mandar su cara a un modelo que **no es** el que genera, y un
     * consentimiento firmado para generar vídeo no dice nada de eso.
     *
     * Sin ella, un personaje **real** no se comprueba: su vista generada se queda `sin_comprobar`, no cubre en la
     * cobertura y la ficha explica qué falta. Un personaje **inventado** no la necesita, porque no hay ninguna
     * persona cuya cara salga de aquí.
     */
    coherenceDeclared: boolean("coherence_declared").notNull().default(false),
    usageScope: alcanceUso("usage_scope").notNull().default("personal"),
    /**
     * Documento firmado del tercero, guardado como medio de la biblioteca. `set null` a propósito: si el
     * usuario borra el documento, el registro sigue existiendo y el personaje queda sin prueba, que es
     * información y no un hueco silencioso.
     */
    documentMediaId: uuid("document_media_id").references(() => media.id, { onDelete: "set null" }),
    registeredBy: uuid("registered_by").references(() => users.id, { onDelete: "set null" }),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** Resultado de la revisión humana: `true` aceptado, `false` rechazado, `null` sin revisar. */
    reviewApproved: boolean("review_approved"),
    /** Nota de la revisión, visible para el dueño del personaje: sin ella un rechazo no dice nada. */
    reviewNote: text("review_note").notNull().default(""),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason").notNull().default(""),
  },
  (t) => [
    index("consent_records_personaje_idx").on(t.characterId, t.registeredAt),
    /**
     * Un personaje tiene como mucho un consentimiento **sin revocar**: los revocados se conservan porque son la
     * prueba de lo que se declaró, pero dos vigentes a la vez harían ambigua la respuesta de «puede generar».
     * Se declara aquí, y no solo en el SQL de la migración, para que el esquema sea la única fuente de verdad y
     * `db:generate` no proponga borrarlo en la siguiente migración.
     */
    uniqueIndex("consent_records_personaje_vigente_uq").on(t.characterId).where(sql`${t.revokedAt} is null`),
  ],
);

export const characterReferences = pgTable(
  "character_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    origin: origenReferencia("origin").notNull().default("foto_original"),
    /** Vista declarada por el usuario en texto libre (0.13.0); se conserva tal cual. */
    declaredView: text("declared_view").notNull().default(""),
    /**
     * Vista normalizada al catálogo de `lib/captura-personaje.ts` (0.14.0), que es la que cuenta para la
     * cobertura. Es la vista **que pidió la guía** o la que eligió el usuario: sin modelo no hay detección
     * real de la vista, y fingirla sería inventar un dato. Vacío = sin clasificar.
     */
    viewKey: text("view_key").notNull().default(""),
    /** Medidas del control de calidad, tal como estaban al añadir la foto. `null` en lo anterior a 0.14.0. */
    width: integer("width"),
    height: integer("height"),
    /** Varianza del laplaciano (nitidez) y luminancia media, las dos en la escala 0–255. */
    sharpness: real("sharpness"),
    brightness: real("brightness"),
    /** Proporción de la cara medida **en el navegador**; `null` donde no hay detector. */
    faceRatio: real("face_ratio"),
    /**
     * Huella perceptual (dHash de 64 bits en hexadecimal) con la que se detectan los duplicados antes de
     * guardar. No permite reconstruir la foto: solo comparar dos fotos entre sí.
     */
    phash: text("phash"),
    /**
     * Motivo por el que el control de calidad marcó la foto, si el usuario la añadió «de todas formas». No
     * es un rechazo (lo rechazado no se guarda): es la razón por la que la ficha la sigue señalando.
     */
    rejectionReason: text("rejection_reason"),
    /**
     * Veredicto **vigente** de la comprobación de identidad (0.24.0): si esta vista generada es la misma persona
     * que la cara de referencia del personaje.
     *
     * Aquí y no derivado de `coherence_decisions` porque es lo que lee la cobertura en cada carga de la ficha, y
     * porque es el veredicto *actual* de esta foto: la historia de cómo se llegó a él está en esa tabla. Solo
     * tiene sentido en una `vista_generada` de un personaje **real**; en un inventado su cara **es** la generada
     * y en una foto original no hay nada que comparar, así que las dos se quedan en `sin_comprobar`.
     */
    identityVerdict: veredictoIdentidad("identity_verdict").notNull().default("sin_comprobar"),
    /** Por qué, escrito para el usuario. Vacío mientras no se haya comprobado. */
    identityReason: text("identity_reason").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // La misma foto no se añade dos veces al mismo personaje.
    unique("character_references_personaje_medio_uq").on(t.characterId, t.mediaId),
    index("character_references_personaje_idx").on(t.characterId, t.sortOrder),
    // Índice de la comprobación de uso en el borrado definitivo de un medio.
    index("character_references_medio_idx").on(t.mediaId),
    // Índice de la detección de duplicados: se comparan solo las huellas del mismo personaje.
    index("character_references_huella_idx").on(t.characterId, t.phash),
  ],
);

/**
 * Registro de accesos de administración a un consentimiento. Quien administra puede abrir el documento de
 * identidad de un tercero, que es la capacidad más delicada de la instalación: cada vez que lo hace queda
 * escrito quién, cuándo y sobre qué personaje. Sin este registro, «solo el admin lo ve» no se puede auditar.
 *
 * No guarda el contenido de nada: solo el hecho del acceso.
 */
export const consentAccessLog = pgTable(
  "consent_access_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Quién accedió; `null` si la cuenta se ha borrado después (el hecho del acceso no desaparece). */
    adminId: uuid("admin_id").references(() => users.id, { onDelete: "set null" }),
    /** Sobre qué personaje; `set null` por lo mismo: el registro sobrevive al borrado del personaje. */
    characterId: uuid("character_id").references(() => characters.id, { onDelete: "set null" }),
    /** `listado` (la cola de revisión), `ficha` (abrir un personaje) o `revision` (aceptar o rechazar). */
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consent_access_log_fecha_idx").on(t.createdAt), index("consent_access_log_admin_idx").on(t.adminId)],
);

/**
 * Instantánea de lo que versiona: la ficha de apariencia y la descripción, tal como estaban al crear la
 * versión. Se guarda entera y no por referencia: una versión tiene que seguir diciendo lo que decía aunque
 * la fila del personaje cambie después, porque es lo que se envió al proveedor.
 */
export interface HojaDeFicha {
  rasgos: string;
  estilo: string;
  vestuario: string;
  personalidad: string;
  voz: string;
  descripcion: string;
}

/**
 * Versiones de la ficha de un personaje (0.15.0). Cada cambio de **apariencia o de prompt** —ficha,
 * descripción o referencias— crea una fila; el nombre y las notas de especie no.
 *
 * Las versiones **no se borran nunca**: son la trazabilidad de lo que ya se generó. Los trabajos citan la
 * versión con la que salieron (`generation_jobs.character_version_id`), así que un trabajo hecho con la 2
 * sigue apuntando a la 2 después de crear la 3. Solo desaparecen al borrar el personaje, en cascada.
 */
export const characterVersions = pgTable(
  "character_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    /** Número correlativo dentro del personaje, empezando en 1. */
    number: integer("number").notNull(),
    sheet: jsonb<HojaDeFicha>("sheet").notNull(),
    /** Medios de referencia incluidos, en su orden. No es una clave ajena: es lo que había, no lo que hay. */
    referenceMediaIds: jsonb<string[]>("reference_media_ids").notNull(),
    /**
     * Vista de cada referencia, en el **mismo orden** que `reference_media_ids`; cadena vacía = sin clasificar.
     * Va aparte y no dentro de `sheet` porque es una lista paralela a la de fotos, no un campo de la ficha.
     * Cambiar la vista de una foto cambia qué fotos se envían al proveedor (se eligen por cobertura), así que
     * versiona: sin esta columna, clasificar una foto no crearía versión y el historial mentiría.
     */
    referenceViewKeys: jsonb<string[]>("reference_view_keys").notNull().default([]),
    /**
     * Hoja de personaje: montaje de las referencias compuesto **en el servidor**, sin IA y sin coste. Se
     * guarda en la biblioteca del usuario; `set null` porque puede borrarla desde allí y la versión sigue
     * siendo válida.
     */
    sheetMediaId: uuid("sheet_media_id").references(() => media.id, { onDelete: "set null" }),
    /** Motivo del cambio que escribió el usuario. Vacío en la primera versión. */
    changeReason: text("change_reason").notNull().default(""),
    /** Qué campos cambiaron respecto a la anterior: es el resumen que se muestra en el historial. */
    changedFields: jsonb<string[]>("changed_fields").notNull(),
    /** Cuántas aprobaciones quedaron invalidadas al crearla. */
    invalidatedApprovals: integer("invalidated_approvals").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Dos versiones no comparten número: el número es el que se cita en los trabajos y en el historial.
    unique("character_versions_personaje_numero_uq").on(t.characterId, t.number),
    index("character_versions_personaje_idx").on(t.characterId, t.number),
  ],
);

/**
 * Aprobaciones que dependen de una versión del personaje. Es la base de las aprobaciones de guion y escenas
 * (0.17.0) y de la revisión de continuidad (0.20.0): aquí se registran y, sobre todo, se **invalidan** cuando
 * la apariencia cambia. Una aprobación invalidada no se borra: deja escrito con qué versión se aprobó, cuándo
 * dejó de valer y qué la invalidó, porque eso es justo lo que hay que volver a revisar.
 */
export const characterApprovals = pgTable(
  "character_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    /** Versión con la que se aprobó. Cascada: sin versión no hay aprobación que revisar. */
    characterVersionId: uuid("character_version_id")
      .notNull()
      .references(() => characterVersions.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** Qué se aprobó, en palabras del usuario. */
    subject: text("subject").notNull().default(""),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    /** Qué la invalidó, en lenguaje llano y con la acción concreta que hace falta. */
    invalidationReason: text("invalidation_reason").notNull().default(""),
    /** Versión que la invalidó. `set null` para no perder la aprobación si algo borra esa versión. */
    invalidatedByVersionId: uuid("invalidated_by_version_id").references((): AnyPgColumn => characterVersions.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("character_approvals_personaje_idx").on(t.characterId, t.approvedAt),
    // Índice de la invalidación: al crear una versión se buscan las aprobaciones vigentes del personaje.
    index("character_approvals_version_idx").on(t.characterVersionId),
  ],
);

/**
 * Registro de un personaje en Gemini Omni (RF02 y RF08, 0.22.0): la cara y la voz que el proveedor guarda con un
 * identificador propio y que todas las escenas habladas citan.
 *
 * **Uno por versión de la ficha** (decisión provisional del propietario, 2026-09-28): cambiar la ficha crea
 * versión nueva y obliga a registrar otra vez, porque lo que se envió al proveedor era la ficha anterior y su
 * retrato. No hay restricción de unicidad sobre la versión a propósito: si el proveedor caduca un identificador,
 * se registra de nuevo sin coste y la fila nueva es la vigente (la más reciente), y la anterior se conserva
 * porque explica con qué identidad salió lo que ya se generó.
 *
 * `credits_spent` existe y vale siempre 0: los dos registros son gratis (medido el 2026-09-28) y **decirlo con un
 * dato** es lo que permite auditar que este camino no cobra, en lugar de prometerlo en un comentario.
 */
export const characterOmniRegistrations = pgTable(
  "character_omni_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    characterId: uuid("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    /** Versión de la ficha que se registró. Cascada: sin versión, el registro no dice con qué cara salió. */
    characterVersionId: uuid("character_version_id")
      .notNull()
      .references(() => characterVersions.id, { onDelete: "cascade" }),
    /** Voz Omni del proyecto que se citó al registrar (`projects.omni_audio_id`). */
    audioId: text("audio_id").notNull(),
    /** Identificador del personaje en el proveedor. Es lo que viaja en `character_ids` al generar. */
    remoteCharacterId: text("remote_character_id").notNull(),
    /** URL con la que el proveedor aloja el retrato registrado. Se guarda para poder enseñarlo tal cual lo tiene. */
    remoteImageUrl: text("remote_image_url").notNull().default(""),
    remoteBodyImageUrl: text("remote_body_image_url").notNull().default(""),
    /**
     * Retrato de la biblioteca que se envió. `set null`: si el usuario lo borra, el registro sigue siendo cierto
     * (la imagen ya está en el proveedor) y perder esa referencia no puede borrar el hecho.
     */
    portraitMediaId: uuid("portrait_media_id").references(() => media.id, { onDelete: "set null" }),
    bodyMediaId: uuid("body_media_id").references(() => media.id, { onDelete: "set null" }),
    /** Créditos que costó. Siempre 0: los dos endpoints de registro son gratuitos. */
    creditsSpent: real("credits_spent").notNull().default(0),
    registeredBy: uuid("registered_by").references(() => users.id, { onDelete: "set null" }),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Cuándo dejó de valer y por qué: hoy solo cuando el proveedor rechaza el identificador por caducado y hay que
     * registrar otra vez. `null` mientras siga valiendo.
     */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededReason: text("superseded_reason").notNull().default(""),
  },
  (t) => [
    index("character_omni_registrations_personaje_idx").on(t.characterId, t.registeredAt),
    index("character_omni_registrations_version_idx").on(t.characterVersionId),
  ],
);

export type FilaRegistroOmni = typeof characterOmniRegistrations.$inferSelect;

export type FilaPersonaje = typeof characters.$inferSelect;
export type FilaVersionPersonaje = typeof characterVersions.$inferSelect;
export type FilaAprobacion = typeof characterApprovals.$inferSelect;
export type FilaConsentimiento = typeof consentRecords.$inferSelect;
export type FilaReferencia = typeof characterReferences.$inferSelect;
