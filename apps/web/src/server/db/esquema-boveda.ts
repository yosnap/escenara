import { pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
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
export const proveedorCredencial = pgEnum("credential_provider", ["kie", "google", "elevenlabs"]);
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
export type FilaSecreto = typeof installationSecrets.$inferSelect;
