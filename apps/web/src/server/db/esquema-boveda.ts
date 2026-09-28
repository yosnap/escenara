import { integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./esquema-auth";

/**
 * Bóveda de secretos (ADR-0005). Todo lo que se guarda aquí está cifrado con la clave maestra del
 * servidor: ninguna columna contiene un secreto en claro. `hint` son los cuatro últimos caracteres, lo
 * único que se muestra en la interfaz para reconocer una clave.
 */

/**
 * `elevenlabs` se añade en la 0.21.0: es el proveedor de voz de reserva, con **credencial propia del usuario**
 * igual que KIE. El mismo enum lo usan los apuntes de gasto, los trabajos, los precios del catálogo y las
 * muestras de voz, así que un solo valor nuevo cubre los cinco.
 */
/**
 * `compatible` se añade en la 0.21.1 y **no es un proveedor concreto**: es el género «servicio compatible con la
 * API de OpenAI» que cada usuario da de alta con su nombre, su URL base y su lista de modelos
 * (`openai_providers`). En los apuntes de gasto y en las ejecuciones del asistente, cuál de ellos era se guarda
 * en `provider_name`, porque el enum no puede crecer con cada servicio que alguien añada.
 */
export const proveedorCredencial = pgEnum("credential_provider", ["kie", "google", "elevenlabs", "compatible"]);
export const estadoCredencial = pgEnum("credential_status", ["valida", "invalida"]);

/**
 * Clave de API de un proveedor de IA que aporta el propio usuario (BYOK, RF01). Una por usuario y
 * proveedor: rotar es sustituirla, y solo se sustituye si la nueva pasa la prueba.
 */
export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: proveedorCredencial("provider").notNull(),
    /** Valor cifrado (`v1.<idClave>.<iv>.<tag>.<datos>`) con contexto `credencial:<userId>:<provider>`. */
    secret: text("secret").notNull(),
    hint: text("hint").notNull(),
    status: estadoCredencial("status").notNull().default("valida"),
    /** Código propio del último resultado (p. ej. `ok`, `rechazada`, `sin-red`); nunca texto del proveedor. */
    lastTestCode: text("last_test_code"),
    /** Dato público que devuelve la prueba, si lo hay (créditos de KIE). */
    lastTestDetail: text("last_test_detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    testedAt: timestamp("tested_at", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  },
  // El índice único por (usuario, proveedor) sirve además para listar las credenciales de un usuario.
  (t) => [unique("provider_credentials_usuario_proveedor_uq").on(t.userId, t.provider)],
);

/**
 * Servicios compatibles con la API de OpenAI que da de alta **cada usuario** (0.21.1). A diferencia de
 * `provider_credentials`, aquí puede haber varios por persona: son proveedores de texto que se cobran por cuota o
 * por plan, no por petición, y sirven de **reserva** cuando el modelo de texto del catálogo falla.
 *
 * La URL base la escribe el usuario, así que es la única entrada de la bóveda que puede apuntar a donde quiera:
 * se valida contra la protección frente a SSRF antes de guardarla y antes de cada llamada (solo https, host que
 * resuelve a IP públicas y conexión fijada a la IP comprobada).
 */
export const openaiProviders = pgTable(
  "openai_providers",
  {
    /**
     * Lo genera el servidor **antes** de insertar: es parte del contexto de cifrado del secreto
     * (`compatible:<userId>:<id>`), que tiene que ser estable desde la primera escritura.
     */
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Nombre visible que le pone el usuario («NaN builders»). Único por usuario. */
    name: text("name").notNull(),
    /** URL base del servicio, sin barra final («https://api.nan.builders/v1»). */
    baseUrl: text("base_url").notNull(),
    /** Valor cifrado (`v1.<idClave>.<iv>.<tag>.<datos>`) con contexto `compatible:<userId>:<id>`. */
    secret: text("secret").notNull(),
    hint: text("hint").notNull(),
    /** Modelos de texto **en el orden en que se prueban**. El primero es el preferido. */
    models: text("models").array().notNull().default([]),
    status: estadoCredencial("status").notNull().default("valida"),
    /** Código propio del último resultado; nunca texto del proveedor. */
    lastTestCode: text("last_test_code"),
    /** Dato público de la última prueba (cuántos modelos ofrece); nunca texto libre del proveedor. */
    lastTestDetail: text("last_test_detail"),
    /** Orden en que se recorren los proveedores de un usuario cuando hay más de uno. */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    testedAt: timestamp("tested_at", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  },
  (t) => [unique("openai_providers_usuario_nombre_uq").on(t.userId, t.name)],
);

/**
 * Secretos de la instalación que se configuran en Admin › Ajustes (contraseña SMTP y secretos OAuth).
 * Tabla aparte de `settings` para que ningún secreto pueda acabar en una columna en claro.
 */
export const installationSecrets = pgTable("installation_secrets", {
  key: text("key").primaryKey(),
  /** Valor cifrado con contexto `ajuste:<key>`. */
  value: text("value").notNull(),
  hint: text("hint").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export type FilaCredencial = typeof providerCredentials.$inferSelect;
export type FilaCompatible = typeof openaiProviders.$inferSelect;
export type FilaSecreto = typeof installationSecrets.$inferSelect;
